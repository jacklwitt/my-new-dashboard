import { NextRequest, NextResponse } from 'next/server';
import { fetchSpreadsheetData, getDataMetadata, extractContext } from '@/lib/data';
import { validateEnv } from '@/utils/env';
import { 
  handleTopProductsQuery, 
  handleLocationQuery, 
  handleImprovementQuery, 
  handleGeneralQuery 
} from './handlers';

export const dynamic = 'force-dynamic'; // Prevent route caching

// Main API handler
export async function POST(req: NextRequest) {
  try {
    const { question, conversation } = await req.json();
    console.log(`Processing question: ${question}`);
    
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
    
    // DIRECT QUERY HANDLERS FOR COMMON QUESTIONS
    // Check if this is a direct query about product sales in a specific month
    const productMatch = metadata.availableProducts.find(p => 
      question.toLowerCase().includes(p.toLowerCase()));
      
    const locationMatch = metadata.availableLocations.find(loc => 
      question.toLowerCase().includes(loc.toLowerCase()));
      
    // Update the month pattern to handle abbreviations
    const monthPattern = 
      '\\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\\s+(\\d{4})\\b';
    const monthMatch = question.match(new RegExp(monthPattern, 'i'));
    
    // Check for top/best performing products query
    const topProductsMatch = /top|best|highest performing/i.test(question) && 
                            /products/i.test(question) &&
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
      const monthMap = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month];
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
      const monthMap = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month];
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
      const monthMap = {
        'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april',
        'jun': 'june', 'jul': 'july', 'aug': 'august', 'sep': 'september', 
        'oct': 'october', 'nov': 'november', 'dec': 'december'
      };
      
      // Replace abbreviation with full name if needed
      if (month in monthMap) {
        month = monthMap[month];
      }
      
      const year = monthMatch[2];
      
      // Create date object for target month - USING EXACT SAME APPROACH as product query
      const targetDate = new Date(`${month} 1, ${year}`);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      
      // Find number of products requested (default to 3)
      const numberMatch = question.match(/top\s+(\d+)/i);
      const numProducts = numberMatch ? parseInt(numberMatch[1]) : 3;
      
      // Calculate sales for each product in this month
      const productSales = {};
      
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
    
    // Call the appropriate handler
    console.log('Calling general query handler...');
    return await handleGeneralQuery(question, conversation, data, context);
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ answer: "I'm having trouble processing your request. Please try again." }, { status: 500 });
  }
} 