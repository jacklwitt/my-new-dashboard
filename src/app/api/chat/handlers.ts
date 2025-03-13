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
    return NextResponse.json({ advice: completion.choices[0].message.content });
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

// Enhanced ChatGPT handling with all context and flexible data analysis
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
    
    // Determine if the question requires detailed data analysis
    const needsDetailedAnalysis = /performance|driver|compare|best|top|month|sale|revenue|trend|october|oct|2024|why|how|what/i.test(question);
    
    let systemPrompt = '';
    
    // If a custom prompt is provided, use it
    if (context.customSystemPrompt) {
      systemPrompt = context.customSystemPrompt;
    } 
    // If detailed analysis is needed, provide more comprehensive data
    else if (needsDetailedAnalysis) {
      console.log("Detailed analysis required, preparing comprehensive data...");
      
      // Basic data preparation - extract important rows
      const rows = data.slice(1); // Skip header row
      
      // 1. Calculate monthly sales for trend analysis
      const monthlySales: Record<string, number> = {};
      const productMonthlySales: Record<string, Record<string, number>> = {};
      const locationMonthlySales: Record<string, Record<string, number>> = {};
      
      // 2. Track top products and locations
      const productSales: Record<string, number> = {};
      const locationSales: Record<string, number> = {};
      
      // Process data once to extract all insights
      rows.forEach(row => {
        const date = new Date(row[1]); // Column B is Purchase_Date
        const location = row[3]; // Column D is Store_Location
        const product = row[4]; // Column E is Product_Name
        const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
        
        // Format month key
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        // Track monthly sales
        if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
        monthlySales[monthKey] += amount;
        
        // Track product sales
        if (!productSales[product]) productSales[product] = 0;
        productSales[product] += amount;
        
        // Track product sales by month
        if (!productMonthlySales[product]) productMonthlySales[product] = {};
        if (!productMonthlySales[product][monthKey]) productMonthlySales[product][monthKey] = 0;
        productMonthlySales[product][monthKey] += amount;
        
        // Track location sales
        if (!locationSales[location]) locationSales[location] = 0;
        locationSales[location] += amount;
        
        // Track location sales by month
        if (!locationMonthlySales[location]) locationMonthlySales[location] = {};
        if (!locationMonthlySales[location][monthKey]) locationMonthlySales[location][monthKey] = 0;
        locationMonthlySales[location][monthKey] += amount;
      });
      
      // Format monthly sales for the prompt
      const formattedMonthlySales = Object.entries(monthlySales)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, sales]) => {
          // Convert YYYY-MM to Month YYYY format
          const [year, monthNum] = month.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                             'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = monthNames[parseInt(monthNum) - 1];
          return {
            month: `${monthName} ${year}`,
            sales: sales
          };
        });
      
      // Find best performing month
      const bestMonth = formattedMonthlySales.reduce((best, current) => 
        current.sales > best.sales ? current : best, 
        { month: '', sales: 0 }
      );
      
      // Get top 5 products
      const topProducts = Object.entries(productSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([product, sales]) => ({ 
          product, 
          sales,
          percentage: (sales / Object.values(productSales).reduce((sum, val) => sum + val, 0)) * 100
        }));
      
      // Get top 5 locations
      const topLocations = Object.entries(locationSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([location, sales]) => ({ 
          location, 
          sales,
          percentage: (sales / Object.values(locationSales).reduce((sum, val) => sum + val, 0)) * 100
        }));
      
      // Look for month-specific insights
      // Extract month if mentioned in the question
      const monthMatch = question.match(/january|february|march|april|may|june|july|august|september|october|nov|dec/i);
      const targetMonth = monthMatch ? monthMatch[0].toLowerCase() : 'october';
      
      // Find the month key that matches the target month
      const targetMonthKey = Object.entries(formattedMonthlySales)
        .find(([, data]) => data.month.toLowerCase().includes(targetMonth))
        ?.[1]?.month || bestMonth.month;
      
      // Get month-specific product performance
      const monthProducts = topProducts.map(p => {
        // Find the month key for the target month
        const matchingMonthKey = Object.keys(productMonthlySales[p.product] || {})
          .find(key => {
            const [year, monthNum] = key.split('-');
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = monthNames[parseInt(monthNum) - 1];
            return `${monthName} ${year}`.toLowerCase().includes(targetMonth.toLowerCase());
          });
        
        return {
          ...p,
          targetMonthSales: matchingMonthKey ? productMonthlySales[p.product][matchingMonthKey] : 0
        };
      }).sort((a, b) => b.targetMonthSales - a.targetMonthSales);
      
      // Enhanced comprehensive system prompt with data summaries for detailed analysis
      systemPrompt = `You are a data analyst providing insights on retail sales performance.

DATA ANALYSIS CONTEXT:
- Data Range: ${metadata.timeRange[0]} to ${metadata.timeRange[metadata.timeRange.length-1]}
- Products Analyzed: ${metadata.availableProducts.length} products
- Locations: ${metadata.availableLocations.length} locations

MONTHLY SALES TREND:
${formattedMonthlySales.map(m => `${m.month}: $${m.sales.toLocaleString()}`).join('\n')}

BEST PERFORMING MONTH:
${bestMonth.month}: $${bestMonth.sales.toLocaleString()}

TOP PRODUCTS OVERALL:
${topProducts.map((p, i) => `${i+1}. ${p.product}: $${p.sales.toLocaleString()} (${p.percentage}% of total sales)`).join('\n')}

TOP PRODUCTS IN ${targetMonthKey.toUpperCase()}:
${monthProducts.slice(0, 5).map((p, i) => `${i+1}. ${p.product}: $${p.targetMonthSales.toLocaleString()}`).join('\n')}

TOP LOCATIONS:
${topLocations.map((l, i) => `${i+1}. ${l.location}: $${l.sales.toLocaleString()} (${l.percentage}% of total sales)`).join('\n')}

IMPORTANT GUIDELINES:
1. Be specific and data-driven in your analysis
2. Identify specific factors that drove performance in the time period being discussed
3. Provide clear comparisons between periods when relevant
4. Focus on the specific question being asked
5. When discussing drivers of performance, consider products, locations, and sales trends

USER QUESTION: "${question}"`;
    } 
    // For simpler questions, use a basic system prompt
    else {
      systemPrompt = `You are a business analyst assistant helping with sales data analysis.
      When you answer, be specific, data-driven, and concise.`;
    }
    
    // Use the question directly rather than complex JSON
    const messages = [
      { role: 'system', content: systemPrompt },
      // Include limited conversation history if available
      ...(conversation?.slice(-2)?.map(msg => ({
        role: msg.role, 
        content: msg.content
      })) || []), 
      { role: 'user', content: question }
    ];
    
    console.log("Sending request to OpenAI...");
    
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
            model: needsDetailedAnalysis ? "gpt-4o-mini" : "gpt-3.5-turbo",
            messages,
            temperature: 0.7,
            max_tokens: 800
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

// Add specialized business intelligence functions

export async function handleBusinessIntelligence(query: string, data: any[]) {
  const queryLower = query.toLowerCase();
  
  console.log("Handling business intelligence query:", queryLower);
  
  // Add detection for average order value/store performance queries
  if ((queryLower.includes('average order value') || 
       queryLower.includes('aov') || 
       queryLower.includes('highest order') || 
       queryLower.includes('order size') || 
       queryLower.includes('transaction value')) && 
      (queryLower.includes('store') || 
       queryLower.includes('location'))) {
    
    console.log("Detected store average order value query");
    return NextResponse.json({ answer: generateStorePerformanceReport(data) });
  }
  
  // Existing condition for seasonal product comparison
  if (queryLower.includes('summer') && queryLower.includes('winter')) {
    return NextResponse.json({ answer: generateSeasonalProductComparison(data) });
  }
  
  // Store performance metrics
  if (queryLower.includes('store performance') || 
      queryLower.includes('location performance')) {
    return NextResponse.json({ answer: generateStorePerformanceReport(data) });
  }

  // Add other business intelligence queries here
  
  return null; // Return null if no handler matched, so the calling function can try other handlers
}

function generateRevenueByTimeReport(data: any[], query: string): string {
  // Extract month from query
  const monthMatches = /january|february|march|april|may|june|july|august|september|october|november|december/i.exec(query);
  const targetMonth = monthMatches ? monthMatches[0].toLowerCase() : 'december';
  
  // Extract year with better regex and fallbacks
  let year = new Date().getFullYear(); // Default to current year
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1]);
  }
  
  // Check if requested date is in the future
  const currentDate = new Date();
  const requestedDate = new Date(year, ["january", "february", "march", "april", "may", "june", "july", 
                                        "august", "september", "october", "november", "december"]
                                        .indexOf(targetMonth), 1);
  const isFutureDate = requestedDate > currentDate;
  
  // For future dates, use latest year's same month data as a forecast basis
  const dataYear = isFutureDate ? currentDate.getFullYear() : year;
  
  console.log(`Analyzing revenue for ${targetMonth} ${year} (using data from ${dataYear})`);
  
  // Parse data to find products with revenue in specified month
  const productRevenue: Record<string, number> = {};
  
  // Process data with better date parsing
  data.forEach(row => {
    if (row[0] === 'Order_Date') return; // Skip header
    
    try {
      // Handle multiple date formats
      const dateParts = row[0].split(/[-\/]/);
      let date: Date;
      
      // Try different date formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
      if (dateParts[0].length === 4) {
        date = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      } else {
        date = new Date(row[0]);
      }
      
      if (isNaN(date.getTime())) {
        console.warn("Invalid date:", row[0]);
        return;
      }
      
      const monthName = date.toLocaleString('default', { month: 'long' }).toLowerCase();
      const productName = row[4]; // Column E - Product_Name
      const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Match based on month name, not month number
      if (monthName === targetMonth.toLowerCase() && date.getFullYear() === dataYear) {
        productRevenue[productName] = (productRevenue[productName] || 0) + lineTotal;
      }
    } catch (e) {
      console.error("Error processing row for revenue analysis:", e);
    }
  });
  
  // Sort products by revenue
  const sortedProducts = Object.entries(productRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // Top 5 products
  
  // If no data but future date, use historical projections or placeholder
  if (sortedProducts.length === 0 && isFutureDate) {
    // Get top products overall to use as a fallback
    const overallProductRevenue: Record<string, number> = {};
    
    // Process all data to find overall top products
    data.forEach(row => {
      if (row[0] === 'Order_Date') return; // Skip header
      
      try {
        const productName = row[4]; // Column E - Product_Name
        const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
        
        overallProductRevenue[productName] = (overallProductRevenue[productName] || 0) + lineTotal;
      } catch (e) {
        console.error("Error processing row for overall product analysis:", e);
      }
    });
    
    // Sort products by overall revenue
    const topOverallProducts = Object.entries(overallProductRevenue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Top 5 products
    
    // Find data from previous year if available  
    const previousYear = year - 1;
    const previousYearData: {product: string, revenue: number}[] = [];
    
    // Try to find same month in previous year
    data.forEach(row => {
      if (row[0] === 'Order_Date') return;
      
      try {
        const date = new Date(row[0]);
        const monthName = date.toLocaleString('default', { month: 'long' }).toLowerCase();
        
        if (monthName === targetMonth.toLowerCase() && date.getFullYear() === previousYear) {
          const productName = row[4];
          const lineTotal = parseFloat(row[8] || '0');
          
          // Find product in array or add it
          const existingProduct = previousYearData.find(p => p.product === productName);
          if (existingProduct) {
            existingProduct.revenue += lineTotal;
          } else {
            previousYearData.push({product: productName, revenue: lineTotal});
          }
        }
      } catch (e) {
        console.error("Error processing previous year data:", e);
      }
    });
    
    // Sort previous year data
    previousYearData.sort((a, b) => b.revenue - a.revenue);
    
    // Use previous year data if available, otherwise use overall top products
    const forecastProducts = previousYearData.length > 0 ? 
      previousYearData.slice(0, 5).map(p => ({product: p.product, revenue: p.revenue})) : 
      topOverallProducts.map(([product, revenue]) => ({product, revenue}));
    
    return `Based on the sales data for ${targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1)} ${year} (forecast), here are the projected top products by revenue:

${forecastProducts.map((item, index) => 
  `${index + 1}. ${item.product}${previousYearData.length > 0 ? `: $${item.revenue.toFixed(2)} (based on ${previousYear} data)` : ''}`
).join('\n')}

Note: Since ${targetMonth} ${year} is in the future, this represents a forecast based on ${previousYearData.length > 0 ? `data from ${targetMonth} ${previousYear}` : 'overall historical performance'}.

${forecastProducts.length > 0 ? 
  `Based on historical patterns, ${forecastProducts[0].product} is projected to be the top performing product for this period.` : 
  'No historical data is available for a precise forecast.'}`;
  }
  
  // Format the response with better spacing
  return `Based on the sales data for ${targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1)} ${year}${isFutureDate ? ' (forecast)' : ''}, here are the top products by revenue:

${sortedProducts.length > 0 ? 
  sortedProducts.map(([product, revenue], index) => 
    `${index + 1}. ${product}: $${revenue.toFixed(2)}`
  ).join('\n\n')
  : 
  `I couldn't find revenue data for ${targetMonth} ${year}. The available data might not include this time period.`
}

${isFutureDate ? `Note: Since ${targetMonth} ${year} is in the future, this represents a forecast based on historical performance.` : ''}

${sortedProducts.length > 0 ? 
  `The ${sortedProducts[0][0]} is the top performing product with $${parseFloat(sortedProducts[0][1].toString()).toFixed(2)} in revenue for this period.` 
  : 
  ''}`;
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