import { NextRequest, NextResponse } from 'next/server';
import { fetchSpreadsheetData, getDataMetadata, extractContext } from '@/lib/data';
import { validateEnv } from '@/utils/env';
import { 
  handleTopProductsQuery, 
  handleLocationQuery, 
  handleImprovementQuery, 
  handleGeneralQuery,
  handleBusinessIntelligence
} from './handlers';

export const dynamic = 'force-dynamic'; // Prevent route caching

// Main API handler
export async function POST(req: NextRequest) {
  try {
    const { question, conversation } = await req.json();
    const queryLower = question.toLowerCase();
    
    // Add this new classification section right after getting queryLower
    // Check if query is about low-performing products to cut
    const isLowPerformingQuery = 
      (queryLower.includes('cut') || 
       queryLower.includes('eliminate') || 
       queryLower.includes('remove') || 
       queryLower.includes('worst') || 
       queryLower.includes('bottom') || 
       queryLower.includes('lowest')) && 
      (queryLower.includes('product') || 
       queryLower.includes('item') || 
       queryLower.includes('sales'));
    
    if (isLowPerformingQuery) {
      console.log('Detected query about low-performing products');
      // Import the handler function
      const { handleLowPerformingProductsQuery } = await import('./handlers');
      
      // Fetch the data if not already done in existing code
      const { data } = await fetchSpreadsheetData();
      
      // Call the handler
      const result = await handleLowPerformingProductsQuery(question, data);
      if (result) return result;
    }
    
    // Validate environment variables
    const env = validateEnv();
    console.log('Environment validated');
    
    // Fetch the spreadsheet data
    console.log('Fetching data...');
    const { data } = await fetchSpreadsheetData();
    console.log('Data fetched successfully');
    
    // Get metadata about the data
    const metadata = getDataMetadata(data);
    const rows = data.slice(1); // Skip header row
    
    // Check if this is a store average order value query
    if (queryLower.includes('store') && 
        (queryLower.includes('highest') || queryLower.includes('best') || queryLower.includes('top')) &&
        (queryLower.includes('average order value') || queryLower.includes('aov'))) {
      
      console.log("Detected store average order value query");
      
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
        return NextResponse.json({ 
          answer: "I couldn't find any store performance data in the available records." 
        });
      }
      
      // Calculate company average for comparison
      const companyAvg = {
        aov: storeMetrics.reduce((sum, store) => sum + store.totalRevenue, 0) / 
             storeMetrics.reduce((sum, store) => sum + store.transactionCount, 0),
        itemsPerOrder: storeMetrics.reduce((sum, store) => sum + (store.itemsPerOrder * store.transactionCount), 0) / 
                       storeMetrics.reduce((sum, store) => sum + store.transactionCount, 0)
      };
      
      // Format the response
      return NextResponse.json({ 
        answer: `Based on complete transaction data across all locations, here are the average order values by store:

${storeMetrics.map((store, i) => 
  `${store.location}: $${store.aov.toFixed(2)}`).join('\n')}

${storeMetrics[0].location} has the highest average order value at $${storeMetrics[0].aov.toFixed(2)}, which is ${((storeMetrics[0].aov / companyAvg.aov - 1) * 100).toFixed(1)}% higher than the company average.

Analysis of ${storeMetrics[0].location}'s transactions shows:
- More items per order (${storeMetrics[0].itemsPerOrder.toFixed(1)} vs. company average of ${companyAvg.itemsPerOrder.toFixed(1)})
- Higher total revenue ($${storeMetrics[0].totalRevenue.toFixed(2)})
- ${storeMetrics[0].transactionCount} total transactions processed

The data comes from analyzing complete transactions (grouping all items purchased together) across all store locations.`
      });
    }
    
    // Detect location + product + time period queries
    if (
      // Location keywords
      (queryLower.includes('location') || queryLower.includes('store') || queryLower.includes('where')) &&
      
      // Revenue/sales keywords
      (queryLower.includes('highest') || queryLower.includes('best') || 
       queryLower.includes('most') || queryLower.includes('revenue') || 
       queryLower.includes('sold') || queryLower.includes('sales')) &&
      
      // Product detection - check for any product name
      metadata.availableProducts.some(product => queryLower.includes(product.toLowerCase())) &&
      
      // Time period detection
      queryLower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i) &&
      queryLower.match(/\b20\d{2}\b/)
    ) {
      console.log("Detected location + product + time query");
      
      // Extract product name
      const product = metadata.availableProducts.find(p => 
        queryLower.includes(p.toLowerCase()));
      
      // Extract month
      const monthMatch = queryLower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      const month = monthMatch ? monthMatch[1].toLowerCase() : null;
      
      // Extract year
      const yearMatch = queryLower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      if (product && month && year) {
        console.log(`Finding top location for ${product} in ${month} ${year}`);
        
        // Get month index
        const monthIndex = ["january", "february", "march", "april", "may", "june", 
                            "july", "august", "september", "october", "november", "december"]
                            .indexOf(month);
        
        // Calculate revenue by location for this product in this time period
        const locationRevenue: Record<string, number> = {};
        
        // Process data
        data.slice(1).forEach(row => { // Skip header row
          try {
            const dateStr = row[1]; // Column B - Purchase_Date
            const location = row[3]; // Column D - Store_Location
            const productName = row[4]; // Column E - Product_Name
            const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
            
            // Skip invalid rows
            if (!dateStr || !location || !productName || isNaN(lineTotal)) {
              return;
            }
            
            // Check product match
            if (productName !== product) {
              return;
            }
            
            // Parse date
            const rowDate = new Date(dateStr);
            if (isNaN(rowDate.getTime())) {
              return;
            }
            
            // Check month and year match
            const rowMonth = rowDate.getMonth();
            const rowYear = rowDate.getFullYear();
            
            if (rowMonth === monthIndex && rowYear === year) {
              // Add to location revenue
              locationRevenue[location] = (locationRevenue[location] || 0) + lineTotal;
            }
          } catch (e) {
            console.error("Error processing row for location revenue:", e);
          }
        });
        
        // Sort locations by revenue
        const sortedLocations = Object.entries(locationRevenue)
          .sort(([, a], [, b]) => b - a);
        
        if (sortedLocations.length === 0) {
          return NextResponse.json({ 
            answer: `I couldn't find any sales data for ${product} in ${month} ${year}.` 
          });
        }
        
        // Format the response
        const topLocation = sortedLocations[0];
        const answer = `Based on sales data for ${month.charAt(0).toUpperCase() + month.slice(1)} ${year}, the location with the highest revenue for ${product} was ${topLocation[0]} with $${topLocation[1].toFixed(2)} in sales.

Here's the complete breakdown by location:
${sortedLocations.map(([loc, rev], i) => 
  `${i+1}. ${loc}: $${rev.toFixed(2)}`
).join('\n')}`;
        
        // Check if this is a business intelligence query
        const biResponse = await handleBusinessIntelligence(queryLower, data);
        if (biResponse) {
          console.log("Routing to business intelligence handler");
          const responseBody = await biResponse.json();
          
          // Make sure we have a valid response
          if (responseBody) {
            console.log("BI handler returned response, type:", typeof responseBody.answer);
            
            // Debug the response 
            console.log("BI response content:", 
              typeof responseBody.answer,
              responseBody.answer ? responseBody.answer.substring(0, 50) : "empty"
            );
            
            // Return a fresh response to ensure proper formatting
            return NextResponse.json({ 
              answer: typeof responseBody.answer === 'string' 
                ? responseBody.answer 
                : JSON.stringify(responseBody.answer) || "I couldn't analyze the sales data correctly. Please try again."
            });
          }
        }
        
        return NextResponse.json({ answer });
      }
    }
    
    // IMPROVED QUERY DETECTION: More robust patterns to capture various question formats
    if (
      // Revenue by time period patterns - catch more variations of the question
      (queryLower.includes('revenue') || 
       queryLower.includes('sales') || 
       queryLower.includes('sell') || 
       queryLower.includes('performance') ||
       queryLower.includes('top product') || 
       queryLower.includes('highest') || 
       queryLower.includes('best')) && 
      
      // Month or time period detection
      (queryLower.includes('january') || 
       queryLower.includes('february') || 
       queryLower.includes('march') || 
       queryLower.includes('april') || 
       queryLower.includes('may') || 
       queryLower.includes('june') || 
       queryLower.includes('july') || 
       queryLower.includes('august') || 
       queryLower.includes('september') || 
       queryLower.includes('october') || 
       queryLower.includes('november') || 
       queryLower.includes('december') ||
       queryLower.includes('month') ||
       queryLower.includes('quarter') ||
       /q[1-4]/.test(queryLower))
    ) {
      console.log("Routing to revenue analysis function");
      
      // Replace the hardcoded December 2024 check with a dynamic month/year extractor
      if (queryLower.match(/january|february|march|april|may|june|july|august|september|october|november|december/i) && 
          queryLower.match(/\b20\d{2}\b/)) {
        console.log("Detected month/year revenue query, extracting details");
        
        // Extract month from query
        const monthMatch = queryLower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
        const month = monthMatch ? monthMatch[1].toLowerCase() : null;
        
        // Extract year from query
        const yearMatch = queryLower.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        
        if (month && year) {
          console.log(`Processing revenue data for ${month} ${year}`);
          
          try {
            // Generate direct sales report for the specified month and year
            const salesData = await generateDirectForecast(data, month, year);
            return NextResponse.json({ answer: salesData });
          } catch (error) {
            console.error(`Error processing ${month} ${year} data:`, error);
          }
        }
      }
      
      // Fallback to regular business intelligence handler
      const formattedResponse = await handleBusinessIntelligence(question, data);
      return NextResponse.json({ answer: formattedResponse });
    }
    
    // DIRECT QUERY HANDLERS FOR COMMON QUESTIONS
    // Check if this is a direct query about product sales in a specific month
    const productMatch = metadata.availableProducts.find(p => 
      queryLower.includes(p.toLowerCase()));
      
    const locationMatch = metadata.availableLocations.find(loc => 
      queryLower.includes(loc.toLowerCase()));
      
    // Update the month pattern to handle abbreviations
    const monthPattern = 
      '\\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\\s+(\\d{4})\\b';
    const monthMatch = queryLower.match(new RegExp(monthPattern, 'i'));
    
    // Check for top/best performing products query
    const topProductsMatch = /top|best|highest performing/i.test(queryLower) && 
                            /products/i.test(queryLower) &&
                            !productMatch; // Not asking about a specific product
    
    console.log('Query analysis:', { 
      hasProductMatch: !!productMatch, 
      hasLocationMatch: !!locationMatch,
      hasMonthMatch: !!monthMatch,
      isTopProductsQuery: topProductsMatch
    });
    
    // 1. Handle PRODUCT + MONTH queries directly
    if (productMatch && monthMatch && !locationMatch) {
      console.log(`Direct handling of product+month query for ${productMatch} in ${monthMatch[1]} ${monthMatch[2]}`);
      
      let month = monthMatch[1].toLowerCase();
      
      // Convert abbreviations to full month names
      const monthMap: Record<string, string> = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month as keyof typeof monthMap];
      }
      
      const year = monthMatch[2];
      
      // Create date object for target month
      const targetDate = new Date(`${month} 1, ${year}`);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      
      // Calculate sales directly for this product+month
      let monthlySales = 0;
      let orderCount = 0;
      
      for (const row of rows) {
        const rowProduct = row[4];
        
        // Skip non-matching products
        if (rowProduct !== productMatch) continue;
        
        // Parse date correctly
        const rowDate = new Date(row[1]);
        const rowMonth = rowDate.getMonth();
        const rowYear = rowDate.getFullYear();
        
        // Check exact month and year match
        if (rowMonth === targetMonth && rowYear === targetYear) {
          monthlySales += parseFloat(row[8]) || 0;
          orderCount++;
        }
      }
      
      // Calculate average order value if needed
      const avgOrderValue = orderCount > 0 ? monthlySales / orderCount : 0;
      
      // Return ONLY the direct factual answer
      console.log(`Returning direct answer: Sales for ${productMatch} in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      
      return NextResponse.json({ 
        answer: `Sales for ${productMatch} in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}.`
      });
    }
    
    // 2. Handle LOCATION + MONTH queries directly
    if (locationMatch && monthMatch && !productMatch) {
      console.log(`Direct handling of location+month query for ${locationMatch} in ${monthMatch[1]} ${monthMatch[2]}`);
      
      let month = monthMatch[1].toLowerCase();
      
      // Convert abbreviations to full month names
      const monthMap: Record<string, string> = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month as keyof typeof monthMap];
      }
      
      const year = monthMatch[2];
      
      // Create date object for target month
      const targetDate = new Date(`${month} 1, ${year}`);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      
      // Calculate sales directly for this location+month
      let monthlySales = 0;
      
      for (const row of rows) {
        const rowLocation = row[3];
        
        // Skip non-matching locations
        if (rowLocation !== locationMatch) continue;
        
        // Parse date correctly
        const rowDate = new Date(row[1]);
        const rowMonth = rowDate.getMonth();
        const rowYear = rowDate.getFullYear();
        
        // Check exact month and year match
        if (rowMonth === targetMonth && rowYear === targetYear) {
          monthlySales += parseFloat(row[8]) || 0;
        }
      }
      
      // Return ONLY the direct factual answer
      console.log(`Returning direct answer: Sales for ${locationMatch} in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      
      return NextResponse.json({ 
        answer: `Sales for the ${locationMatch} location in ${monthMatch[1]} ${year} were $${monthlySales.toLocaleString('en-US', {minimumFractionDigits: 2})}.`
      });
    }
    
    // 3. NEW: Handle TOP PRODUCTS query
    if (topProductsMatch && monthMatch) {
      console.log(`Direct handling of top products query for ${monthMatch[1]} ${monthMatch[2]}`);
      
      let month = monthMatch[1].toLowerCase();
      
      // Convert abbreviations to full month names
      const monthMap: Record<string, string> = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month as keyof typeof monthMap];
      }
      
      const year = monthMatch[2];
      
      // Create date object for target month - USING EXACT SAME APPROACH as product query
      const targetDate = new Date(`${month} 1, ${year}`);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      
      // Find number of products requested (default to 3)
      const numberMatch = queryLower.match(/top\s+(\d+)/i);
      const numProducts = numberMatch ? parseInt(numberMatch[1]) : 3;
      
      // Calculate sales for each product in this month
      const productSales: Record<string, number> = {};
      
      console.log(`Analyzing sales for ${month} ${year} (month index: ${targetMonth})`);
      
      for (const row of rows) {
        const rowProduct = row[4];
        if (!rowProduct) continue;
        
        // Parse date correctly - ENSURE SAME DATE PARSING AS OTHER HANDLERS
        const rowDate = new Date(row[1]);
        const rowMonth = rowDate.getMonth();
        const rowYear = rowDate.getFullYear();
        
        // Debug date issues
        if (month === 'december' && rowProduct === 'Protein Acai Bowl') {
          console.log(`Row date: ${row[1]}, parsed as month: ${rowMonth}, year: ${rowYear}`);
        }
        
        // Check exact month and year match
        if (rowMonth === targetMonth && rowYear === targetYear) {
          if (!productSales[rowProduct]) {
            productSales[rowProduct] = 0;
          }
          
          const amount = parseFloat(row[8]) || 0;
          productSales[rowProduct] += amount;
          
          // Debug protein acai bowl specifically
          if (rowProduct === 'Protein Acai Bowl') {
            console.log(`Adding ${amount} to Protein Acai Bowl, new total: ${productSales[rowProduct]}`);
          }
        }
      }
      
      // Sort products by sales and get top N
      const sortedProducts = Object.entries(productSales)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, numProducts);
      
      console.log(`Top products calculated: ${JSON.stringify(sortedProducts)}`);
      
      // Format response
      let answer = `The top ${numProducts} performing products in ${monthMatch[1]} ${year} were:\n\n`;
      
      sortedProducts.forEach(([product, sales], index) => {
        answer += `${index + 1}. ${product}: $${(sales as number).toLocaleString('en-US', {minimumFractionDigits: 2})}\n`;
      });
      
      console.log(`Returning direct answer for top products query`);
      return NextResponse.json({ answer });
    }
    
    // If not a direct factual query, use the regular handler
    console.log('No direct handler matched, using general query processing');
    
    // Extract context from the question
    console.log('Extracting context...');
    const context = await extractContext(question, data);
    console.log('Context extracted:', context);
    
    // First check if it's a business intelligence query
    const isBusinessQuery = queryLower.includes('improve') || 
                            queryLower.includes('increase') || 
                            queryLower.includes('sales') || 
                            queryLower.includes('revenue');

    if (isBusinessQuery) {
      console.log("Routing to business intelligence handler");
      
      try {
        // Call the handler and get direct response from it
        const answer = await generateBusinessIntelligenceResponse(queryLower, data);
        
        console.log("Generated BI response type:", typeof answer, "Length:", answer?.length || 0);
        console.log("First 50 chars of response:", answer.substring(0, 50));
        
        // COMPLETELY DIFFERENT APPROACH: Use NextResponse instead of Response
        return NextResponse.json({ 
          answer: answer 
        });
      } catch (error) {
        console.error("Error in business intelligence handler:", error);
        return NextResponse.json({ 
          answer: "Error analyzing business data" 
        }, { status: 500 });
      }
    }

    // If we reach here, use the general query handler
    console.log("Using general query handler");
    return await handleGeneralQuery(question, conversation, data, context);
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ error: "Failed to process your question" }, { status: 500 });
  }
}

async function generateDirectForecast(data: any[], month: string, year: number): Promise<string> {
  console.log(`Generating sales report for ${month} ${year}`);
  
  // Get month index (0-11) from month name
  const monthIndex = ["january", "february", "march", "april", "may", "june", 
                      "july", "august", "september", "october", "november", "december"]
                      .indexOf(month.toLowerCase());
  
  if (monthIndex === -1) {
    console.error(`Invalid month name: ${month}`);
    return `I couldn't process the sales data for ${month} ${year}. Please try again with a valid month name.`;
  }
  
  console.log(`Filtering for month index: ${monthIndex} (${month})`);
  
  // Get product revenue for the specified month
  const productRevenue: Record<string, number> = {};
  
  // Process data to find products with revenue in the specified month
  data.slice(1).forEach((row, idx) => { // Skip header row
    try {
      const dateStr = row[1]; // Column B - Purchase_Date (format: "2024-12-30 20:49:24")
      const productName = row[4]; // Column E - Product_Name
      const lineTotal = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Skip rows with missing data
      if (!dateStr || !productName || isNaN(lineTotal)) {
        return;
      }
      
      // Parse the date - handle the format "2024-12-30 20:49:24"
      let rowDate: Date;
      
      try {
        // First try the standard Date parsing
        rowDate = new Date(dateStr);
        
        // If that fails (invalid date), try manual parsing
        if (isNaN(rowDate.getTime())) {
          // Try to extract YYYY-MM-DD from the string
          const dateParts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateParts) {
            rowDate = new Date(
              parseInt(dateParts[1]), // year
              parseInt(dateParts[2]) - 1, // month (0-indexed)
              parseInt(dateParts[3]) // day
            );
          } else {
            console.warn(`Could not parse date: ${dateStr}`);
            return;
          }
        }
      } catch (e) {
        console.warn(`Error parsing date: ${dateStr}`, e);
        return;
      }
      
      // Check if this row is from the target month and year
      const rowMonth = rowDate.getMonth();
      const rowYear = rowDate.getFullYear();
      
      // Only include rows from the target month and year
      if (rowMonth === monthIndex && rowYear === year) {
        productRevenue[productName] = (productRevenue[productName] || 0) + lineTotal;
      }
    } catch (e) {
      console.error("Error processing row for sales data:", e);
    }
  });
  
  // Sort results
  const topProducts = Object.entries(productRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  console.log(`Found ${Object.keys(productRevenue).length} products with revenue data for ${month} ${year}`);
  
  // Format response with accurate language about historical data
  return `Based on the sales data for ${month.charAt(0).toUpperCase() + month.slice(1)} ${year}, here are the top products by revenue:

${topProducts.map((item, index) => 
  `${index + 1}. ${item[0]}: $${item[1].toFixed(2)}`
).join('\n')}

${topProducts.length > 0 ? 
  `${topProducts[0][0]} was the top performing product for the month with $${topProducts[0][1].toFixed(2)} in revenue.` : 
  'No product sales data was found for this period.'}`;
}

// Helper function that directly returns a string, not a Response object
async function generateBusinessIntelligenceResponse(query: string, data: any[]): Promise<string> {
  // Process the data to generate business insights
  const rows = data.slice(1); // Skip header row
  
  // Calculate product performance
  const productSales: Record<string, number> = {};
  const locationSales: Record<string, number> = {};
  
  rows.forEach((row, index) => {
    try {
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
      console.error("Error processing row:", e);
    }
  });
  
  // Get top products and locations
  const topProducts = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
    
  const topLocations = Object.entries(locationSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);
  
  // Generate a plain string answer (this works correctly)
  return `# Sales Improvement Plan

Based on analysis of your historical sales data, here are strategic recommendations to increase your sales next month:

## 1. Focus on Top-Performing Products
Your top revenue generators are:
${topProducts.map((p, i) => `- **${p[0]}**: $${p[1].toFixed(2)}`).join('\n')}

Ensure these products have prime visibility and adequate inventory.

## 2. Leverage Your Best Locations
These locations drive the most revenue:
${topLocations.map((l, i) => `- **${l[0]}**: $${l[1].toFixed(2)}`).join('\n')}

Consider running special promotions at these high-performing locations.

## 3. Strategic Recommendations
- Run a "New Year, New You" promotion featuring your healthiest products
- Implement a loyalty program reward for January purchases
- Consider limited-time products to create urgency
- Analyze December data for seasonal trends that might continue into January

Would you like more specific recommendations for any particular product or location?`;
} 