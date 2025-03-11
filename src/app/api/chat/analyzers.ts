import { ProductPerformance, ProductRecommendation, LocationSales, MonthlyTrend, PromotionInsight } from '@/types/data';

// Data analysis and transformation functions

export async function analyzeProductPerformance(data: any[], productName: string): Promise<ProductPerformance> {
  console.log(`Analyzing performance data for ${productName}`);
  const rows = data.slice(1); // Skip header row
  
  // Filter for the specific product
  const productRows = rows.filter(row => 
    row[4] === productName // Column E is Product_Name
  );
  
  if (productRows.length === 0) {
    return {
      summary: `No data found for ${productName}.`,
      locationInsights: "No location data available.",
      timingPatterns: "No timing data available.",
      topLocations: [],
      monthlyTrends: [],
      promotions: [],
      totalSales: 0,
      avgOrderValue: 0,
      timeOfDayInsights: "No time of day data available.",
      dayOfWeekInsights: "No day of week data available.",
      promotionEffects: null,
      topTimeOfDay: [],
      topDaysOfWeek: []
    };
  }
  
  // Group sales by location and by location+month for deeper analysis
  const locationSales: Record<string, number> = {};
  const locationMonthlySales: Record<string, Record<string, number>> = {};
  
  // Group sales by month (overall)
  const monthlySales: Record<string, number> = {};
  
  // Track promotions
  const promotionImpact: Record<string, { count: number; total: number }> = {};
  
  // Add time-of-day tracking
  const timeOfDaySales: Record<string, number> = {
    'morning': 0,   // 6 AM - 11:59 AM
    'afternoon': 0, // 12 PM - 4:59 PM
    'evening': 0,   // 5 PM - 8:59 PM
    'night': 0      // 9 PM - 5:59 AM
  };
  
  // Track days of week
  const dayOfWeekSales: Record<string, number> = {
    'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 
    'Friday': 0, 'Saturday': 0, 'Sunday': 0
  };
  
  productRows.forEach(row => {
    const date = new Date(row[1]); // Column B is Purchase_Date
    const location = row[3]; // Column D is Store_Location
    const amount = parseFloat(row[8]) || 0; // Column I is Line_Total
    const hasPromotion = row[7] && row[7].trim() !== ""; // Column H is Discount_Code_Used
    
    // Add to location sales
    if (!locationSales[location]) locationSales[location] = 0;
    locationSales[location] += amount;
    
    // Add to monthly sales - using YYYY-MM format
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // Track monthly sales by location for location-specific trends
    if (!locationMonthlySales[location]) locationMonthlySales[location] = {};
    if (!locationMonthlySales[location][monthKey]) locationMonthlySales[location][monthKey] = 0;
    locationMonthlySales[location][monthKey] += amount;
    
    // Track overall monthly sales
    if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
    monthlySales[monthKey] += amount;
    
    // Track promotion impact
    if (hasPromotion) {
      const promoCode = row[7];
      if (!promotionImpact[promoCode]) {
        promotionImpact[promoCode] = { count: 0, total: 0 };
      }
      promotionImpact[promoCode].count++;
      promotionImpact[promoCode].total += amount;
    }
    
    // Add time-of-day analysis
    const fullDateTime = new Date(row[1]); // Column B has timestamp
    const hour = fullDateTime.getHours();
    
    // Categorize by time of day
    if (hour >= 6 && hour < 12) {
      timeOfDaySales['morning'] += amount;
    } else if (hour >= 12 && hour < 17) {
      timeOfDaySales['afternoon'] += amount;
    } else if (hour >= 17 && hour < 21) {
      timeOfDaySales['evening'] += amount;
    } else {
      timeOfDaySales['night'] += amount;
    }
    
    // Track day of week
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][fullDateTime.getDay()];
    dayOfWeekSales[dayOfWeek] += amount;
  });
  
  // Process location monthly trends to show location-specific patterns
  const locationMonthlyTrends: Record<string, Array<{month: string; sales: number}>> = {};
  Object.entries(locationMonthlySales).forEach(([location, months]) => {
    locationMonthlyTrends[location] = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, sales]) => {
        // Parse month for readability
        const [year, monthNum] = month.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        
        return {
          month: `${monthName} ${year}`,
          sales: sales as number
        };
      });
  });
  
  // Calculate total sales
  const totalSales = productRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
  
  // Calculate average order value
  const avgOrderValue = totalSales / productRows.length;
  
  // Find top locations
  const sortedLocations: LocationSales[] = Object.entries(locationSales)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([loc, sales]) => ({
      location: loc,
      sales: sales as number,
      percentage: ((sales as number) / totalSales) * 100
    }));
  
  // Generate enhanced location insights with month-over-month trends
  const enhancedLocationInsights = Object.entries(locationSales)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([loc, sales]) => {
      const percentage = ((sales as number) / totalSales) * 100;
      const trends = locationMonthlyTrends[loc];
      
      // Calculate location-specific growth if we have at least 2 months of data
      let growthText = '';
      if (trends && trends.length >= 2) {
        const firstMonth = trends[0].sales;
        const lastMonth = trends[trends.length - 1].sales;
        const growthRate = ((lastMonth - firstMonth) / firstMonth) * 100;
        
        growthText = ` with ${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}% trend`;
      }
      
      return `- ${loc}: $${(sales as number).toLocaleString('en-US', {minimumFractionDigits: 2})} (${percentage.toFixed(1)}% of total sales)${growthText}`;
    }).join('\n');
  
  // Analyze monthly trends
  const sortedMonths: MonthlyTrend[] = Object.entries(monthlySales)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, sales], index, array) => {
      // Calculate growth compared to previous month
      let growth = 0;
      if (index > 0) {
        const prevSales = array[index - 1][1] as number;
        growth = prevSales > 0 ? (((sales as number) - prevSales) / prevSales) * 100 : 0;
      }
      
      // Parse month into readable format
      const [yearVal, monthVal] = monthKey.split('-');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[parseInt(monthVal) - 1];
      
      return {
        month: `${monthName} ${yearVal}`,
        sales: sales as number,
        growth
      };
    });
  
  // Format promotion insights
  const promotionInsights: PromotionInsight[] = Object.entries(promotionImpact)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([code, data]) => ({
      code,
      usageCount: data.count,
      totalSales: data.total,
      avgOrderValue: data.total / data.count
    }));
  
  // Generate summary
  const summary = `
  ${productName} generated $${totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})} in total sales
  across ${productRows.length} transactions, with an average order value of 
  $${avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}.
  `;
  
  // Generate timing patterns
  const timingPatterns = sortedMonths.map(m => 
    `- ${m.month}: $${m.sales.toLocaleString('en-US', {minimumFractionDigits: 2})}${
      m.growth !== 0 ? ` (${m.growth > 0 ? '+' : ''}${m.growth.toFixed(1)}% from previous month)` : ''
    }`
  ).join('\n');
  
  // Generate promotion effects if any
  const promotionEffects = promotionInsights.length > 0 ? 
    promotionInsights.map(p => 
      `- ${p.code}: Used ${p.usageCount} times, generated $${p.totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})}, 
      avg order $${p.avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}`
    ).join('\n') : null;
  
  // Sort and format time of day insights
  const sortedTimeOfDay = Object.entries(timeOfDaySales)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([timeSlot, sales]) => ({
      timeSlot,
      sales: sales as number,
      percentage: ((sales as number) / totalSales) * 100
    }));
    
  // Sort and format day of week insights
  const sortedDaysOfWeek = Object.entries(dayOfWeekSales)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([day, sales]) => ({
      day,
      sales: sales as number,
      percentage: ((sales as number) / totalSales) * 100
    }));
  
  // Generate time of day insights text
  const timeOfDayInsights = sortedTimeOfDay
    .map(({ timeSlot, sales, percentage }) => 
      `- ${timeSlot}: $${sales.toLocaleString('en-US', {minimumFractionDigits: 2})} (${percentage.toFixed(1)}% of sales)`
    ).join('\n');
    
  // Generate day of week insights text
  const dayOfWeekInsights = sortedDaysOfWeek
    .map(({ day, sales, percentage }) => 
      `- ${day}: $${sales.toLocaleString('en-US', {minimumFractionDigits: 2})} (${percentage.toFixed(1)}% of sales)`
    ).join('\n');
  
  return {
    summary,
    locationInsights: enhancedLocationInsights,
    timingPatterns,
    timeOfDayInsights,
    dayOfWeekInsights,
    promotionEffects,
    totalSales,
    avgOrderValue,
    topLocations: sortedLocations,
    monthlyTrends: sortedMonths,
    topTimeOfDay: sortedTimeOfDay,
    topDaysOfWeek: sortedDaysOfWeek,
    promotions: promotionInsights
  };
}

export async function generateProductRecommendations(data: any[], productName: string): Promise<ProductRecommendation> {
  // First perform standard analysis
  const analysis = await analyzeProductPerformance(data, productName);
  
  // Add recommendation-specific insights
  const recommendations: ProductRecommendation = {
    ...analysis,
    
    // Identify best-performing location strategy
    topLocationStrategy: analysis.topLocations.length > 0 ? 
      `Consider adopting the approach from ${analysis.topLocations[0].location}, which generates 
       ${analysis.topLocations[0].percentage.toFixed(1)}% of total sales.` : null,
    
    // Find growth opportunities
    growthOpportunities: analysis.monthlyTrends.some(m => m.growth < 0) ?
      `Focus on reversing negative trends in ${
        analysis.monthlyTrends.filter(m => m.growth < 0).map(m => m.month).join(', ')
      }` : 'Maintain current growth momentum across all periods',
    
    // Identify promotion effectiveness
    promotionStrategy: analysis.promotions && analysis.promotions.length > 0 ?
      `The most effective promotion was "${analysis.promotions[0].code}" with an average order value of 
       $${analysis.promotions[0].avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}` :
      'No promotion data available - consider testing promotional discounts',
    
    // Location opportunities
    locationOpportunities: analysis.topLocations.length > 1 ?
      `The lowest performing location (${analysis.topLocations[analysis.topLocations.length-1].location}) 
       has ${
         (analysis.topLocations[analysis.topLocations.length-1].percentage / 
          analysis.topLocations[0].percentage * 100).toFixed(0)
       }% of the sales compared to your top location` : null
  };
  
  return recommendations;
} 