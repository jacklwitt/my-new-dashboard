import { NextResponse } from 'next/server';
import { getDataMetadata, extractMonthYear, createSystemPrompt } from '@/lib/data';
import { analyzeProductPerformance, generateProductRecommendations } from './analyzers';
import OpenAI from 'openai';
import { validateEnv } from '@/utils/env';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Query-specific handlers for different types of questions

export async function handleGeneralQuery(question: string, conversation: any[], data: any[], context: any) {
  try {
    console.log("Starting data processing with spreadsheet rows:", data.length);
    
    // Add business advice intent detection
    const isBusinessAdviceQuery = /improve|increase|boost|grow|sales|revenue|performance|trend|strategy|recommendation|advice/i.test(question);
    
    // Get only essential metadata, skip complex calculations
    const metadata = getDataMetadata(data);
    console.log("Metadata extracted successfully");
    
    // Keep this line for downstream functions that need it
    const rows = data.slice(1); // Skip header row
    
    // Create improved system prompt with data summary and business advice instruction
    const systemPrompt = `You are a business analyst assistant with access to sales data.
      Products: ${metadata.availableProducts.length} products 
      Locations: ${metadata.availableLocations.join(', ')}
      Date range: ${metadata.timeRange[0]} to ${metadata.timeRange[metadata.timeRange.length-1]}
      
      IMPORTANT: When answering questions about improving sales, business strategy, or recommendations, ALWAYS analyze the data and provide SPECIFIC insights based on actual trends. Give data-backed recommendations, not generic advice.
      
      Always provide specific insights based on this data.`;
    
    // Implement the detailed data analysis for business advice queries
    if (isBusinessAdviceQuery) {
      console.log("Handling as business advice query - adding detailed analysis");
      
      // Calculate product sales trends
      const productSales: Record<string, number> = {};
      const monthlyTrends: Record<string, number> = {};
      const locationSales: Record<string, number> = {};
      const dayOfWeekSales: Record<string, number> = {};
      
      rows.forEach(row => {
        const date = new Date(row[1]); // Column B is Purchase_Date
        const location = row[3]; // Column D is Store_Location
        const product = row[4]; // Column E is Product_Name
        const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
        
        // Product sales
        if (!productSales[product]) productSales[product] = 0;
        productSales[product] += amount;
        
        // Monthly trends
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyTrends[monthKey]) monthlyTrends[monthKey] = 0;
        monthlyTrends[monthKey] += amount;
        
        // Location sales
        if (!locationSales[location]) locationSales[location] = 0;
        locationSales[location] += amount;
        
        // Day of week sales
        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        if (!dayOfWeekSales[dayOfWeek]) dayOfWeekSales[dayOfWeek] = 0;
        dayOfWeekSales[dayOfWeek] += amount;
      });
      
      // Format data for the prompt
      const topProducts = Object.entries(productSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([product, sales]) => `${product}: $${(sales as number).toLocaleString()}`);
      
      const topLocations = Object.entries(locationSales)
        .sort(([, a], [, b]) => b - a)
        .map(([location, sales]) => `${location}: $${(sales as number).toLocaleString()}`);
      
      const monthlyData = Object.entries(monthlyTrends)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, sales]) => `${month}: $${(sales as number).toLocaleString()}`);
      
      const dayOfWeekData = Object.entries(dayOfWeekSales)
        .sort(([, a], [, b]) => b - a)
        .map(([day, sales]) => `${day}: $${(sales as number).toLocaleString()}`);
      
      // Update the system prompt with specific data
      const businessDataPrompt = `You are a business analyst assistant with access to sales data.
        
IMPORTANT: Your responses must be SPECIFIC and DATA-DRIVEN based on the actual sales data provided below.

DATA ANALYSIS FOR BUSINESS ADVICE:
- Top 5 Products: ${topProducts.join(', ')}
- Top Locations: ${topLocations.join(', ')}
- Monthly Sales: ${monthlyData.join(', ')}
- Day of Week Performance: ${dayOfWeekData.join(', ')}

Based on this specific data, provide actionable business recommendations that directly address patterns and trends shown in the data. Do NOT give generic advice.

USER QUESTION: "${question}"`;
      
      // Use this enhanced prompt for the OpenAI request
      return await forwardToChatGPT(question, conversation, data, {
        customSystemPrompt: businessDataPrompt
      });
    }
    
    // Log right before API call
    console.log("About to call OpenAI API");
    
    // Check for product-specific analysis need
    if (context?.productFocus) {
      console.log(`Performing detailed analysis for ${context.productFocus}`);
      
      // Get detailed product data
      const productAnalysis = await analyzeProductPerformance(data, context.productFocus);
      
      // Create a detailed data-focused system prompt
      const systemPrompt = `
You are a data-driven business analyst. Your task is to provide ONLY fact-based insights and recommendations that are directly supported by the data.

Follow these strict guidelines:
1. ONLY make claims that are directly supported by the data provided
2. NEVER make generic recommendations - each recommendation must cite specific data points
3. Quantify all insights with precise numbers from the data
4. Format monetary values as $X,XXX.XX
5. ONLY suggest actions that directly address patterns in the data
6. Include expected impact based ONLY on actual data trends (no theoretical benefits)
7. DO NOT mention "expected outcomes" unless they're based on quantifiable data

USER QUESTION: "${question}"

PRODUCT DATA:
* Product: ${context.productFocus}
* Total Sales: $${productAnalysis.totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})}
* Average Order Value: $${productAnalysis.avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
* Sales by Month: ${JSON.stringify(productAnalysis.monthlyTrends.map(m => ({ 
    month: m.month, 
    sales: m.sales,
    growth: m.growth ? (m.growth * 100).toFixed(1) + '%' : 'N/A'
  })))}
* Top Locations: ${JSON.stringify(productAnalysis.topLocations.map(l => ({
    location: l.location,
    sales: l.sales,
    percentage: l.percentage.toFixed(1) + '%'
  })))}
* Time of Day Performance: ${JSON.stringify(productAnalysis.topTimeOfDay.map(t => ({
    timeSlot: t.timeSlot,
    sales: t.sales,
    percentage: t.percentage.toFixed(1) + '%'
  })))}
* Day of Week Performance: ${JSON.stringify(productAnalysis.topDaysOfWeek.map(d => ({
    day: d.day,
    sales: d.sales,
    percentage: d.percentage.toFixed(1) + '%'
  })))}
${productAnalysis.promotions?.length > 0 ? 
  `* Promotion Performance: ${JSON.stringify(productAnalysis.promotions.map(p => ({
    code: p.code,
    usageCount: p.usageCount,
    totalSales: p.totalSales,
    avgOrderValue: p.avgOrderValue
  })))}` : 
  '* No promotion data available'}
`;

      // Include all available data points
      const messages = [
        { role: "system", content: systemPrompt },
        // Add previous conversation if available
        ...(conversation?.map(msg => ({
          role: msg.role, 
          content: msg.content
        })) || []), 
        { role: "user", content: question }
      ];
      
      // Make request to ChatGPT API with proper error handling
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY as string,
      });
      
      console.log('Sending detailed data-driven request to OpenAI');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages as any,
        temperature: 0.5,
        max_tokens: 1000
      });
      
      console.log('OpenAI response received');
      return NextResponse.json({ answer: completion.choices[0].message.content });
    }
    
    // Create comprehensive analysis for all data dimensions
    let analysisData: Record<string, any> = {};
    
    // 1. PRODUCT ANALYSIS
    let productsAnalysis: Record<string, any> = {};
    
    if (context?.productFocus) {
      // Do detailed analysis only for the product in focus
      productsAnalysis = {
        [context.productFocus]: await analyzeProductPerformance(data, context.productFocus)
      };
    } else {
      // For general questions, include basic analysis of top products
      const productSales = metadata.availableProducts.map(product => {
        const sales = rows
          .filter(row => row[4] === product)
          .reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
        return { product, sales };
      }).sort((a, b) => b.sales - a.sales);
      
      // Include detailed analysis for top 3 products
      for (const { product } of productSales.slice(0, 3)) {
        productsAnalysis[product] = await analyzeProductPerformance(data, product);
      }
      
      // Include basic sales data for all products
      const allProductSales: Record<string, number> = {};
      for (const { product, sales } of productSales) {
        allProductSales[product] = sales;
      }
      
      // Add summary of all products
      productsAnalysis['_allProductsSummary'] = {
        sales: allProductSales,
        sortedByPerformance: productSales.map(p => p.product)
      };
    }
    
    // 2. LOCATION ANALYSIS
    const locationAnalysis: Record<string, any> = {};
    
    // Group sales by location
    const locationSales: Record<string, number> = {};
    const locationMonthly: Record<string, Record<string, number>> = {};
    const locationProducts: Record<string, Record<string, number>> = {};
    
    rows.forEach(row => {
      const location = row[3]; // Column D is Store_Location
      const product = row[4];  // Column E is Product_Name
      const date = new Date(row[1]); // Column B is Purchase_Date
      const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
      
      // Monthly sales by location
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Total sales by location
      if (!locationSales[location]) locationSales[location] = 0;
      locationSales[location] += amount;
      
      // Monthly sales by location
      if (!locationMonthly[location]) locationMonthly[location] = {};
      if (!locationMonthly[location][monthKey]) locationMonthly[location][monthKey] = 0;
      locationMonthly[location][monthKey] += amount;
      
      // Product sales by location
      if (!locationProducts[location]) locationProducts[location] = {};
      if (!locationProducts[location][product]) locationProducts[location][product] = 0;
      locationProducts[location][product] += amount;
    });
    
    // Format location analysis for each location
    for (const location of metadata.availableLocations) {
      // Get monthly data
      const monthlySales = Object.entries(locationMonthly[location] || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, sales]) => {
          const [year, month] = monthKey.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                             'July', 'August', 'September', 'October', 'November', 'December'];
          return {
            month: `${monthNames[parseInt(month) - 1]} ${year}`,
            sales
          };
        });
      
      // Get top products at this location
      const topProducts = Object.entries(locationProducts[location] || {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([product, sales]) => ({
          product,
          sales,
          percentage: ((sales as number) / (locationSales[location] || 1)) * 100
        }));
      
      locationAnalysis[location] = {
        totalSales: locationSales[location] || 0,
        monthlySales,
        topProducts
      };
    }
    
    // 3. TIME ANALYSIS
    const timeAnalysis: {
      monthly: Record<string, number>;
      dayOfWeek: Record<string, number>;
      timeOfDay: Record<string, number>;
    } = {
      monthly: {},
      dayOfWeek: {
        'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 
        'Friday': 0, 'Saturday': 0, 'Sunday': 0
      },
      timeOfDay: {
        'morning': 0,   // 6 AM - 11:59 AM
        'afternoon': 0, // 12 PM - 4:59 PM
        'evening': 0,   // 5 PM - 8:59 PM
        'night': 0      // 9 PM - 5:59 AM
      }
    };
    
    rows.forEach(row => {
      const date = new Date(row[1]); // Column B is Purchase_Date
      const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
      
      // Monthly totals
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!timeAnalysis.monthly[monthKey]) timeAnalysis.monthly[monthKey] = 0;
      timeAnalysis.monthly[monthKey] += amount;
      
      // Day of week
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      timeAnalysis.dayOfWeek[dayOfWeek] += amount;
      
      // Time of day
      const hour = date.getHours();
      if (hour >= 6 && hour < 12) {
        timeAnalysis.timeOfDay['morning'] += amount;
      } else if (hour >= 12 && hour < 17) {
        timeAnalysis.timeOfDay['afternoon'] += amount;
      } else if (hour >= 17 && hour < 21) {
        timeAnalysis.timeOfDay['evening'] += amount;
      } else {
        timeAnalysis.timeOfDay['night'] += amount;
      }
    });
    
    // 4. PROMOTION ANALYSIS
    const promotionAnalysis: Record<string, any> = {};
    const promotionSales: Record<string, number> = {};
    const promotionCount: Record<string, number> = {};
    
    rows.forEach(row => {
      const promo = row[7]; // Column H is Discount_Code_Used
      if (promo && promo.trim() !== '') {
        const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
        
        if (!promotionSales[promo]) promotionSales[promo] = 0;
        promotionSales[promo] += amount;
        
        if (!promotionCount[promo]) promotionCount[promo] = 0;
        promotionCount[promo]++;
      }
    });
    
    // Format promotion analysis
    for (const promo of Object.keys(promotionSales)) {
      promotionAnalysis[promo] = {
        totalSales: promotionSales[promo],
        usageCount: promotionCount[promo],
        avgOrderValue: promotionSales[promo] / promotionCount[promo]
      };
    }
    
    // Combine all analyses
    analysisData = {
      products: productsAnalysis,
      locations: locationAnalysis,
      time: timeAnalysis,
      promotions: promotionAnalysis
    };
    
    // Create a comprehensive data context
    const dynamicData = {
      ...metadata,
      analysis: analysisData,
      ...context
    };
    
    // Let ChatGPT handle the interpretation with comprehensive data
    return await forwardToChatGPT(question, conversation, data, {
      ...context,
      fullData: dynamicData
    });
  } catch (error) {
    console.error('Error processing general query:', error);
    throw error;
  }
}

export async function handleTopProductsQuery(question: string, data: any[], timeParameters: any) {
  try {
    // Extract month and year from timeParameters or question
    const { month, year } = extractMonthYear(question, timeParameters);
    
    // Get count from question or default to 3
    const countMatch = question.match(/\btop\s+(\d+)\b/i);
    const count = countMatch ? parseInt(countMatch[1]) : 3;
    
    // Analyze data
    const rows = data.slice(1); // Skip header row
    
    // Get all product sales for the specified month
    const monthKey = `${year}-${String(new Date(Date.parse(`${month} 1, ${year}`)).getMonth() + 1).padStart(2, '0')}`;
    
    // Group sales by product for the specified month
    const productSales: Record<string, number> = {};
    
    rows.forEach(row => {
      const date = new Date(row[1]);
      const rowMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (rowMonthKey === monthKey) {
        const product = row[4]; // Product name in column E
        const amount = parseFloat(row[8]) || 0; // Line total in column I
        
        if (!productSales[product]) productSales[product] = 0;
        productSales[product] += amount;
      }
    });
    
    // Convert to array and sort
    const sortedProducts = Object.entries(productSales)
      .map(([name, sales]) => ({ name, sales: sales as number }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, count);
    
    // Format the answer
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = new Date(Date.parse(`${month} 1, ${year}`)).getMonth();
    const formattedMonth = monthNames[monthIndex];
    
    const answer = `Top ${count} products for ${formattedMonth} ${year}:\n` +
      sortedProducts.map((p, i) => 
        `${i+1}. ${p.name}: $${p.sales.toLocaleString('en-US', {minimumFractionDigits: 2})}`
      ).join('\n');
    
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Error processing top products:', error);
    throw error;
  }
}

export async function handleLocationQuery(question: string, data: any[], timeParameters: any, context: any) {
  try {
    // Extract parameters
    const { month, year } = extractMonthYear(question, timeParameters);
    
    // Extract product from question or context
    let product = null;
    
    // Check context first
    if (context?.productFocus) {
      product = context.productFocus;
    } else {
      // Check available products from data
      const metadata = getDataMetadata(data);
      for (const availableProduct of metadata.availableProducts) {
        if (question.toLowerCase().includes(availableProduct.toLowerCase())) {
          product = availableProduct;
          break;
        }
      }
    }
    
    if (!product) {
      return NextResponse.json({ 
        answer: "I'm not sure which product you're asking about. Could you specify the product name?" 
      });
    }
    
    // Group sales by location for the specified product and month
    const rows = data.slice(1); // Skip header row
    const monthKey = `${year}-${String(new Date(Date.parse(`${month} 1, ${year}`)).getMonth() + 1).padStart(2, '0')}`;
    
    const locationSales: Record<string, number> = {};
    
    rows.forEach(row => {
      const productName = row[4]; // Product name in column E
      if (productName !== product) return;
      
      const date = new Date(row[1]);
      const rowMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (rowMonthKey !== monthKey) return;
      
      const location = row[3]; // Location in column D
      const amount = parseFloat(row[8]) || 0; // Line total in column I
      
      if (!locationSales[location]) locationSales[location] = 0;
      locationSales[location] += amount;
    });
    
    // Find highest performing location
    let highestLocation = '';
    let highestSales = 0;
    
    Object.entries(locationSales).forEach(([location, sales]) => {
      if (sales > highestSales) {
        highestSales = sales;
        highestLocation = location;
      }
    });
    
    if (!highestLocation) {
      return NextResponse.json({ 
        answer: `No sales data found for ${product} in ${month} ${year}.` 
      });
    }
    
    // Format month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = new Date(Date.parse(`${month} 1, ${year}`)).getMonth();
    const formattedMonth = monthNames[monthIndex];
    
    return NextResponse.json({ 
      answer: `${highestLocation} had the highest revenue for ${product} in ${formattedMonth} ${year} with $${highestSales.toLocaleString('en-US', {minimumFractionDigits: 2})}.`
    });
  } catch (error) {
    console.error('Error processing location query:', error);
    throw error;
  }
}

export async function handleImprovementQuery(question: string, conversation: any[], data: any[], context: any) {
  try {
    if (!context?.productFocus) {
      return NextResponse.json({ 
        answer: "I'm not sure which product you're asking about improving. Could you specify the product name?" 
      });
    }
    
    // Generate comprehensive recommendations
    const recommendations = await generateProductRecommendations(data, context.productFocus);
    
    // Forward to ChatGPT with enhanced recommendation focus
    return await forwardToChatGPT(question, conversation, data, {
      ...context,
      requestType: 'strategic_recommendations',
      recommendations,
      promptEnhancement: `
      Based on our detailed analysis, here are key insights about ${context.productFocus}:
      
      PRODUCT PERFORMANCE:
      ${recommendations.summary}
      
      LOCATION PERFORMANCE:
      ${recommendations.locationInsights}
      
      TIMING ANALYSIS:
      ${recommendations.timingPatterns}
      
      TIME OF DAY ANALYSIS:
      ${recommendations.timeOfDayInsights}
      
      DAY OF WEEK ANALYSIS:
      ${recommendations.dayOfWeekInsights}
      
      ${recommendations.promotionEffects ? `PROMOTION IMPACT:\n${recommendations.promotionEffects}` : ''}
      
      KEY STRATEGIC INSIGHTS:
      ${recommendations.topLocationStrategy ? `- ${recommendations.topLocationStrategy}` : ''}
      ${recommendations.growthOpportunities ? `- ${recommendations.growthOpportunities}` : ''}
      ${recommendations.promotionStrategy ? `- ${recommendations.promotionStrategy}` : ''}
      ${recommendations.locationOpportunities ? `- ${recommendations.locationOpportunities}` : ''}
      
      Based on this comprehensive analysis, provide 5 specific, data-driven recommendations to improve ${context.productFocus} performance.
      
      For each recommendation:
      1. Provide a clear, bold heading
      2. Explain the specific action to take
      3. Include SPECIFIC NUMBERS from the analysis to support your recommendation
      4. Explain why this would work based on the data
      5. Include expected impact (quantified as percentage improvement if possible)
      
      Focus on actionable strategies including:
      - Time-of-day specific promotions
      - Day-of-week tactics
      - Location-specific approaches
      - Pricing and promotion optimization
      - Product placement or bundling opportunities`
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    // Fall back to basic ChatGPT if recommendation generation fails
    return await forwardToChatGPT(question, conversation, data, context);
  }
}

// Enhanced ChatGPT handling with all context
export async function forwardToChatGPT(question: string, conversation: any[], data: any[], context: any) {
  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key is missing');
    return NextResponse.json({ answer: "I'm having trouble connecting to my knowledge base. Please try again later." });
  }
  
  try {
    console.log("Begin ChatGPT forwarding, getting metadata...");
    // Get minimal metadata to reduce processing time
    const metadata = getDataMetadata(data);
    console.log("Metadata extraction complete");
    
    // Create a better system prompt that will work with less context
    const systemPrompt = context.customSystemPrompt || `You are a business analyst assistant helping with sales data analysis.
      When you answer, be specific, data-driven, and concise.`;
    
    // Use the question directly rather than complex JSON
    const messages = [
      { role: 'system', content: systemPrompt },
      // Skip previous conversation to reduce tokens
      { role: 'user', content: question }
    ];
    
    console.log("Sending simplified request to OpenAI...");
    
    // Add retry logic with exponential backoff
    const maxRetries = 2;
    let retryCount = 0;
    let lastError;
    
    while (retryCount <= maxRetries) {
      try {
        // Add delay for retries to help with rate limiting
        if (retryCount > 0) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s
          console.log(`Retry ${retryCount}/${maxRetries}: Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await fetch(OPENAI_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.7,
            max_tokens: 500
          })
        });
        
        // Special handling for rate limits
        if (response.status === 429) {
          console.warn("Rate limit hit (429)");
          
          // If we're on our last retry, provide a helpful response
          if (retryCount === maxRetries) {
            return NextResponse.json({ 
              answer: "I'm currently experiencing high demand. Please try again in a few minutes or simplify your question."
            });
          }
          
          // Otherwise, continue to retry
          retryCount++;
          continue;
        }
        
        // For other non-200 responses
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Received response from OpenAI");
        return NextResponse.json({ answer: data.choices[0].message.content });
      } catch (error) {
        console.error(`Attempt ${retryCount+1}/${maxRetries+1} failed:`, error);
        lastError = error;
        retryCount++;
        
        // If it's our last retry, throw the error to be caught by the outer try/catch
        if (retryCount > maxRetries) {
          throw error;
        }
      }
    }
    
    // This should not be reached, but just in case
    throw lastError;
  } catch (error: unknown) {
    console.error('Error in ChatGPT forwarding:', error);
    
    // Provide a user-friendly response for different error types
    if (
      typeof error === 'object' && 
      error !== null && 
      'message' in error && 
      typeof error.message === 'string' && 
      error.message.includes('429')
    ) {
      return NextResponse.json({ 
        answer: "I'm currently experiencing high demand. Please try again in a few minutes or simplify your question."
      });
    }
    
    return NextResponse.json({ 
      answer: "I'm having trouble analyzing the data right now. Please try again with a more specific question about products, locations, or time periods."
    });
  }
} 