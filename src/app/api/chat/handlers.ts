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
    const locationMonthly: Record<string, Record<string, number>> = {};
    const locationProducts: Record<string, Record<string, number>> = {};
    
    const locationSales: Record<string, number> = {};
    
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
          percentage: (sales / Object.values(locationSales).reduce((sum, val) => sum + val, 0)) * 100
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
    console.log("Generating data-driven business advice...");
    
    // Extract product name from question if present
    const productMatch = question.match(/for\s+(\w+\s+\w+|\w+)/i);
    const productName = context?.productFocus || (productMatch ? productMatch[1] : null);
    
    let productAnalysis = null;
    let priceInsights = '';
    
    if (productName) {
      console.log(`Analyzing specific product: ${productName}`);
      // Use the product name in the data to get the closest match
      const metadata = getDataMetadata(data);
      const matchedProduct = metadata.availableProducts.find(p => 
        p.toLowerCase().includes(productName.toLowerCase()) || 
        productName.toLowerCase().includes(p.toLowerCase())
      );
      
      if (matchedProduct) {
        productAnalysis = await analyzeProductPerformance(data, matchedProduct);
        
        // Generate price recommendations if price data is available
        if (productAnalysis?.priceAnalysis && !productAnalysis.priceAnalysis.error) {
          const { currentPrice, recommendedPrice, recommendedPriceRationale, formattedReport } = productAnalysis.priceAnalysis;
          
          if (currentPrice !== recommendedPrice) {
            priceInsights = `
PRICING RECOMMENDATION:
Current price: ${formattedReport.currentPrice}
Recommended price: ${formattedReport.optimalPrice}
${recommendedPriceRationale}

Price comparison by revenue:
${formattedReport.priceComparison.slice(0, 3).map((p: any, i: number) => 
  `${i+1}. ${p.price}: ${p.revenue} (${p.ordersAtPrice} orders)`
).join('\n')}
`;
          } else {
            priceInsights = `
PRICING ANALYSIS:
Current price ${formattedReport.currentPrice} appears optimal based on historical data.
${recommendedPriceRationale}
`;
          }
        }
      }
    }
    
    // Create a comprehensive data summary from the dataset
    const dataInsights = calculateDataInsights(data);
    
    // Generate recommendations based on the analysis
    const recommendations = await generateProductRecommendations(data, productName);
    
    // Create the system prompt with specific data-driven insights
    const systemPrompt = `You are a retail business advisor using data analytics to provide specific, actionable advice.

IMPORTANT: Your advice must be STRICTLY DATA-DRIVEN, not generic. Every recommendation must cite specific numbers from the data provided.

DATA ANALYSIS:
${dataInsights}

${productAnalysis ? `PRODUCT ANALYSIS FOR ${productName.toUpperCase()}:
Total Sales: $${productAnalysis.totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})}
Average Order: $${productAnalysis.avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
Top Locations: ${productAnalysis.topLocations.map(l => l.location).join(', ')}
Monthly Trend: ${productAnalysis.monthlyTrends.slice(-3).map(m => `${m.month}: $${m.sales.toLocaleString('en-US', {minimumFractionDigits: 2})}`).join(', ')}` : ''}

${priceInsights ? `
PRICE OPTIMIZATION INSIGHTS:
${priceInsights}

A price adjustment of just 5% can potentially increase revenue by ${productAnalysis && productAnalysis.priceAnalysis ? 
  ((productAnalysis.priceAnalysis.recommendedPrice / productAnalysis.priceAnalysis.currentPrice - 1) * 100).toFixed(1) : 0}% based on customer purchasing patterns.
` : ''}

RECOMMENDATIONS:
${Array.isArray(recommendations) ? recommendations.map((r: any, i: number) => `${i+1}. ${r.strategy}: ${r.rationale} (Impact: ${r.impact})`).join('\n') : 'No recommendations available'}

USER QUESTION: "${question}"

Based ONLY on this data, provide specific, actionable advice that directly references the data. Include numbers, percentages, and specific product/location mentions. NEVER provide generic advice without data backing.

If price optimization data is available, ALWAYS include specific price recommendations with expected revenue impact in your response.`;

    // Make request to ChatGPT API with the data-rich prompt
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY as string,
    });
    
    console.log('Sending comprehensive data request to OpenAI');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      temperature: 0.5,
      max_tokens: 1000
    });
    
    console.log('OpenAI response received');
    const answer = completion.choices[0]?.message?.content;
    
    if (!answer) {
      throw new Error("No response content from OpenAI");
    }
    
    console.log("Generated answer of length:", answer.length);
    console.log("Answer format check:", typeof answer, "First 50 chars:", answer.substring(0, 50));
    
    return NextResponse.json({ 
      answer: answer.toString() 
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    // Fall back to basic ChatGPT if recommendation generation fails
    return await forwardToChatGPT(question, conversation, data, context);
  }
}

// Add a helper function to calculate data insights
function calculateDataInsights(data: any[]) {
  try {
    const rows = data.slice(1); // Skip header row
    
    // Calculate basic stats
    const totalSales = rows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
    
    // Product sales
    const productSales: Record<string, number> = {};
    rows.forEach(row => {
      const product = row[4]; // Product name
      const amount = parseFloat(row[8]) || 0; // Line total
      if (!productSales[product]) productSales[product] = 0;
      productSales[product] += amount;
    });
    
    // Top products
    const topProducts = Object.entries(productSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([product, sales]) => `${product}: $${sales.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    
    // Monthly sales
    const monthlySales: Record<string, number> = {};
    rows.forEach(row => {
      const date = new Date(row[1]);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
      monthlySales[monthKey] += parseFloat(row[8]) || 0;
    });
    
    // Format monthly sales
    const formattedMonthlySales = Object.entries(monthlySales)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, sales]) => {
        const [year, monthNum] = monthKey.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        return `${monthNames[parseInt(monthNum) - 1]} ${year}: $${sales.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
      });
    
    return `
Total Sales: $${totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})}

Top Products:
${topProducts.join('\n')}

Monthly Sales Trend:
${formattedMonthlySales.join('\n')}
`;
  } catch (error) {
    console.error('Error calculating data insights:', error);
    return "Error calculating data insights";
  }
}

// Enhanced ChatGPT forwarding function with proper API key access
export async function forwardToChatGPT(question: string, conversation: any[], data: any[], options?: any) {
  try {
    // Add debug logging for environment variables
    console.log("forwardToChatGPT - Environment check");
    console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
    
    // Direct access to API key - critical fix
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing or undefined");
      throw new Error("API key is required for OpenAI integration");
    }
    
    console.log("Begin ChatGPT forwarding, getting metadata...");
    const metadata = getDataMetadata(data);
    console.log("Metadata extraction complete");
    
    // Create OpenAI client with direct API key access
    const openai = new OpenAI({ apiKey });
    
    // Log success creating the OpenAI client
    console.log("OpenAI client created successfully");
    
    // Build the messages array
    const systemPrompt = options?.customSystemPrompt || `
      You are a business intelligence analyst assistant with access to sales data.
      
      Products: ${metadata.availableProducts.length} products
      Locations: ${metadata.availableLocations.join(', ')}
      Date range: ${metadata.timeRange[0]} to ${metadata.timeRange[metadata.timeRange.length-1]}
      
      Always provide specific, data-driven insights based on this data.
      Use bullet points and clear sections for readability.
      When asked about business improvements, analyze trends and provide concrete advice.
    `;
    
    // Create message array with context
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversation.map(m => ({ role: m.role, content: m.content })).slice(-4),
      { role: "user", content: question }
    ];
    
    console.log("Sending request to OpenAI...");
    
    // Make the API call
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",  // Using gpt-4o-mini as specified
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });
    
    console.log("Received response from OpenAI");
    
    // Extract the assistant's message
    const assistantMessage = response.choices[0]?.message?.content;
    if (!assistantMessage) {
      throw new Error("No response content from OpenAI");
    }
    
    console.log("Returning OpenAI response, length:", assistantMessage.length);
    
    // Return the response with explicit JSON formatting
    return NextResponse.json({ 
      answer: assistantMessage
    });
  } catch (error) {
    console.error("Error forwarding to ChatGPT:", error);
    // Return a more helpful error response
    return NextResponse.json({ 
      answer: "I encountered an error while analyzing your data. Please try again or contact support if the issue persists."
    }, { status: 500 });
  }
}

// Updated handleBusinessIntelligence function with enhanced logging and proper error handling

export async function handleBusinessIntelligence(query: string, data: any[]) {
  const queryLower = query.toLowerCase();
  
  console.log("Handling business intelligence query:", queryLower);
  
  // Handle sales improvement queries specifically
  if ((queryLower.includes('improve') || queryLower.includes('increase') || 
       queryLower.includes('boost')) && 
      (queryLower.includes('sales') || queryLower.includes('revenue')) && 
      (queryLower.includes('next month') || queryLower.includes('january') || 
       queryLower.includes('jan'))) {
    
    console.log("Detected sales improvement query");
    
    try {
      // Make sure we have data to work with
      if (!data || !Array.isArray(data) || data.length < 2) {
        console.log("Insufficient data for analysis:", data?.length || 0, "rows");
        return NextResponse.json({ answer: "I couldn't find enough data to provide specific sales improvement recommendations." });
      }
      
      console.log("Processing data with", data.length, "rows");
      
      // Process the data to generate business insights
      const rows = data.slice(1); // Skip header row
      
      // Calculate product performance
      const productSales: Record<string, number> = {};
      const locationSales: Record<string, number> = {};
      
      rows.forEach((row, index) => {
        try {
          if (index < 10) console.log("Sample row:", JSON.stringify(row));
          
          const product = row[4]; // Product name
          const location = row[3]; // Store location
          const revenue = parseFloat(row[8] || '0'); // Revenue
          
          if (product && !isNaN(revenue)) {
            productSales[product] = (productSales[product] || 0) + revenue;
          }
          
          if (location && !isNaN(revenue)) {
            locationSales[location] = (locationSales[location] || 0) + revenue;
          }
        } catch (e) {
          console.error("Error processing row:", e, "Row:", JSON.stringify(row));
        }
      });
      
      console.log("Processed data. Products:", Object.keys(productSales).length, "Locations:", Object.keys(locationSales).length);
      
      // Get top products and locations
      const topProducts = Object.entries(productSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
        
      const topLocations = Object.entries(locationSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2);
      
      console.log("Top products:", JSON.stringify(topProducts));
      console.log("Top locations:", JSON.stringify(topLocations));
      
      // Generate the answer with fallback for empty data
      const answer = topProducts.length > 0 ? 
        `# Sales Improvement Plan for January 2025

Based on analysis of your historical sales data, here are strategic recommendations to increase your sales next month:

## 1. Focus on Top-Performing Products
Your top revenue generators are:
${topProducts.map((p, i) => `- **${p[0]}**: $${p[1].toFixed(2)}`).join('\n')}

Ensure these products have prime visibility and adequate inventory in January.

## 2. Leverage Your Best Locations
These locations drive the most revenue:
${topLocations.map((l, i) => `- **${l[0]}**: $${l[1].toFixed(2)}`).join('\n')}

Consider running special January promotions at these high-performing locations.

## 3. Strategic Recommendations
- Run a "New Year, New You" promotion featuring your healthiest products
- Implement a loyalty program reward for January purchases
- Consider limited-time products to create urgency
- Analyze December data for seasonal trends that might continue into January

Would you like more specific recommendations for any particular product or location?` :
        "Based on the available data, I couldn't generate specific sales improvement recommendations. Please ensure your data includes product names, locations, and sales amounts to get tailored advice.";
      
      console.log("Generated answer of length:", answer.length);
      
      // Return properly structured response
      return NextResponse.json({ answer });
    } catch (error) {
      console.error("Error in sales improvement handler:", error);
      return NextResponse.json({ 
        answer: "I encountered an error while analyzing your sales data. Please try again or contact support if the issue persists." 
      });
    }
  }
  
  // Other business intelligence queries...
  return null; // Return null if no handler matched
}

function generateRevenueByTimeReport(data: any[], query: string): string {
  // Extract month from query
  const monthMatches = /january|february|march|april|may|june|july|august|september|october|november|december/i.exec(query);
  const targetMonth = monthMatches ? monthMatches[0].toLowerCase() : 'december';
  
  // Process data to get revenue by time
  let totalRevenue = 0;
  const revenueByDay: Record<string, number> = {};
  
  // Skip header row and process each row of data
  data.slice(1).forEach(row => {
    try {
      const dateStr = row[1]; // Column B - Purchase_Date
      const revenue = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Skip invalid rows
      if (!dateStr || isNaN(revenue)) {
        return;
      }
      
      // Parse date
      const rowDate = new Date(dateStr);
      if (isNaN(rowDate.getTime())) {
        return;
      }
      
      // Check if this row is from the target month
      const rowMonth = rowDate.toLocaleString('en-US', { month: 'long' }).toLowerCase();
      if (rowMonth !== targetMonth) {
        return;
      }
      
      // Add to total
      totalRevenue += revenue;
      
      // Track by day
      const dayKey = rowDate.toISOString().split('T')[0]; // YYYY-MM-DD
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + revenue;
    } catch (e) {
      console.error("Error processing revenue data:", e);
    }
  });
  
  // Format the response
  let revenueData = '';
  if (totalRevenue > 0) {
    revenueData = `Total revenue for ${targetMonth}: $${totalRevenue.toFixed(2)}\n\nDaily breakdown:\n`;
    
    // Sort days chronologically
    const sortedDays = Object.entries(revenueByDay)
      .sort(([dayA], [dayB]) => dayA.localeCompare(dayB));
    
    // Add daily breakdown
    sortedDays.forEach(([day, amount]) => {
      const formattedDate = new Date(day).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
      revenueData += `${formattedDate}: $${amount.toFixed(2)}\n`;
    });
  } else {
    revenueData = `No revenue data found for ${targetMonth}.`;
  }
  
  return `Revenue report for ${targetMonth}:\n\n${revenueData}`;
}

function generateStorePerformanceReport(data: any[]): string {
  console.log("Generating store performance report with transaction grouping...");
  
  // Group transactions by Transaction_ID
  const transactions: Record<string, {
    store: string,
    total: number,
    items: number
  }> = {};
  
  // Process data to create complete transactions
  data.slice(1).forEach(row => { // Skip header row
    try {
      const transactionId = row[0]; // Column A - Transaction_ID
      const storeLocation = row[3]; // Column D - Store_Location
      const quantity = parseInt(row[6] || '1', 10); // Column G - Quantity
      const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Skip rows with missing or invalid data
      if (!transactionId || !storeLocation || isNaN(lineTotal)) {
        return;
      }
      
      // Initialize transaction if not seen before
      if (!transactions[transactionId]) {
        transactions[transactionId] = {
          store: storeLocation,
          total: 0,
          items: 0
        };
      }
      
      // Add line item to transaction
      transactions[transactionId].total += lineTotal;
      transactions[transactionId].items += quantity;
    } catch (e) {
      console.error("Error processing transaction data:", e);
    }
  });
  
  // Calculate metrics by store location
  const storeData: Record<string, {
    totalRevenue: number,
    transactionCount: number,
    itemCount: number
  }> = {};
  
  // Group transaction data by store
  Object.values(transactions).forEach(transaction => {
    const { store, total, items } = transaction;
    
    if (!storeData[store]) {
      storeData[store] = {
        totalRevenue: 0,
        transactionCount: 0,
        itemCount: 0
      };
    }
    
    storeData[store].totalRevenue += total;
    storeData[store].transactionCount += 1;
    storeData[store].itemCount += items;
  });
  
  // Calculate average order value and other metrics for each store
  const storeMetrics = Object.entries(storeData).map(([location, data]) => {
    return {
      location,
      aov: data.totalRevenue / data.transactionCount,
      totalRevenue: data.totalRevenue,
      transactionCount: data.transactionCount,
      itemsPerOrder: data.itemCount / data.transactionCount
    };
  });
  
  // Sort by average order value (highest first)
  storeMetrics.sort((a, b) => b.aov - a.aov);
  
  // Ensure we have data before proceeding
  if (storeMetrics.length === 0) {
    return "I couldn't find any store performance data in the available records.";
  }
  
  // Calculate company average for comparison
  const companyAvg = {
    aov: storeMetrics.reduce((sum, store) => sum + store.totalRevenue, 0) / 
         storeMetrics.reduce((sum, store) => sum + store.transactionCount, 0),
    itemsPerOrder: storeMetrics.reduce((sum, store) => sum + (store.itemsPerOrder * store.transactionCount), 0) / 
                   storeMetrics.reduce((sum, store) => sum + store.transactionCount, 0)
  };
  
  // Format the response
  return `Based on complete transaction data across all locations, here are the average order values by store:

${storeMetrics.map((store, i) => 
  `${store.location}: $${store.aov.toFixed(2)}`).join('\n')}

${storeMetrics[0].location} has the highest average order value at $${storeMetrics[0].aov.toFixed(2)}, which is ${((storeMetrics[0].aov / companyAvg.aov - 1) * 100).toFixed(1)}% higher than the company average.

Analysis of ${storeMetrics[0].location}'s transactions shows:
- More items per order (${storeMetrics[0].itemsPerOrder.toFixed(1)} vs. company average of ${companyAvg.itemsPerOrder.toFixed(1)})
- Higher total revenue ($${storeMetrics[0].totalRevenue.toFixed(2)})
- ${storeMetrics[0].transactionCount} total transactions processed

The data comes from analyzing complete transactions (grouping all items purchased together) across all store locations.`;
}

function generateSeasonalProductComparison(data: any[]): string {
  console.log("Generating seasonal product comparison...");
  
  // Define all four seasons (Northern Hemisphere)
  const springMonths = [2, 3, 4]; // March, April, May (0-indexed)
  const summerMonths = [5, 6, 7]; // June, July, August (0-indexed)
  const fallMonths = [8, 9, 10]; // September, October, November (0-indexed)
  const winterMonths = [11, 0, 1]; // December, January, February (0-indexed)
  
  // Track sales by product and season
  const productSales: Record<string, { 
    spring: number, 
    summer: number, 
    fall: number, 
    winter: number 
  }> = {};
  
  // Process data
  data.slice(1).forEach(row => { // Skip header row
    try {
      const dateStr = row[1]; // Column B - Purchase_Date
      const productName = row[4]; // Column E - Product_Name
      const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Skip invalid rows
      if (!dateStr || !productName || isNaN(lineTotal)) {
        return;
      }
      
      // Parse date
      const rowDate = new Date(dateStr);
      if (isNaN(rowDate.getTime())) {
        return;
      }
      
      const rowMonth = rowDate.getMonth();
      
      // Initialize product if not seen before
      if (!productSales[productName]) {
        productSales[productName] = { 
          spring: 0, 
          summer: 0, 
          fall: 0, 
          winter: 0 
        };
      }
      
      // Add to appropriate season
      if (springMonths.includes(rowMonth)) {
        productSales[productName].spring += lineTotal;
      } else if (summerMonths.includes(rowMonth)) {
        productSales[productName].summer += lineTotal;
      } else if (fallMonths.includes(rowMonth)) {
        productSales[productName].fall += lineTotal;
      } else if (winterMonths.includes(rowMonth)) {
        productSales[productName].winter += lineTotal;
      }
    } catch (e) {
      console.error("Error processing row for seasonal comparison:", e);
    }
  });
  
  // Find the best season for each product
  const productSeasons = Object.entries(productSales).map(([product, sales]) => {
    const totalSales = sales.spring + sales.summer + sales.fall + sales.winter;
    // Skip products with minimal sales
    if (totalSales < 100) return null;
    
    // Find the season with the highest sales
    const seasons = [
      { name: 'spring', sales: sales.spring },
      { name: 'summer', sales: sales.summer },
      { name: 'fall', sales: sales.fall },
      { name: 'winter', sales: sales.winter }
    ];
    
    // Sort seasons by sales (highest first)
    seasons.sort((a, b) => b.sales - a.sales);
    
    // Calculate percentage of total sales for best season
    const bestSeason = seasons[0];
    const bestSeasonPercentage = (bestSeason.sales / totalSales) * 100;
    
    return {
      product,
      bestSeason: bestSeason.name,
      salesBySeason: sales,
      totalSales,
      bestSeasonPercentage
    };
  }).filter(item => item !== null);
  
  // Sort by how strongly seasonal the product is (highest percentage first)
  productSeasons.sort((a, b) => b!.bestSeasonPercentage - a!.bestSeasonPercentage);
  
  // Group products by their best season
  const springProducts = productSeasons.filter(p => p!.bestSeason === 'spring').slice(0, 5);
  const summerProducts = productSeasons.filter(p => p!.bestSeason === 'summer').slice(0, 5);
  const fallProducts = productSeasons.filter(p => p!.bestSeason === 'fall').slice(0, 5);
  const winterProducts = productSeasons.filter(p => p!.bestSeason === 'winter').slice(0, 5);
  
  // Format the response
  let response = `# Seasonal Product Analysis\n\n`;
  
  response += `## Top Spring Products (March-May)\n`;
  if (springProducts.length > 0) {
    response += `These products perform best during spring months:\n\n`;
    springProducts.forEach((item, i) => {
      const sales = item!.salesBySeason;
      response += `${i+1}. **${item!.product}**: $${sales.spring.toFixed(2)} (${item!.bestSeasonPercentage.toFixed(1)}% of annual sales)\n`;
      response += `   Comparison: Summer $${sales.summer.toFixed(2)}, Fall $${sales.fall.toFixed(2)}, Winter $${sales.winter.toFixed(2)}\n`;
    });
  } else {
    response += `No products show a strong preference for spring.\n`;
  }
  
  response += `\n## Top Summer Products (June-August)\n`;
  if (summerProducts.length > 0) {
    response += `These products perform best during summer months:\n\n`;
    summerProducts.forEach((item, i) => {
      const sales = item!.salesBySeason;
      response += `${i+1}. **${item!.product}**: $${sales.summer.toFixed(2)} (${item!.bestSeasonPercentage.toFixed(1)}% of annual sales)\n`;
      response += `   Comparison: Spring $${sales.spring.toFixed(2)}, Fall $${sales.fall.toFixed(2)}, Winter $${sales.winter.toFixed(2)}\n`;
    });
  } else {
    response += `No products show a strong preference for summer.\n`;
  }
  
  response += `\n## Top Fall Products (September-November)\n`;
  if (fallProducts.length > 0) {
    response += `These products perform best during fall months:\n\n`;
    fallProducts.forEach((item, i) => {
      const sales = item!.salesBySeason;
      response += `${i+1}. **${item!.product}**: $${sales.fall.toFixed(2)} (${item!.bestSeasonPercentage.toFixed(1)}% of annual sales)\n`;
      response += `   Comparison: Spring $${sales.spring.toFixed(2)}, Summer $${sales.summer.toFixed(2)}, Winter $${sales.winter.toFixed(2)}\n`;
    });
  } else {
    response += `No products show a strong preference for fall.\n`;
  }
  
  response += `\n## Top Winter Products (December-February)\n`;
  if (winterProducts.length > 0) {
    response += `These products perform best during winter months:\n\n`;
    winterProducts.forEach((item, i) => {
      const sales = item!.salesBySeason;
      response += `${i+1}. **${item!.product}**: $${sales.winter.toFixed(2)} (${item!.bestSeasonPercentage.toFixed(1)}% of annual sales)\n`;
      response += `   Comparison: Spring $${sales.spring.toFixed(2)}, Summer $${sales.summer.toFixed(2)}, Fall $${sales.fall.toFixed(2)}\n`;
    });
  } else {
    response += `No products show a strong preference for winter.\n`;
  }
  
  // Add seasonal marketing recommendations
  response += `\n## Seasonal Marketing Recommendations\n`;
  response += `- **Spring Focus**: ${springProducts.length > 0 ? springProducts[0]!.product : 'No strong spring products'}\n`;
  response += `- **Summer Focus**: ${summerProducts.length > 0 ? summerProducts[0]!.product : 'No strong summer products'}\n`;
  response += `- **Fall Focus**: ${fallProducts.length > 0 ? fallProducts[0]!.product : 'No strong fall products'}\n`;
  response += `- **Winter Focus**: ${winterProducts.length > 0 ? winterProducts[0]!.product : 'No strong winter products'}\n\n`;
  response += `Consider seasonal menu rotations and promotions to highlight these seasonal preferences.\n`;
  
  return response;
}

export async function handleLowPerformingProductsQuery(question: string, data: any[]) {
  console.log('Processing low performing products query:', question);
  
  try {
    const rows = data.slice(1); // Skip header row
    
    // Extract percentage from query if mentioned (default to 20%)
    const percentageMatch = question.match(/(\d+)%/);
    const percentage = percentageMatch ? parseInt(percentageMatch[1]) : 20;
    console.log(`Looking for bottom ${percentage}% of products`);
    
    // Calculate sales by product
    const productSales: Record<string, number> = {};
    const productQuantities: Record<string, number> = {};
    
    rows.forEach(row => {
      try {
        const productName = row[4]; // Product name (column E)
        const quantity = parseInt(row[6] || '1'); // Quantity (column G)
        const sales = parseFloat(row[8] || '0'); // Sales amount (column I)
        
        if (!productName || isNaN(sales)) return;
        
        if (!productSales[productName]) {
          productSales[productName] = 0;
          productQuantities[productName] = 0;
        }
        
        productSales[productName] += sales;
        productQuantities[productName] += quantity;
      } catch (e) {
        console.error('Error processing row for product sales:', e);
      }
    });
    
    // Sort products by sales (lowest first)
    const sortedProducts = Object.entries(productSales)
      .map(([product, sales]) => ({
        product,
        sales,
        quantity: productQuantities[product],
        averagePrice: sales / productQuantities[product]
      }))
      .sort((a, b) => a.sales - b.sales);
    
    // Calculate how many products make up the bottom percentage
    const totalProducts = sortedProducts.length;
    const bottomCount = Math.max(1, Math.ceil(totalProducts * (percentage / 100)));
    
    // Get the bottom performers
    const bottomPerformers = sortedProducts.slice(0, bottomCount);
    
    // Calculate what percentage of total sales these represent
    const totalSales = sortedProducts.reduce((sum, item) => sum + item.sales, 0);
    const bottomSales = bottomPerformers.reduce((sum, item) => sum + item.sales, 0);
    const salesPercentage = (bottomSales / totalSales * 100).toFixed(1);
    
    // Format response
    const response = `# Low Performing Products Analysis

Based on your sales data, here are the **bottom ${percentage}% of products** by revenue that could be considered for elimination:

${bottomPerformers.map((item, i) => 
  `${i+1}. **${item.product}**: $${item.sales.toFixed(2)} (${item.quantity} units sold at avg. $${item.averagePrice.toFixed(2)} each)`
).join('\n')}

These ${bottomPerformers.length} products represent only ${salesPercentage}% of your total revenue.

## Recommendations

1. **Consider discontinuing**: ${bottomPerformers.slice(0, 3).map(item => item.product).join(', ')}
2. **Menu optimization**: Replacing these items would free up menu space and operational resources
3. **Alternatives**: Consider seasonal replacements or simplified versions that require fewer ingredients
4. **Before cutting**: Check if any of these items are new or have strategic importance beyond sales

Would you like a more detailed analysis of any specific product?`;
    
    return NextResponse.json({ answer: response });
  } catch (error) {
    console.error('Error in low performing products handler:', error);
    return null; // Return null to allow fallback to OpenAI
  }
}