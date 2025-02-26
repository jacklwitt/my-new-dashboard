// src/app/api/sheets/route.ts

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

interface AggregatedData {
  totalSales: number;
  totalQuantity: number;
  averagePrice: number;
  transactionCount: number;
}

interface StoreData extends AggregatedData {
  location: string;
}

interface ProductData extends AggregatedData {
  name: string;
  highestPrice: number;
  lowestPrice: number;
  salesByPrice: Map<number, { quantity: number; revenue: number }>;
}

interface DiscountData extends AggregatedData {
  code: string;
  totalRevenue: number;
  averageDiscount: number;
}

// Add shared type definitions
type Recommendation = {
  type: 'store' | 'product' | 'discount';
  action: string;
  target: string;
  metric: string;
  value: string;
  benchmark?: string;
  impact?: string;
};

// Add helper function to calculate growth
function calculateGrowth(monthlyData: Map<string, number>): {
  growth: number;
  currentMonth: string;
  previousMonth: string;
  currentValue: number;
  previousValue: number;
} | null {
  const sortedMonths = Array.from(monthlyData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  if (sortedMonths.length < 2) return null;
  
  const currentMonth = sortedMonths[sortedMonths.length - 1];
  const previousMonth = sortedMonths[sortedMonths.length - 2];
  
  const growth = (currentMonth[1] - previousMonth[1]) / previousMonth[1];
  
  return {
    growth,
    currentMonth: currentMonth[0],
    previousMonth: previousMonth[0],
    currentValue: currentMonth[1],
    previousValue: previousMonth[1]
  };
}

// Helper function to format month
function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function analyzeSeasonality(monthlyData: Map<string, number>, currentMonthPair: [string, number], previousMonthPair: [string, number]): {
  isSeasonal: boolean;
  previousYearChange?: { 
    startValue: number;
    endValue: number;
    percentChange: number;
    startMonth: string;
    endMonth: string;
  };
} {
  const sortedMonths = Array.from(monthlyData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  // Get current and previous month dates
  const currentDate = new Date(currentMonthPair[0]);
  const previousDate = new Date(previousMonthPair[0]);
  
  // Find same months from last year
  const lastYearCurrent = sortedMonths.find(([monthKey]) => {
    const date = new Date(monthKey);
    return date.getMonth() === currentDate.getMonth() && 
           date.getFullYear() === currentDate.getFullYear() - 1;
  });

  const lastYearPrevious = sortedMonths.find(([monthKey]) => {
    const date = new Date(monthKey);
    return date.getMonth() === previousDate.getMonth() && 
           date.getFullYear() === previousDate.getFullYear() - 1;
  });

  if (lastYearCurrent && lastYearPrevious) {
    const percentChange = ((lastYearCurrent[1] - lastYearPrevious[1]) / lastYearPrevious[1]) * 100;
    return {
      isSeasonal: true,
      previousYearChange: {
        startValue: lastYearPrevious[1],
        endValue: lastYearCurrent[1],
        percentChange,
        startMonth: lastYearPrevious[0],
        endMonth: lastYearCurrent[0]
      }
    };
  }

  return { isSeasonal: false };
}

export async function GET() {
  try {
    const keyFilePath = path.join(process.cwd(), 'credentials.json');
    console.log('Loading credentials from:', keyFilePath);

    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    console.log('Successfully authenticated with Google');

    const sheets = google.sheets({ 
      version: 'v4', 
      auth: client as any  // Type assertion to fix compatibility issue
    });

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID environment variable is not set');
    }

    console.log('Fetching data from spreadsheet:', spreadsheetId);
    const range = 'Sheet1!A2:I10001'; // Skip header row

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values;

    if (!rows || rows.length === 0) {
      throw new Error('No data found in spreadsheet');
    }

    // Aggregate data by store, product, and discount code
    const storeMap = new Map<string, StoreData>();
    const productMap = new Map<string, ProductData>();
    const discountMap = new Map<string, DiscountData>();

    // Track monthly trends for products
    const productTrends = new Map<string, Map<string, number>>();

    // Initialize total sales counter
    let totalSales = 0;

    rows.forEach(row => {
      const date = new Date(row[1]); // Purchase_Date
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const location = row[3];
      const product = row[4];
      const price = parseFloat(row[5]) || 0;
      const quantity = parseInt(row[6]) || 0;
      const discount = row[7] || 'None';
      const total = parseFloat(row[8]) || 0;

      totalSales += total;  // Accumulate total sales

      // Aggregate store data
      if (location) {
        const storeData = storeMap.get(location) || {
          location,
          totalSales: 0,
          totalQuantity: 0,
          averagePrice: 0,
          transactionCount: 0
        };
        storeData.totalSales += total;
        storeData.totalQuantity += quantity;
        storeData.transactionCount += 1;
        storeData.averagePrice = storeData.totalSales / storeData.totalQuantity;
        storeMap.set(location, storeData);
      }

      // Aggregate product data with price sensitivity
      if (product) {
        const productData = productMap.get(product) || {
          name: product,
          totalSales: 0,
          totalQuantity: 0,
          averagePrice: 0,
          transactionCount: 0,
          highestPrice: 0,
          lowestPrice: Infinity,
          salesByPrice: new Map<number, { quantity: number; revenue: number }>()
        };
        productData.totalSales += total;
        productData.totalQuantity += quantity;
        productData.transactionCount += 1;
        productData.averagePrice = price;
        productData.highestPrice = Math.max(productData.highestPrice, price);
        productData.lowestPrice = Math.min(productData.lowestPrice, price);

        // Track sales by price point
        const pricePoint = Math.round(price * 100) / 100; // Round to 2 decimal places
        const existingSales = productData.salesByPrice.get(pricePoint) || { quantity: 0, revenue: 0 };
        existingSales.quantity += quantity;
        existingSales.revenue += total;
        productData.salesByPrice.set(pricePoint, existingSales);

        productMap.set(product, productData);

        // Track monthly trends
        const productMonthly = productTrends.get(product) || new Map<string, number>();
        productMonthly.set(monthKey, (productMonthly.get(monthKey) || 0) + total);
        productTrends.set(product, productMonthly);
      }

      // Aggregate discount data with conversion tracking
      if (discount) {
        const discountData = discountMap.get(discount) || {
          code: discount,
          totalSales: 0,
          totalQuantity: 0,
          averagePrice: 0,
          transactionCount: 0,
          totalRevenue: 0,
          averageDiscount: 0
        };
        discountData.totalSales += total;
        discountData.totalQuantity += quantity;
        discountData.transactionCount += 1;
        discountData.totalRevenue += total;
        discountData.averagePrice = discountData.totalSales / discountData.totalQuantity;
        discountMap.set(discount, discountData);
      }
    });

    const recommendations: Recommendation[] = [];

    // 1. Analyze store performance
    const storePerformance = Array.from(storeMap.values())
      .sort((a, b) => b.totalSales - a.totalSales);
    
    const avgStoreSales = storePerformance.reduce((sum, store) => sum + store.totalSales, 0) / storePerformance.length;
    
    // Find underperforming stores
    storePerformance
      .filter(store => store.totalSales < avgStoreSales * 0.8)
      .slice(0, 2)
      .forEach(store => {
        recommendations.push({
          type: 'store',
          action: 'improve_performance',
          target: store.location,
          metric: 'sales',
          value: `$${store.totalSales.toFixed(2)}`,
          benchmark: `$${avgStoreSales.toFixed(2)}`,
          impact: `${((avgStoreSales - store.totalSales) / avgStoreSales * 100).toFixed(1)}% below average`
        });
      });

    // 2. Analyze product performance
    const productPerformance = Array.from(productMap.values())
      .sort((a, b) => b.totalSales - a.totalSales);
    
    // Find top products by revenue
    productPerformance.slice(0, 2).forEach(product => {
      const monthlyTrend = productTrends.get(product.name);
      const growth = monthlyTrend ? calculateGrowth(monthlyTrend) : null;
      
      let impact: string;
      if (growth) {
        const seasonality = analyzeSeasonality(
          monthlyTrend!, 
          [growth.currentMonth, growth.currentValue],
          [growth.previousMonth, growth.previousValue]
        );
        
        const growthPercent = (growth.growth * 100).toFixed(1);
        const fromMonth = formatMonth(growth.previousMonth);
        const toMonth = formatMonth(growth.currentMonth);
        const isGrowing = growth.growth > 0;

        let context = '';
        if (!isGrowing && seasonality.isSeasonal && seasonality.previousYearChange) {
          const { startMonth, endMonth, percentChange } = seasonality.previousYearChange;
          const isOppositePattern = (percentChange > 0) === (growth.growth < 0);
          if (isOppositePattern) {
            context = `\nNote: Opposite pattern observed last year (${formatMonth(startMonth)} → ${formatMonth(endMonth)} saw a ${Math.abs(percentChange).toFixed(1)}% ${percentChange > 0 ? 'increase' : 'decline'})`;
          }
        }

        impact = `Revenue ${isGrowing ? 'growing' : 'declining'} ${Math.abs(parseFloat(growthPercent))}% ` +
                `(${fromMonth}: $${growth.previousValue.toFixed(2)} → ${toMonth}: $${growth.currentValue.toFixed(2)})${context}`;

        recommendations.push({
          type: 'product',
          action: isGrowing ? 'maintain_growth' : 'reverse_decline',
          target: product.name,
          metric: 'sales',
          value: `$${product.averagePrice.toFixed(2)}`,
          impact
        });
      } else {
        // If no trend data, just report on revenue contribution
        impact = `Drives ${((product.totalSales / totalSales) * 100).toFixed(1)}% of total revenue`;
        recommendations.push({
          type: 'product',
          action: 'monitor_performance',
          target: product.name,
          metric: 'sales',
          value: `$${product.averagePrice.toFixed(2)}`,
          impact
        });
      }
    });

    // 3. Analyze discount effectiveness
    const discounts = Array.from(discountMap.values())
      .filter(d => d.code !== 'None')
      .sort((a, b) => (b.totalRevenue / b.transactionCount) - (a.totalRevenue / a.transactionCount));

    if (discounts.length > 0) {
      const topDiscount = discounts[0];
      const avgTransactionValue = topDiscount.totalRevenue / topDiscount.transactionCount;
      const regularTransactions = discountMap.get('None');
      const regularAvgValue = regularTransactions 
        ? regularTransactions.totalRevenue / regularTransactions.transactionCount 
        : 0;

      if (avgTransactionValue > regularAvgValue * 1.2) {
        recommendations.push({
          type: 'discount',
          action: 'expand_promotion',
          target: topDiscount.code,
          metric: 'avg_transaction',
          value: `$${avgTransactionValue.toFixed(2)}`,
          benchmark: `Regular: $${regularAvgValue.toFixed(2)}`,
          impact: `${((avgTransactionValue - regularAvgValue) / regularAvgValue * 100).toFixed(1)}% higher average transaction value`
        });
      }
    }

    // Sort recommendations by potential impact
    recommendations.sort((a, b) => {
      const getImpactValue = (rec: any) => {
        if (rec.impact) {
          const match = rec.impact.match(/(\d+\.?\d*)%/);
          return match ? parseFloat(match[1]) : 0;
        }
        return 0;
      };
      return getImpactValue(b) - getImpactValue(a);
    });

    console.log('Generated recommendations:', recommendations.length);

    // Add response type
    const response: { recommendations: Recommendation[] } = {
      recommendations: recommendations
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}
