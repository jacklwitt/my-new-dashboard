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
    // Get metadata about the data
    const metadata = getDataMetadata(data);
    const rows = data.slice(1); // Skip header row
    
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
        model: "gpt-4",
        messages: messages as any,
        temperature: 0.3, // Lower temperature for more factual responses
        max_tokens: 800
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
    // Get metadata about the data FIRST, before using it
    const metadata = getDataMetadata(data);
    
    // Create a simplified analysis for direct use in this function
    const rows = data.slice(1); // Skip header row
    let basicAnalysis: {
      products: Record<string, any>;
      locations: Record<string, any>;
      time: {
        monthly: Record<string, number>;
      };
    } = {
      products: {},
      locations: {},
      time: {
        monthly: {}
      }
    };
    
    // Basic product data
    const productSalesMap = {};
    metadata.availableProducts.forEach(product => {
      const productRows = rows.filter(row => row[4] === product);
      const sales = productRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
      
      basicAnalysis.products[product] = {
        totalSales: sales,
        avgOrderValue: sales / (productRows.length || 1)
      };
    });
    
    // Basic location data
    const locationSalesMap = {};
    metadata.availableLocations.forEach(location => {
      const locationRows = rows.filter(row => row[3] === location);
      const sales = locationRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
      
      // Process monthly sales for each location
      const locationMonthly: Record<string, {month: string, sales: number}> = {};
      
      locationRows.forEach(row => {
        const date = new Date(row[1]);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const readableMonth = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        
        if (!locationMonthly[monthKey]) {
          locationMonthly[monthKey] = {
            month: readableMonth,
            sales: 0
          };
        }
        
        locationMonthly[monthKey].sales += parseFloat(row[8]) || 0;
      });
      
      basicAnalysis.locations[location] = {
        totalSales: sales,
        monthlySales: Object.values(locationMonthly)
      };
    });
    
    // Extract key information from the question
    const isProductQuery = context?.productFocus || 
      metadata.availableProducts.some(p => question.toLowerCase().includes(p.toLowerCase()));
    
    const isLocationQuery = metadata.availableLocations.some(loc => 
      question.toLowerCase().includes(loc.toLowerCase()));
    
    const monthMatch = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
    const isTimeQuery = !!monthMatch;
    
    // Define isImprovementQuery variable
    const isImprovementQuery = 
      context?.queryType === 'improvement' || 
      /improve|better|enhance|optimize|recommendation|suggest/i.test(question);
    
    // Get month if specified
    if (isTimeQuery) {
      const month = monthMatch[1].toLowerCase();
      const year = monthMatch[2];
      
      // Create a proper date object for the target month
      const targetDate = new Date(`${month} 1, ${year}`);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      
      // 1. DIRECT HANDLER FOR LOCATION + MONTH QUERIES
      if (isLocationQuery && !isProductQuery) {
        // Query about location in a specific month
        const locationName = metadata.availableLocations.find(loc => 
          question.toLowerCase().includes(loc.toLowerCase()));
          
        if (locationName) {
          // Calculate sales directly from raw data for accuracy
          let monthlySales = 0;
          
          // Loop through rows directly for better control
          for (const row of rows) {
            const rowLocation = row[3];
            
            // Skip non-matching locations
            if (rowLocation !== locationName) continue;
            
            // Parse date correctly
            const rowDate = new Date(row[1]);
            const rowMonth = rowDate.getMonth(); // 0-based (Jan = 0)
            const rowYear = rowDate.getFullYear();
            
            // Check exact month and year match
            if (rowMonth === targetMonth && rowYear === targetYear) {
              monthlySales += parseFloat(row[8]) || 0;
            }
          }
          
          // Return ONLY the direct factual answer
          return NextResponse.json({ 
            answer: `Sales for the ${locationName} location in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}.`
          });
        }
      }
      
      // 2. DIRECT HANDLER FOR PRODUCT + MONTH QUERIES
      if (isProductQuery && !isLocationQuery) {
        // Query about product in a specific month
        const productName = context?.productFocus || 
          metadata.availableProducts.find(p => question.toLowerCase().includes(p.toLowerCase()));
          
        if (productName) {
          // Calculate sales directly from raw data for accuracy
          let monthlySales = 0;
          let orderCount = 0;
          
          // Loop through rows directly for better control
          for (const row of rows) {
            const rowProduct = row[4];
            
            // Skip non-matching products
            if (rowProduct !== productName) continue;
            
            // Parse date correctly
            const rowDate = new Date(row[1]);
            const rowMonth = rowDate.getMonth(); // 0-based (Jan = 0)
            const rowYear = rowDate.getFullYear();
            
            // Check exact month and year match
            if (rowMonth === targetMonth && rowYear === targetYear) {
              monthlySales += parseFloat(row[8]) || 0;
              orderCount++;
            }
          }
          
          // Calculate average order value
          const avgOrderValue = orderCount > 0 ? monthlySales / orderCount : 0;
          
          // Return ONLY the direct factual answer
          return NextResponse.json({ 
            answer: `Sales for ${productName} in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}.`
          });
        }
      }
    }
    
    // Direct handler for "bottom X products" queries
    if (/bottom|worst|lowest|poorest|least|worst-performing/i.test(question) && 
        /\b\d+\b/.test(question) && 
        /products?|items?/i.test(question)) {
      
      try {
        // Extract count (default to 3)
        const countMatch = question.match(/\b(\d+)\b/);
        const count = countMatch ? parseInt(countMatch[1]) : 3;
        
        // Get month if specified (default to most recent)
        const monthKey = monthMatch ? 
          `${monthMatch[2]}-${String(new Date(Date.parse(`${monthMatch[1]} 1, ${monthMatch[2]}`)).getMonth() + 1).padStart(2, '0')}` : 
          Object.keys(basicAnalysis.time.monthly).sort().pop();
        
        // For specific month, filter products by their performance in that month
        let productPerformances = [];
        
        // Get all products with their sales in the specified month
        for (const productName of metadata.availableProducts) {
          // Basic information from our simplified analysis
          const basicSales = basicAnalysis.products[productName]?.totalSales || 0;
          
          try {
            // Try to get detailed analysis if available (might not be for all products)
            const details = await analyzeProductPerformance(data, productName);
            
            // Find the monthly data for the specified month
            const monthData = details.monthlyTrends.find(m => {
              // Handle both formats - "November 2024" and "2024-11"
              return (m.month && monthKey && m.month.includes(monthKey)) || 
                (monthMatch && m.month && m.month.toLowerCase().includes(monthMatch[1].toLowerCase()) && 
                 m.month && m.month.includes(monthMatch[2]));
            });
            
            if (monthData) {
              productPerformances.push({
                name: productName,
                sales: monthData.sales,
                growth: monthData.growth
              });
            } else {
              // Fallback if we don't have monthly data
              productPerformances.push({
                name: productName,
                sales: basicSales / 12, // Rough estimate
                growth: 0
              });
            }
          } catch (e) {
            // If analysis fails, use basic sales
            productPerformances.push({
              name: productName,
              sales: basicSales / 12, // Rough estimate 
              growth: 0
            });
          }
        }
        
        // Sort by sales (ascending)
        productPerformances.sort((a, b) => a.sales - b.sales);
        
        // Take bottom 'count' products
        const bottomProducts = productPerformances.slice(0, count);
        
        // Format readable month name
        const monthName = monthMatch ? 
          monthMatch[1] + " " + monthMatch[2] : 
          "the most recent month";
        
        // Generate response
        const answer = `Bottom ${count} products for ${monthName}:\n` + 
          bottomProducts.map((p, i) => 
            `${i+1}. ${p.name}: $${p.sales.toLocaleString('en-US', {minimumFractionDigits: 2})}`
          ).join('\n');
        
        return NextResponse.json({ answer });
      } catch (error) {
        console.error("Error handling bottom products query:", error);
        // Fall through to regular processing if direct handling fails
      }
    }
    
    // 2. Special handling for product cutting questions
    if (/which|what|list|identify/.test(question) && 
        /products?|items?|offerings?/.test(question) && 
        /cut|remove|eliminate|discontinue|stop|worst/.test(question)) {
      
      // Sort products by sales (ascending) to find worst performers
      const worstPerformers = Object.entries(basicAnalysis.products)
        .map(([name, data]) => ({
          name,
          sales: (data as any).totalSales,
          avgOrderValue: (data as any).avgOrderValue
        }))
        .sort((a, b) => a.sales - b.sales)
        .slice(0, 5);
      
      // Generate direct answer for worst performers
      const answer = `Based on sales data, the 3 products with the lowest performance are:

1. **${worstPerformers[0].name}** - Total sales: $${worstPerformers[0].sales.toLocaleString('en-US', {minimumFractionDigits: 2})}, Average order: $${worstPerformers[0].avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
   This product has the lowest overall sales volume, making it a prime candidate for removal to optimize your product lineup.

2. **${worstPerformers[1].name}** - Total sales: $${worstPerformers[1].sales.toLocaleString('en-US', {minimumFractionDigits: 2})}, Average order: $${worstPerformers[1].avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
   With consistently low performance, this product is utilizing menu space and inventory resources that could be better allocated to higher-performing options.

3. **${worstPerformers[2].name}** - Total sales: $${worstPerformers[2].sales.toLocaleString('en-US', {minimumFractionDigits: 2})}, Average order: $${worstPerformers[2].avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
   This product has failed to generate significant revenue and could be replaced with a new offering that better aligns with customer preferences.

Removing these products would have minimal impact on your overall revenue while freeing up operational resources and menu space for better-performing items or new product innovations.`;

      return NextResponse.json({ answer });
    }
    
    // For other queries, use enhanced ChatGPT
    // Add recommendation context if appropriate
    let promptPrefix = '';
    if (context?.requestType === 'strategic_recommendations') {
      promptPrefix = `You're providing strategic business recommendations based on our sales data. Focus on actionable advice that will improve business metrics. Be specific and data-driven. Do not make up data we don't have.`;
    } else if (/top|performance|sales|revenue|growth|improve|recommend|suggest/i.test(question)) {
      promptPrefix = `Focus your response on actionable recommendations that would help improve business results. Base your answer only on the data we provide, not assumptions.`;
    }
    
    // Create a comprehensive data context with our basic analysis
    const dynamicData = {
      ...metadata,
      analysis: basicAnalysis, // Use our local analysis instead of undefined analysisData
      ...context
    };

    // Add specific prompt enhancement if provided
    const enhancedPrompt = context?.promptEnhancement ? context.promptEnhancement : '';

    // Create a more recommendations-focused system prompt
    const systemPrompt = `${createSystemPrompt(data)}

IMPORTANT: Base all your answers ONLY on the data provided below. Do not make assumptions about data we don't have.

Here is our business data summary:
Products: ${metadata.availableProducts.length} products available
Locations: ${metadata.availableLocations.join(', ')}
Date range: ${metadata.timeRange[0]} to ${metadata.timeRange[metadata.timeRange.length-1]}

${promptPrefix}

When answering:
1. Always include specific, actionable recommendations
2. Base recommendations on data patterns and trends
3. Focus on improving business metrics (sales, revenue, average order value)
4. Be concise but thorough in your advice
5. Format recommendations as clear bullet points with bold headings

${enhancedPrompt}

Your goal is to provide insights that drive business growth.`;

    // Extract product name from context or question
    const productName = context?.productFocus || 
      (isProductQuery ? metadata.availableProducts.find(p => 
        question.toLowerCase().includes(p.toLowerCase())) : undefined);

    // Extract location name
    const locationName = isLocationQuery ? metadata.availableLocations.find(loc => 
      question.toLowerCase().includes(loc.toLowerCase())) : undefined;

    // Then initialize relevantData with the extracted productName
    const relevantData: {
      question: string;
      productFocus: any;
      queryType: any;
      productData?: any;
      locationData?: any;
      monthData?: any;
    } = {
      question,
      productFocus: context?.productFocus || productName,
      queryType: isImprovementQuery ? 'improvement' : 'general'
    };
    
    // Only if we're asking about a specific product, include its data
    if (isProductQuery) {
      if (productName && basicAnalysis.products[productName]) {
        relevantData.productData = basicAnalysis.products[productName];
      }
    }
    
    // Only if we're asking about a specific location, include its data
    if (isLocationQuery) {
      if (locationName && basicAnalysis.locations[locationName]) {
        relevantData.locationData = basicAnalysis.locations[locationName];
      }
    }
    
    // Format messages with reduced data payload
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation.slice(-3).map((msg: any) => ({ // Only include last 3 messages
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: JSON.stringify(relevantData) }
    ];
    
    // Make request to ChatGPT API with proper error handling
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 800
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('ChatGPT API error:', errorData);
      throw new Error(`ChatGPT API error: ${errorData.error?.message || response.statusText}`);
    }
    
    const responseData = await response.json();
    console.log('ChatGPT response received');
    return NextResponse.json({ answer: responseData.choices[0].message.content });
    
  } catch (error) {
    console.error('Error in ChatGPT request:', error);
    
    // Make sure we have metadata here too
    try {
      const metadata = getDataMetadata(data);
      // Provide more helpful error response based on the type of query
      const isProductQuery = metadata.availableProducts.some(p => 
        question.toLowerCase().includes(p.toLowerCase()));
      const isLocationQuery = metadata.availableLocations.some(loc => 
        question.toLowerCase().includes(loc.toLowerCase()));
      
      if (isProductQuery && isLocationQuery) {
        return NextResponse.json({ 
          answer: "I found both product and location information in your question, but couldn't process the data fully. Could you try simplifying your question?" 
        });
      } else if (isProductQuery) {
        const product = metadata.availableProducts.find(p => 
          question.toLowerCase().includes(p.toLowerCase()));
        return NextResponse.json({ 
          answer: `I found data for "${product}" but encountered an error processing your specific request. Try asking about overall sales, monthly trends, or location performance for this product.` 
        });
      } else if (isLocationQuery) {
        const location = metadata.availableLocations.find(loc => 
          question.toLowerCase().includes(loc.toLowerCase()));
        return NextResponse.json({ 
          answer: `I found data for the "${location}" location but encountered an error processing your specific request. Try asking about overall sales, product performance, or monthly trends for this location.` 
        });
      }
    } catch (metadataError) {
      console.error('Error accessing metadata:', metadataError);
    }
    
    return NextResponse.json({ 
      answer: "I'm having trouble processing your request. Please try asking in a different way or break your question into smaller parts." 
    });
  }
} 