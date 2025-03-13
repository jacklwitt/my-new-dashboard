import { NextResponse } from 'next/server';
import { fetchSpreadsheetData } from '@/lib/data'; // Assuming this is your data fetching function

export async function POST(req: Request) {
  try {
    const { month, year } = await req.json();
    
    // Validate input
    if (!month || !year) {
      return NextResponse.json(
        { error: "Month and year are required" }, 
        { status: 400 }
      );
    }
    
    // Fetch data
    const { data } = await fetchSpreadsheetData();
    
    // Calculate forecast
    const forecast = await generateDirectForecast(data, month, year);
    
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error("Error in revenue forecast API:", error);
    return NextResponse.json(
      { error: "Failed to generate forecast" }, 
      { status: 500 }
    );
  }
}

async function generateDirectForecast(data: any[], month: string, year: number): Promise<string> {
  // Implementation similar to generateRevenueByTimeReport but with direct parameters
  // This avoids the question parsing step that might be failing
  
  // (Simplified implementation)
  // Get overall top products
  const productRevenue: Record<string, number> = {};
  
  // Find previous year data if available
  const previousYear = year - 1;
  const previousYearData: Record<string, number> = {};
  
  // Process data to find top products overall and previous year's same month
  data.forEach(row => {
    if (row[0] === 'Order_Date') return;
    
    try {
      const date = new Date(row[0]);
      const monthName = date.toLocaleString('default', { month: 'long' }).toLowerCase();
      const productName = row[4]; // Product name column
      const lineTotal = parseFloat(row[8] || '0'); // Revenue column
      
      // Add to overall totals
      productRevenue[productName] = (productRevenue[productName] || 0) + lineTotal;
      
      // Check if it's from previous year same month
      if (monthName === month.toLowerCase() && date.getFullYear() === previousYear) {
        previousYearData[productName] = (previousYearData[productName] || 0) + lineTotal;
      }
    } catch (e) {
      console.error("Error processing data for forecast:", e);
    }
  });
  
  // Sort results
  const topOverall = Object.entries(productRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
    
  const topPreviousYear = Object.entries(previousYearData)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  // Use previous year if available, otherwise overall
  const forecastProducts = topPreviousYear.length > 0 ? topPreviousYear : topOverall;
  
  // Format response
  return `Based on the sales data for ${month.charAt(0).toUpperCase() + month.slice(1)} ${year} (forecast), here are the projected top products by revenue:

${forecastProducts.map((item, index) => 
  `${index + 1}. ${item[0]}: $${item[1].toFixed(2)}${topPreviousYear.length > 0 ? ` (based on ${previousYear} data)` : ``}`
).join('\n')}

Note: Since ${month} ${year} is in the future, this represents a forecast based on ${topPreviousYear.length > 0 ? 
  `data from ${month} ${previousYear}` : 
  'overall historical performance'}.

Based on historical patterns, ${forecastProducts[0][0]} is projected to be the top performing product for this period.`;
} 