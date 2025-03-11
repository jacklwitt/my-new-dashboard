import { NextResponse } from 'next/server';
import { validateEnv } from '@/utils/env';
import OpenAI from 'openai';
import { fetchSpreadsheetData, getDataMetadata } from '@/lib/data';
import { ChatCompletion } from 'openai/resources';

// Move function declaration outside the try block
async function getCompletion(
  openai: OpenAI,
  model: 'gpt-4' | 'gpt-3.5-turbo',
  systemPrompt: string,
  targetProduct: string
): Promise<ChatCompletion> {
  console.log(`Attempting with model: ${model}`);
  const timeoutDuration = model === 'gpt-4' ? 8000 : 9000; // 8s for GPT-4, 9s for GPT-3.5
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${model} API call timed out after ${timeoutDuration/1000}s`));
    }, timeoutDuration);
  });

  const completionPromise = openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `Please provide detailed recommendations for ${targetProduct} based on the analysis.` 
      }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  }, {
    timeout: timeoutDuration - 1000 // Add timeout to request options instead
  });

  return Promise.race([completionPromise, timeoutPromise]);
}

// Add a helper function to ensure bullet points are properly formatted
function formatAdviceResponse(advice: string): string {
  // First check if the response already contains bullet points
  if (advice.includes('•') || advice.includes('-') || advice.includes('*')) {
    // Split by common bullet point markers
    const lines = advice.split(/(?:\r\n|\r|\n)+/);
    
    // Process each line to ensure proper spacing and HTML formatting
    const formattedLines = lines.map(line => {
      // Trim whitespace
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) return '';
      
      // Check if line starts with a bullet point marker
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // Return with added spacing and preserved bullet
        return trimmed;
      }
      
      // Add bullet if line doesn't have one but appears to be a bullet point
      if (trimmed.match(/^\d+\.\s/)) {
        return trimmed;
      }
      
      // Default - add bullet if it doesn't have one
      return `• ${trimmed}`;
    });
    
    // Join with double line breaks to ensure proper spacing
    return formattedLines.filter(Boolean).join('\n\n');
  }
  
  // If no bullet points found, add them by splitting on sentences
  const sentences = advice.split(/(?<=\.)\s+/);
  return sentences.map(s => s.trim()).filter(Boolean).map(s => `• ${s}`).join('\n\n');
}

export async function GET() {
  console.log('Advice API called');
  
  try {
    // Get actual data from spreadsheet
    console.log('Fetching spreadsheet data for advice...');
    const { data } = await fetchSpreadsheetData();
    const rows = data.slice(1); // Skip header row
    
    // Get metadata about the data
    const metadata = getDataMetadata(data);
    
    // Perform basic data analysis - similar to chat handler approach
    // Calculate product sales
    const productSales: Record<string, number> = {};
    const locationSales: Record<string, number> = {};
    const monthlySales: Record<string, number> = {};
    
    // Process rows to extract insights
    rows.forEach(row => {
      // Extract key data
      const date = new Date(row[1]); // Column B is Purchase_Date
      const location = row[3]; // Column D is Store_Location
      const product = row[4]; // Column E is Product_Name
      const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
      
      // Track product sales
      if (!productSales[product]) productSales[product] = 0;
      productSales[product] += amount;
      
      // Track location sales
      if (!locationSales[location]) locationSales[location] = 0;
      locationSales[location] += amount;
      
      // Track monthly sales
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
      monthlySales[monthKey] += amount;
    });
    
    // Find top products
    const topProducts = Object.entries(productSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([product, sales]) => ({ product, sales }));
    
    // Find top locations
    const topLocations = Object.entries(locationSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([location, sales]) => ({ location, sales }));
    
    // Create data summary for prompt
    const dataInsights = {
      totalProducts: metadata.availableProducts.length,
      totalLocations: metadata.availableLocations.length,
      dateRange: [metadata.timeRange[0], metadata.timeRange[metadata.timeRange.length-1]],
      topProducts,
      topLocations,
      monthlySalesTrend: Object.entries(monthlySales)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, sales]) => ({ month, sales }))
    };
    
    // Create actual data-driven prompt
    const prompt = `You are a data-driven business analyst providing concise, actionable recommendations.

IMPORTANT INSTRUCTIONS:
1. Focus on CURRENT PERIOD recommendations (not historical months like August)
2. ONLY make claims directly supported by the data provided
3. Format your response in SHORT, EASY-TO-READ bullet points or short paragraphs
4. Keep your recommendation UNDER 100 WORDS TOTAL
5. Quantify insights with precise numbers ($X,XXX.XX format)
6. Focus on the MAIN insights from the data - don't try to cover everything

DATA SUMMARY:
- Products analyzed: ${dataInsights.totalProducts}
- Locations: ${dataInsights.totalLocations} 
- Date range: ${dataInsights.dateRange[0]} to ${dataInsights.dateRange[1]}

TOP PERFORMING PRODUCTS:
${dataInsights.topProducts.map((p, i) => `${i+1}. ${p.product}: $${p.sales.toLocaleString()}`).join('\n')}

TOP PERFORMING LOCATIONS:
${dataInsights.topLocations.map((l, i) => `${i+1}. ${l.location}: $${l.sales.toLocaleString()}`).join('\n')}

MONTHLY SALES TREND:
${dataInsights.monthlySalesTrend.map(m => `${m.month}: $${m.sales.toLocaleString()}`).join('\n')}

Based ONLY on this data, provide ONE specific, immediately actionable recommendation to improve sales. Format your response with clear spacing and bullet points where appropriate.`;
    
    try {
      // Use GPT-4o-mini
      console.log('Requesting advice with GPT-4o-mini based on actual data...');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY as string,
      });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.4,
        max_tokens: 250
      });
      
      const advice = completion.choices[0]?.message?.content?.trim();
      
      if (advice) {
        console.log('Generated data-driven advice successfully with GPT-4o-mini');
        const formattedAdvice = formatAdviceResponse(advice);
        return NextResponse.json({ advice: formattedAdvice });
      } else {
        throw new Error('Empty response from OpenAI');
      }
    } catch (error: unknown) {
      console.error('Error with GPT-4o-mini:', error);
      
      // Check specifically for quota error
      if (
        typeof error === 'object' && 
        error !== null && 
        ('code' in error && error.code === 'insufficient_quota' || 
        ('message' in error && typeof error.message === 'string' && error.message.includes('quota')))
      ) {
        console.log('Quota exceeded - using static advice');
        
        // Return a static advice based on the data we already analyzed
        const topProduct = dataInsights.topProducts[0]?.product;
        const nextProduct = dataInsights.topProducts[1]?.product;
        
        return NextResponse.json({
          advice: `Based on sales data analysis, consider creating a bundle promotion featuring your top-selling product (${topProduct}) paired with ${nextProduct} to boost overall revenue and capitalize on existing customer preferences.`,
          note: "Static analysis due to OpenAI API quota limits"
        });
      }
      
      // Fallback to GPT-4o-mini
      try {
        console.log('Falling back...');
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY as string,
        });
        
        const fallbackCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
          temperature: 0.4,
          max_tokens: 150
        });
        
        const fallbackAdvice = fallbackCompletion.choices[0]?.message?.content?.trim();
        
        if (fallbackAdvice) {
          console.log('Generated advice with GPT-4o-mini fallback');
          const formattedFallbackAdvice = formatAdviceResponse(fallbackAdvice);
          return NextResponse.json({ 
            advice: formattedFallbackAdvice,
            note: "Used fallback model (GPT-4o-mini)" 
          });
        }
      } catch (fallbackError) {
        console.error('Error with fallback model:', fallbackError);
      }
      
      // Last resort - use the top product and location data we already calculated
      const topProduct = dataInsights.topProducts[0]?.product || "best-selling products";
      const topLocation = dataInsights.topLocations[0]?.location || "top locations";
      
      return NextResponse.json({ 
        advice: `Focus on promoting ${topProduct} in ${topLocation} to capitalize on their proven performance, while expanding successful selling strategies to other locations.`,
        note: "Using data-derived fallback advice due to API issues"
      });
    }
  } catch (error) {
    console.error('Advice API Error:', error);
    return NextResponse.json({ 
      advice: "Analyze your monthly sales trends to identify peak periods, then create targeted promotions for your highest-performing products during those timeframes.",
      note: "Using general fallback advice due to data processing issues"
    });
  }
}

// Add product-specific context functionality
export async function POST(request: Request) {
  try {
    // Get the product from the request if available
    const body = await request.json().catch(() => ({}));
    const productTarget = body.product || null;
    
    console.log('Advice API called', productTarget ? `for product: ${productTarget}` : '');
    
    // Get actual data from spreadsheet
    console.log('Fetching spreadsheet data for advice...');
    const { data } = await fetchSpreadsheetData();
    const rows = data.slice(1); // Skip header row
    
    // Get metadata about the data
    const metadata = getDataMetadata(data);
    
    // Perform basic data analysis for all products
    // Calculate product sales
    const productSales: Record<string, number> = {};
    const locationSales: Record<string, number> = {};
    const monthlySales: Record<string, number> = {};
    
    // Process rows to extract insights
    rows.forEach(row => {
      // Extract key data
      const date = new Date(row[1]); // Column B is Purchase_Date
      const location = row[3]; // Column D is Store_Location
      const product = row[4]; // Column E is Product_Name
      const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
      
      // Track product sales
      if (!productSales[product]) productSales[product] = 0;
      productSales[product] += amount;
      
      // Track location sales
      if (!locationSales[location]) locationSales[location] = 0;
      locationSales[location] += amount;
      
      // Track monthly sales
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
      monthlySales[monthKey] += amount;
    });
    
    // Find top products
    const topProducts = Object.entries(productSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([product, sales]) => ({ product, sales }));
    
    // Find top locations
    const topLocations = Object.entries(locationSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([location, sales]) => ({ location, sales }));
    
    // Create data summary for prompt
    const dataInsights = {
      totalProducts: metadata.availableProducts.length,
      totalLocations: metadata.availableLocations.length,
      dateRange: [metadata.timeRange[0], metadata.timeRange[metadata.timeRange.length-1]],
      topProducts,
      topLocations,
      monthlySalesTrend: Object.entries(monthlySales)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, sales]) => ({ month, sales }))
    };
    
    // If we have a specific product target, filter data for just that product
    let filteredRows = rows;
    if (productTarget) {
      filteredRows = rows.filter(row => row[4] === productTarget); // Column E is Product_Name
      
      if (filteredRows.length === 0) {
        return NextResponse.json({ 
          advice: `No data found for product: ${productTarget}`,
          note: "Product not found in data"
        });
      }
    }
    
    // Process product-specific data
    const productData: {
      name: string | null;
      totalSales: number;
      monthlySales: Record<string, number>;
      locationSales: Record<string, number>;
      timeOfDaySales: Record<string, number>;
      dayOfWeekSales: Record<string, number>;
    } = {
      name: productTarget,
      totalSales: 0,
      monthlySales: {},
      locationSales: {},
      timeOfDaySales: {},
      dayOfWeekSales: {}
    };
    
    filteredRows.forEach(row => {
      const date = new Date(row[1]); // Column B is Purchase_Date
      const location = row[3]; // Column D is Store_Location
      const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
      
      // Total sales
      productData.totalSales += amount;
      
      // Monthly sales
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!productData.monthlySales[monthKey]) productData.monthlySales[monthKey] = 0;
      productData.monthlySales[monthKey] += amount;
      
      // Location sales
      if (!productData.locationSales[location]) productData.locationSales[location] = 0;
      productData.locationSales[location] += amount;
      
      // Time of day
      const hour = date.getHours();
      const timeOfDay = 
        hour >= 6 && hour < 12 ? 'morning' :
        hour >= 12 && hour < 17 ? 'afternoon' :
        hour >= 17 && hour < 21 ? 'evening' : 'night';
      
      if (!productData.timeOfDaySales[timeOfDay]) productData.timeOfDaySales[timeOfDay] = 0;
      productData.timeOfDaySales[timeOfDay] += amount;
      
      // Day of week
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      if (!productData.dayOfWeekSales[dayOfWeek]) productData.dayOfWeekSales[dayOfWeek] = 0;
      productData.dayOfWeekSales[dayOfWeek] += amount;
    });
    
    // Update product-specific prompt to be more balanced
    const prompt = productTarget ? 
      `You are providing specific advice for the product: ${productTarget}.

IMPORTANT INSTRUCTIONS:
1. Analyze ALL the provided data points for this product (location, time, day, month)
2. EVALUATE which 2-3 factors show the strongest patterns that could be leveraged
3. Provide 2-3 SPECIFIC, ACTIONABLE recommendations based on the most significant patterns
4. Format your response as bullet points
5. Keep your recommendations UNDER 120 WORDS TOTAL
6. Use precise numbers from the data provided

PRODUCT DATA:
- Total Sales: $${productData.totalSales.toLocaleString()}

TOP PERFORMING LOCATIONS:
${Object.entries(productData.locationSales)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 3)
  .map(([location, sales], i) => `${i+1}. ${location}: $${sales.toLocaleString()}`)
  .join('\n')}

MONTHLY SALES TREND:
${Object.entries(productData.monthlySales)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, sales]) => `${month}: $${sales.toLocaleString()}`)
  .join('\n')}

TIME OF DAY PERFORMANCE:
${Object.entries(productData.timeOfDaySales)
  .sort(([, a], [, b]) => b - a)
  .map(([time, sales]) => `${time}: $${sales.toLocaleString()}`)
  .join('\n')}

DAY OF WEEK PERFORMANCE:
${Object.entries(productData.dayOfWeekSales)
  .sort(([, a], [, b]) => b - a)
  .map(([day, sales]) => `${day}: $${sales.toLocaleString()}`)
  .join('\n')}

APPROACH OPTIONS TO CONSIDER:
1. Location-specific initiatives (where shows greatest opportunity?)
2. Time of day promotions (is there a significantly underperforming time?)
3. Day of week promotions (which days show potential for growth?)
4. Seasonal/monthly strategies (are there clear seasonal patterns?)

Based on the data, provide the 2-3 MOST IMPACTFUL recommendations to increase sales of ${productTarget}. Focus on approaches that show the clearest patterns in the data.` 
      : 
      // Original general prompt for when no product is specified
      `You are a data-driven business analyst providing concise, actionable recommendations.

IMPORTANT INSTRUCTIONS:
1. Focus on CURRENT PERIOD recommendations (not historical months like August)
2. ONLY make claims directly supported by the data provided
3. Format your response in SHORT, EASY-TO-READ bullet points or short paragraphs
4. Keep your recommendation UNDER 100 WORDS TOTAL
5. Quantify insights with precise numbers ($X,XXX.XX format)
6. Focus on the MAIN insights from the data - don't try to cover everything

DATA SUMMARY:
- Products analyzed: ${dataInsights.totalProducts}
- Locations: ${dataInsights.totalLocations} 
- Date range: ${dataInsights.dateRange[0]} to ${dataInsights.dateRange[1]}

TOP PERFORMING PRODUCTS:
${dataInsights.topProducts.map((p, i) => `${i+1}. ${p.product}: $${p.sales.toLocaleString()}`).join('\n')}

TOP PERFORMING LOCATIONS:
${dataInsights.topLocations.map((l, i) => `${i+1}. ${l.location}: $${l.sales.toLocaleString()}`).join('\n')}

MONTHLY SALES TREND:
${dataInsights.monthlySalesTrend.map(m => `${m.month}: $${m.sales.toLocaleString()}`).join('\n')}

Based ONLY on this data, provide ONE specific, immediately actionable recommendation to improve sales. Format your response with clear spacing and bullet points where appropriate.`;
    
    // Continue with existing code to call the model but with the updated prompt
    try {
      // Use GPT-4o-mini
      console.log('Requesting advice with GPT-4o-mini based on actual data...');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY as string,
      });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.4,
        max_tokens: 250
      });
      
      const advice = completion.choices[0]?.message?.content?.trim();
      
      if (advice) {
        console.log('Generated data-driven advice successfully with GPT-4o-mini');
        const formattedAdvice = formatAdviceResponse(advice);
        return NextResponse.json({ advice: formattedAdvice });
      } else {
        throw new Error('Empty response from OpenAI');
      }
    } catch (error: unknown) {
      console.error('Error with GPT-4o-mini:', error);
      
      // Check specifically for quota error
      if (
        typeof error === 'object' && 
        error !== null && 
        ('code' in error && error.code === 'insufficient_quota' || 
        ('message' in error && typeof error.message === 'string' && error.message.includes('quota')))
      ) {
        console.log('Quota exceeded - using static advice');
        
        // Return a static advice based on the data we already analyzed
        const topProduct = dataInsights.topProducts[0]?.product;
        const nextProduct = dataInsights.topProducts[1]?.product;
        
        return NextResponse.json({
          advice: `Based on sales data analysis, consider creating a bundle promotion featuring your top-selling product (${topProduct}) paired with ${nextProduct} to boost overall revenue and capitalize on existing customer preferences.`,
          note: "Static analysis due to OpenAI API quota limits"
        });
      }
      
      // Fallback to GPT-4o-mini
      try {
        console.log('Falling back...');
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY as string,
        });
        
        const fallbackCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
          temperature: 0.4,
          max_tokens: 150
        });
        
        const fallbackAdvice = fallbackCompletion.choices[0]?.message?.content?.trim();
        
        if (fallbackAdvice) {
          console.log('Generated advice with GPT-4o-mini fallback');
          const formattedFallbackAdvice = formatAdviceResponse(fallbackAdvice);
          return NextResponse.json({ 
            advice: formattedFallbackAdvice,
            note: "Used fallback model (GPT-4o-mini)" 
          });
        }
      } catch (fallbackError) {
        console.error('Error with fallback model:', fallbackError);
      }
      
      // Last resort - use the top product and location data we already calculated
      const topProduct = dataInsights.topProducts[0]?.product || "best-selling products";
      const topLocation = dataInsights.topLocations[0]?.location || "top locations";
      
      return NextResponse.json({ 
        advice: `Focus on promoting ${topProduct} in ${topLocation} to capitalize on their proven performance, while expanding successful selling strategies to other locations.`,
        note: "Using data-derived fallback advice due to API issues"
      });
    }
  } catch (error) {
    console.error('Advice API Error:', error);
    return NextResponse.json({ 
      advice: "Analyze your monthly sales trends to identify peak periods, then create targeted promotions for your highest-performing products during those timeframes.",
      note: "Using general fallback advice due to data processing issues"
    });
  }
} 