import { ProductRecommendation, LocationSales, MonthlyTrend, PromotionInsight } from '@/types/data';

// Data analysis and transformation functions

export interface ProductPerformance {
  summary: string;
  locationInsights: string;
  timingPatterns: string;
  topLocations: any[];
  monthlyTrends: any[];
  promotions: any[];
  totalSales: number;
  avgOrderValue: number;
  timeOfDayInsights: string;
  dayOfWeekInsights: string;
  promotionEffects: any;
  topTimeOfDay: any[];
  topDaysOfWeek: any[];
  priceAnalysis?: {
    currentPrice: number;
    recommendedPrice: number;
    recommendedPriceRationale: string;
    formattedReport: any;
    error?: boolean;
  };
}

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
    .map(([code, data]) => ({
      code,
      totalRevenue: data.total,
      count: data.count,
      avgDiscount: 0,
      unitsPerOrder: 0
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  // Generate summary
  const summary = `
  ${productName} generated $${totalSales.toLocaleString('en-US', {minimumFractionDigits: 2})} in total sales
  across ${productRows.length} transactions, with an average order value of 
  $${avgOrderValue.toLocaleString('en-US', {minimumFractionDigits: 2})}.
  `;
  
  // Generate timing patterns
  const timingPatterns = sortedMonths.map(m => 
    `- ${m.month}: $${m.sales.toLocaleString('en-US', {minimumFractionDigits: 2})}${
      m.growth !== undefined && m.growth !== 0 ? ` (${m.growth > 0 ? '+' : ''}${m.growth.toFixed(1)}% from previous month)` : ''
    }`
  ).join('\n');
  
  // Generate promotion effects if any
  const promotionEffects = promotionInsights.length > 0 ? 
    promotionInsights.map(p => 
      `- ${p.code}: Used ${p.count} times, generated $${p.totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2})},
        avg order $${(p.totalRevenue / p.count).toLocaleString('en-US', {minimumFractionDigits: 2})}`
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
  
  const priceAnalysisResult = await analyzePricePerformance(data, productName);
  
  const priceAnalysis = priceAnalysisResult.error ? 
    {
      currentPrice: 0,
      recommendedPrice: 0,
      recommendedPriceRationale: '',
      formattedReport: {},
      error: true
    } : 
    {
      currentPrice: priceAnalysisResult.currentPrice || 0,
      recommendedPrice: priceAnalysisResult.recommendedPrice || 0,
      recommendedPriceRationale: priceAnalysisResult.recommendedPriceRationale || '',
      formattedReport: {
        currentPrice: priceAnalysisResult.currentPrice,
        optimalPrice: priceAnalysisResult.recommendedPrice,
        priceComparison: priceAnalysisResult.pricePoints || [],
        elasticity: priceAnalysisResult.priceElasticity,
        explanation: priceAnalysisResult.elasticityExplanation
      }
    };
  
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
    promotions: promotionInsights,
    priceAnalysis
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
    growthOpportunities: analysis.monthlyTrends.some(m => m.growth !== undefined && m.growth < 0) ?
      `Focus on reversing negative trends in ${
        analysis.monthlyTrends.filter(m => m.growth !== undefined && m.growth < 0).map(m => m.month).join(', ')
      }` : 'Maintain current growth momentum across all periods'
  };
  
  return recommendations;
}

// Enhanced price performance analyzer with promotion learning capabilities

export async function analyzePricePerformance(data: any, product: string) {
  try {
    console.log(`Analyzing price performance for ${product}...`);
    
    // Consolidate data formats
    let allRows = [];
    if (Array.isArray(data)) {
      allRows = data;
    } else if (data?.values && Array.isArray(data.values)) {
      allRows = data.values;
    } else if (data?.data && Array.isArray(data.data)) {
      allRows = data.data;
    } else {
      console.error("No usable data format found");
      throw new Error("Invalid data format");
    }
    
    // Column indexes
    const PRODUCT_COL = 4;  // Column E - Product_Name
    const UNIT_PRICE_COL = 5;  // Column F - Unit_Price (original price)
    const QUANTITY_COL = 6;  // Column G - Quantity
    const DISCOUNT_COL = 7;  // Column H - Discount_Code_Used
    const LINE_TOTAL_COL = 8;  // Column I - Line_Total (actual amount paid)
    
    // Skip the header row
    const dataRows = allRows.slice(1);
    
    // Clean the search product name
    const searchProduct = product?.toString().trim() || '';
    if (!searchProduct) {
      throw new Error("No product name provided");
    }
    
    console.log(`Looking for exact matches for: "${searchProduct}"`);
    
    // ---- Step 1: Extract all sales data for this product ----
    let matchingProducts = new Set();
    let mostRecentUnitPrice = 0;
    let mostRecentDate = new Date(0);
    
    // Track both list prices and effective prices separately for clarity
    const salesByListPrice: Record<string, {
      units: number;
      revenue: number;
      orders: number;
      dates: Date[];
      discounted: boolean;
      effectivePrices: Record<string, number>; // Track volume at each effective price
      promotions: Record<string, {
        units: number;
        revenue: number;
        orders: number;
      }>;
    }> = {};
    
    // Process each row of data
    dataRows.forEach((row: any) => {
      if (!row || !Array.isArray(row)) return;
      
      // Only process exact product name matches
      const rowProduct = row[PRODUCT_COL]?.toString().trim() || '';
      if (rowProduct !== searchProduct) return;
      
      try {
        // Add to matching products set
        matchingProducts.add(rowProduct);
        
        // Get core data points
        const listPrice = parseFloat(row[UNIT_PRICE_COL]) || 0;
        const quantity = parseInt(row[QUANTITY_COL], 10) || 1;
        const lineTotal = parseFloat(row[LINE_TOTAL_COL]) || 0;
        const discountCode = row[DISCOUNT_COL] || '';
        
        // Skip invalid rows
        if (listPrice <= 0 || quantity <= 0) {
          return;
        }
        
        // Calculate effective price (what the customer actually paid per unit)
        const effectivePrice = lineTotal > 0 ? 
                            parseFloat((lineTotal / quantity).toFixed(2)) : 
                            listPrice;
                            
        // Check if this transaction was discounted
        const isDiscounted = (discountCode !== '') || (effectivePrice < listPrice * 0.98); // Allow 2% variation
        
        // Parse date if available
        let transactionDate = new Date();
        if (row[1]) { // Column B is Purchase_Date
          try {
            const parsed = new Date(row[1]);
            if (!isNaN(parsed.getTime())) {
              transactionDate = parsed;
            }
          } catch (e) {
            // Use default date if parsing fails
          }
        }
        
        // Update most recent list price
        if (transactionDate > mostRecentDate) {
          mostRecentDate = transactionDate;
          mostRecentUnitPrice = listPrice;
        }
        
        // Round list price to ensure consistent keys
        const listPriceKey = listPrice.toFixed(2);
        
        // Initialize this list price entry if needed
        if (!salesByListPrice[listPriceKey]) {
          salesByListPrice[listPriceKey] = {
            units: 0,
            revenue: 0,
            orders: 0,
            dates: [],
            discounted: false,
            effectivePrices: {},
            promotions: {}
          };
        }
        
        // Add data for this list price
        salesByListPrice[listPriceKey].units += quantity;
        salesByListPrice[listPriceKey].revenue += lineTotal;
        salesByListPrice[listPriceKey].orders += 1;
        salesByListPrice[listPriceKey].dates.push(transactionDate);
        salesByListPrice[listPriceKey].discounted = salesByListPrice[listPriceKey].discounted || isDiscounted;
        
        // Track the distribution of effective prices
        const effectivePriceKey = effectivePrice.toFixed(2);
        if (!salesByListPrice[listPriceKey].effectivePrices[effectivePriceKey]) {
          salesByListPrice[listPriceKey].effectivePrices[effectivePriceKey] = 0;
        }
        salesByListPrice[listPriceKey].effectivePrices[effectivePriceKey] += quantity;
        
        // Track promotion performance separately
        if (discountCode) {
          if (!salesByListPrice[listPriceKey].promotions[discountCode]) {
            salesByListPrice[listPriceKey].promotions[discountCode] = {
              units: 0,
              revenue: 0,
              orders: 0
            };
          }
          salesByListPrice[listPriceKey].promotions[discountCode].units += quantity;
          salesByListPrice[listPriceKey].promotions[discountCode].revenue += lineTotal;
          salesByListPrice[listPriceKey].promotions[discountCode].orders += 1;
        }
        
      } catch (err) {
        console.error('Error processing row:', err);
      }
    });
    
    // ---- ENHANCEMENT: Analyze promotion effectiveness ----
    // Track the best performing promotions across all price points
    const promotionPerformance: Record<string, {
      totalUnits: number;
      totalRevenue: number;
      totalOrders: number;
      avgDiscount: number;
      conversionRate: number; // how often this promotion leads to purchases
    }> = {};
    
    // Analyze each price point's promotional data
    Object.entries(salesByListPrice).forEach(([listPriceStr, data]) => {
      const listPrice = parseFloat(listPriceStr);
      
      // Process each promotion for this price point
      Object.entries(data.promotions).forEach(([code, stats]) => {
        if (!promotionPerformance[code]) {
          promotionPerformance[code] = {
            totalUnits: 0,
            totalRevenue: 0,
            totalOrders: 0,
            avgDiscount: 0,
            conversionRate: 0
          };
        }
        
        // Track total performance metrics
        promotionPerformance[code].totalUnits += stats.units;
        promotionPerformance[code].totalRevenue += stats.revenue;
        promotionPerformance[code].totalOrders += stats.orders;
        
        // Calculate average effective price with this promotion
        const avgEffectivePrice = stats.revenue / stats.units;
        const discountAmount = listPrice - avgEffectivePrice;
        const discountPercent = (discountAmount / listPrice) * 100;
        
        // Update running average discount
        const prevTotal = promotionPerformance[code].avgDiscount * 
                         (promotionPerformance[code].totalOrders - stats.orders);
        promotionPerformance[code].avgDiscount = 
          (prevTotal + (discountPercent * stats.orders)) / promotionPerformance[code].totalOrders;
      });
    });
    
    // Sort promotions by revenue to find the most effective ones
    const topPromotions = Object.entries(promotionPerformance)
      .map(([code, data]) => ({
        code,
        ...data,
        revenuePerUnit: data.totalRevenue / data.totalUnits,
        unitsPerOrder: data.totalUnits / data.totalOrders
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // ---- Step 2: Create price points with enhanced promotion data ----
    const pricePoints = Object.entries(salesByListPrice).map(([priceStr, data]) => {
      const listPrice = parseFloat(priceStr);
      
      // Calculate average effective price
      let totalEffectiveRevenue = 0;
      let totalEffectiveUnits = 0;
      
      Object.entries(data.effectivePrices).forEach(([effectivePriceStr, units]) => {
        const effectivePrice = parseFloat(effectivePriceStr);
        totalEffectiveRevenue += effectivePrice * units;
        totalEffectiveUnits += units;
      });
      
      const avgEffectivePrice = totalEffectiveUnits > 0 ? 
                                totalEffectiveRevenue / totalEffectiveUnits : 
                                listPrice;
      
      // Calculate promotion metrics for this price point
      const promotionCodes = Object.keys(data.promotions);
      const promoUnits = promotionCodes.reduce((sum, code) => 
        sum + data.promotions[code].units, 0);
      const promoRevenue = promotionCodes.reduce((sum, code) => 
        sum + data.promotions[code].revenue, 0);
      
      // Calculate dates
      const validDates = data.dates.filter(d => !isNaN(d.getTime()));
      const firstDate = validDates.length > 0 ? 
                       new Date(Math.min(...validDates.map(d => d.getTime()))) : 
                       new Date();
      const lastDate = validDates.length > 0 ? 
                      new Date(Math.max(...validDates.map(d => d.getTime()))) : 
                      new Date();
      
      // Calculate discount percentage with improved handling
      const discountAmount = listPrice - avgEffectivePrice;
      const discountPercentage = (discountAmount / listPrice) * 100;
      
      return {
        listPrice,
        avgEffectivePrice: parseFloat(avgEffectivePrice.toFixed(2)),
        units: data.units,
        revenue: data.revenue,
        orders: data.orders,
        firstUsed: firstDate,
        lastUsed: lastDate,
        isDiscounted: data.discounted,
        discountPercentage: discountPercentage > 0 ? 
                           discountPercentage.toFixed(1) + '%' : 
                           '0%',
        unitsPerOrder: data.orders > 0 ? 
                      (data.units / data.orders).toFixed(1) : 
                      '0',
        // Promotion-specific metrics for this price point
        promoUnits,
        promoRevenue,
        promoPercentage: data.units > 0 ? 
                        ((promoUnits / data.units) * 100).toFixed(1) + '%' : 
                        '0%',
        // Track which promotions were used at this price
        promotions: promotionCodes
      };
    }).sort((a, b) => b.revenue - a.revenue); // Sort by revenue for initial display
    
    // ---- Step 3: Determine current price and best performing price options ----
    const currentPrice = mostRecentUnitPrice > 0 ? 
                         mostRecentUnitPrice : 
                         (pricePoints.length > 0 ? pricePoints[0].listPrice : 0);
    
    // Identify significant volume threshold (avoid recommendations based on tiny sample sizes)
    const significantVolumeThreshold = Math.max(
      5, // Minimum absolute threshold
      pricePoints.reduce((sum, p) => sum + p.units, 0) * 0.05 // Or 5% of total sales
    );
    
    // Find prices with significant volume
    const significantPricePoints = pricePoints
      .filter(p => p.units >= significantVolumeThreshold)
      .sort((a, b) => b.revenue - a.revenue);
    
    // Best revenue price (from prices with significant volume)
    const bestRevenuePrice = significantPricePoints.length > 0 ? 
                            significantPricePoints[0].listPrice : 
                            currentPrice;
    
    // Best profit margin price point (highest effective price that still maintains volume)
    const profitMarginPricePoints = significantPricePoints
      .sort((a, b) => b.listPrice - a.listPrice);
    
    const bestMarginPrice = profitMarginPricePoints.length > 0 ?
                            profitMarginPricePoints[0].listPrice :
                            currentPrice;
    
    // ---- Step 4: Calculate elasticity with promotion awareness ----
    let priceElasticity = 0;
    let elasticityExplanation = '';
    let promotionInsight = '';
    
    // If we have at least 2 price points with significant volume, calculate elasticity
    if (significantPricePoints.length >= 2) {
      // Sort by price for elasticity calculation
      const sortedByPrice = [...significantPricePoints].sort((a, b) => a.listPrice - b.listPrice);
      
      // Find lowest and highest price with significant sales
      const lowestPrice = sortedByPrice[0];
      const highestPrice = sortedByPrice[sortedByPrice.length - 1];
      
      // Only calculate if there's a meaningful price difference
      if (highestPrice.listPrice > lowestPrice.listPrice * 1.05) { // At least 5% difference
        // Calculate elasticity using arc elasticity formula for better accuracy
        const avgPrice = (lowestPrice.listPrice + highestPrice.listPrice) / 2;
        const avgQuantity = (lowestPrice.units + highestPrice.units) / 2;
        
        const percentPriceChange = (highestPrice.listPrice - lowestPrice.listPrice) / avgPrice;
        const percentQuantityChange = (lowestPrice.units - highestPrice.units) / avgQuantity;
        
        if (percentPriceChange !== 0 && isFinite(percentPriceChange)) {
          priceElasticity = percentQuantityChange / percentPriceChange;
          
          // Check for promotional effects
          const hasSignificantPromotions = significantPricePoints.some(p => 
            p.promoUnits > p.units * 0.2); // If >20% of units were sold with promotions
          
          if (hasSignificantPromotions) {
            // Calculate separate elasticity for promoted vs. non-promoted sales
            const promotedPricePoints = significantPricePoints.filter(p => p.promoUnits > 0);
            const nonPromotedPricePoints = significantPricePoints.filter(p => p.promoUnits === 0);
            
            // Add promotion insights
            if (promotedPricePoints.length > 0) {
              const avgPromotedDiscount = promotedPricePoints
                .reduce((sum, p) => sum + parseFloat(p.discountPercentage), 0) / promotedPricePoints.length;
              
              promotionInsight = 
                `Promotions were used in ${promotedPricePoints.length} out of ${significantPricePoints.length} ` +
                `price points, with an average discount of ${avgPromotedDiscount.toFixed(1)}%. `;
              
              if (topPromotions.length > 0) {
                promotionInsight += `The most effective promotion was "${topPromotions[0].code}" ` +
                  `with an average discount of ${topPromotions[0].avgDiscount.toFixed(1)}% ` +
                  `and ${topPromotions[0].unitsPerOrder.toFixed(1)} units per order.`;
              }
            }
            
            elasticityExplanation = 
              `Price elasticity (${priceElasticity.toFixed(2)}) is influenced by promotional activity. ` +
              `${promotionInsight}`;
          } else {
            elasticityExplanation = 
              `Price elasticity (${priceElasticity.toFixed(2)}) represents how sales volume ` +
              `responds to price changes. `;
            
            if (priceElasticity > 1.0) {
              elasticityExplanation += `Your customers are sensitive to price changes.`;
            } else if (priceElasticity > 0) {
              elasticityExplanation += `Your customers are relatively insensitive to price changes.`;
            } else {
              elasticityExplanation += 
                `The unusual pattern suggests factors beyond price are driving purchasing decisions.`;
            }
          }
        }
      } else {
        elasticityExplanation = 
          `There isn't enough price variation in your data to calculate meaningful elasticity. ` +
          `Try testing prices that differ by at least 10%.`;
      }
    } else {
      elasticityExplanation = 
        `Need data from at least two different price points with significant sales volume ` +
        `to calculate price elasticity.`;
    }
    
    // ---- Step 5: Generate price recommendations based on data and promotions ----
    let recommendedPrice = currentPrice; // Default to current price
    let recommendedPriceRationale = '';
    
    // If we have enough data points, make a recommendation
    if (significantPricePoints.length >= 2) {
      // Apply different recommendation logic based on elasticity and promotion data
      if (priceElasticity !== 0 && isFinite(priceElasticity)) {
        if (priceElasticity > 1.5) {
          // Highly elastic (very price sensitive) - focus on volume
          recommendedPrice = Math.min(currentPrice, bestRevenuePrice);
          
          recommendedPriceRationale = 
            `Sales volume is highly sensitive to price (elasticity: ${priceElasticity.toFixed(2)}). ` +
            `The recommended price maximizes revenue by increasing sales volume.`;
            
          // Add promotion advice for elastic products
          if (topPromotions.length > 0) {
            recommendedPriceRationale += 
              ` Consider regular promotions like "${topPromotions[0].code}" ` +
              `which has been effective at driving volume.`;
          }
        } else if (priceElasticity < 0.8 && priceElasticity > 0) {
          // Inelastic demand - focus on margin
          recommendedPrice = Math.max(currentPrice, bestMarginPrice);
          
          recommendedPriceRationale = 
            `Sales volume changes very little with price (elasticity: ${priceElasticity.toFixed(2)}). ` +
            `A higher price point will increase profit margins without significantly reducing volume.`;
            
          // Add promotion advice for inelastic products
          if (topPromotions.length > 0) {
            recommendedPriceRationale += 
              ` Limited, strategic promotions like "${topPromotions[0].code}" ` +
              `can be used for special occasions while maintaining premium pricing.`;
          }
        } else if (priceElasticity < 0) {
          // Negative elasticity - could be luxury effect or data artifact
          // Check if promotions might be causing this pattern
          const hasPromotionalEffect = significantPricePoints.some(p => 
            parseFloat(p.promoPercentage) > 20); // >20% promotional units
          
          if (hasPromotionalEffect) {
            // If promotions are skewing the data, be more conservative
            recommendedPrice = bestRevenuePrice;
            
            recommendedPriceRationale = 
              `Your price data shows an unusual pattern (elasticity: ${priceElasticity.toFixed(2)}) ` +
              `which appears to be influenced by promotional activity. ` +
              `We recommend using the price that historically generated the most revenue.`;
          } else {
            // If no obvious promotion effect, might be a luxury good
            recommendedPrice = Math.max(currentPrice, bestMarginPrice);
            
            recommendedPriceRationale = 
              `Your product shows characteristics of premium pricing, where higher prices ` +
              `actually drive more sales (elasticity: ${priceElasticity.toFixed(2)}). ` +
              `Consider testing even higher price points to maximize both volume and margins.`;
          }
        } else {
          // Moderate elasticity - balanced approach
          recommendedPrice = bestRevenuePrice;
          
          recommendedPriceRationale = 
            `Your product has balanced price sensitivity (elasticity: ${priceElasticity.toFixed(2)}). ` +
            `The recommended price optimizes total revenue based on historical performance.`;
        }
      } else {
        // No reliable elasticity - use best revenue price
        recommendedPrice = bestRevenuePrice;
        
        recommendedPriceRationale = 
          `Based on historical sales data, this price point generated the highest total revenue.`;
      }
      
      // Add promotion learning insights
      if (topPromotions.length > 0 && !recommendedPriceRationale.includes('promotion')) {
        const topPromo = topPromotions[0];
        recommendedPriceRationale += 
          ` Your most effective promotion "${topPromo.code}" generated ` +
          `$${topPromo.totalRevenue.toFixed(2)} in revenue at an average ` +
          `discount of ${topPromo.avgDiscount.toFixed(1)}%.`;
      }
    } else {
      // Not enough data - stick with current price
      recommendedPriceRationale = 
        `Not enough sales history at different price points to make a reliable recommendation. ` +
        `Try testing different prices to gather more data.`;
    }
    
    // Formatter for display
    const formatPrice = (price: number) => {
      if (isNaN(price) || price === null || price === undefined) return '$0.00';
      return `$${Math.max(0, price).toFixed(2)}`;
    };
    
    // Return comprehensive analysis with promotion insights
    return {
      currentPrice,
      recommendedPrice,
      priceElasticity,
      recommendedPriceRationale,
      elasticityExplanation,
      promotionInsight,
      pricePoints,
      topPromotions: topPromotions.slice(0, 3), // Top 3 promotions
      bestRevenuePrice,
      matchingProductCount: matchingProducts.size,
      formattedReport: {
        currentPrice: formatPrice(currentPrice),
        optimalPrice: formatPrice(recommendedPrice),
        priceElasticity: priceElasticity.toFixed(2),
        priceComparison: pricePoints.map(p => ({
          price: formatPrice(p.listPrice),
          units: p.units,
          revenue: formatPrice(p.revenue),
          ordersAtPrice: p.orders,
          hasDiscount: p.isDiscounted,
          discountPercentage: p.discountPercentage,
          unitsPerOrder: p.unitsPerOrder,
          promoPercentage: p.promoPercentage
        }))
      }
    };
  } catch (error) {
    console.error('Error analyzing price performance:', error);
    return {
      error: 'Failed to analyze price data',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

// Add seasonal product analysis

export function generateSeasonalProductComparison(data: any[]): string {
  // Define seasons
  const summer = [5, 6, 7]; // June, July, August (0-indexed months)
  const winter = [11, 0, 1]; // December, January, February
  
  // Initialize tracking objects - track both units and revenue
  const summerProducts: Record<string, {units: number, revenue: number}> = {};
  const winterProducts: Record<string, {units: number, revenue: number}> = {};
  const summerTotal = { revenue: 0, orders: 0 };
  const winterTotal = { revenue: 0, orders: 0 };
  
  // Track unique order IDs to count orders correctly
  const summerOrders = new Set();
  const winterOrders = new Set();
  
  // Process data
  data.forEach(row => {
    if (row[0] === 'Order_Date') return; // Skip header
    
    try {
      const date = new Date(row[0]);
      const month = date.getMonth();
      const orderId = row[2]; // Column C - Order_ID
      const product = row[4]; // Column E - Product_Name
      const quantity = parseInt(row[6] || '1', 10); // Column G - Quantity
      const revenue = parseFloat(row[8] || '0'); // Column I - Line_Total
      
      // Summer analysis
      if (summer.includes(month)) {
        if (!summerProducts[product]) {
          summerProducts[product] = {units: 0, revenue: 0};
        }
        summerProducts[product].units += quantity;
        summerProducts[product].revenue += revenue;
        summerTotal.revenue += revenue;
        summerOrders.add(orderId);
      }
      
      // Winter analysis
      if (winter.includes(month)) {
        if (!winterProducts[product]) {
          winterProducts[product] = {units: 0, revenue: 0};
        }
        winterProducts[product].units += quantity;
        winterProducts[product].revenue += revenue;
        winterTotal.revenue += revenue;
        winterOrders.add(orderId);
      }
    } catch (e) {
      console.error("Error in seasonal analysis:", e);
    }
  });
  
  // Update order counts
  summerTotal.orders = summerOrders.size;
  winterTotal.orders = winterOrders.size;
  
  // Get top products by units sold
  const getTopProducts = (productData: Record<string, {units: number, revenue: number}>) => {
    return Object.entries(productData)
      .sort(([, a], [, b]) => b.units - a.units)
      .slice(0, 5)
      .map(([product, data]) => ({
        product, 
        units: data.units, 
        revenue: data.revenue
      }));
  };
  
  const topSummer = getTopProducts(summerProducts);
  const topWinter = getTopProducts(winterProducts);
  
  // Calculate percentage differences for products that appear in both seasons
  const productComparison: Array<{
    product: string, 
    summerUnits: number, 
    winterUnits: number, 
    difference: number, 
    percentDiff: number
  }> = [];
  
  Object.keys({...summerProducts, ...winterProducts}).forEach(product => {
    const summer = summerProducts[product]?.units || 0;
    const winter = winterProducts[product]?.units || 0;
    
    // Only include if product appears in both seasons with significant sales
    if (summer > 0 && winter > 0 && (summer + winter) > 10) {
      // Calculate absolute and percentage differences
      const difference = summer - winter;
      const percentDiff = winter > 0 ? (difference / winter) * 100 : 0;
      
      productComparison.push({
        product,
        summerUnits: summer,
        winterUnits: winter,
        difference,
        percentDiff
      });
    }
  });
  
  // Sort by absolute percentage difference
  productComparison.sort((a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff));
  
  // Format the response
  return `Our analysis of seasonal product performance shows different purchasing patterns between summer and winter:

Summer Months (June-August):
- Total Revenue: $${summerTotal.revenue.toFixed(2)}
- Top products by units sold:
  ${topSummer.map((item, i) => `${i+1}. ${item.product}: ${item.units} units`).join('\n  ')}

Winter Months (December-February):
- Total Revenue: $${winterTotal.revenue.toFixed(2)}
- Top products by units sold:
  ${topWinter.map((item, i) => `${i+1}. ${item.product}: ${item.units} units`).join('\n  ')}

Key seasonal differences:
${productComparison.slice(0, 5).map(item => {
  if (item.percentDiff > 0) {
    return `- ${item.product} performs better in summer (+${item.percentDiff.toFixed(0)}%)`;
  } else {
    return `- ${item.product} performs better in winter (${item.percentDiff.toFixed(0)}%)`;
  }
}).join('\n')}
- Overall sales volume is ${(winterTotal.revenue > summerTotal.revenue) ? 
  ((winterTotal.revenue / summerTotal.revenue - 1) * 100).toFixed(1) + '% higher in winter months' :
  ((summerTotal.revenue / winterTotal.revenue - 1) * 100).toFixed(1) + '% higher in summer months'}

This suggests customers prefer lighter, fruit-based options in summer and more substantial, protein-rich options in winter.`;
} 