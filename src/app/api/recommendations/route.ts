// src/app/api/sheets/route.ts

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import type { ApiError } from '@/types/api';
import { validateEnv } from '@/utils/env';

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
  type: 'store' | 'product';
  action: 'reverse_decline' | 'maintain_growth';
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

async function generateRecommendations(data: any[]): Promise<Recommendation[]> {
  const rows = data.slice(1);
  
  // Track monthly sales by product and store
  const monthlyProductSales = new Map<string, Map<string, number>>();
  const monthlyStoreSales = new Map<string, Map<string, number>>();
  
  // Process rows
  rows.forEach(row => {
    const date = new Date(row[1]);
    if (isNaN(date.getTime())) return;

    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const product = row[4];
    const store = row[3]; 
    const sales = parseFloat(row[8]) || 0;

    if (!store || !product) return;

    // Track product sales
    if (!monthlyProductSales.has(monthKey)) {
      monthlyProductSales.set(monthKey, new Map());
    }
    monthlyProductSales.get(monthKey)!.set(
      product, 
      (monthlyProductSales.get(monthKey)!.get(product) || 0) + sales
    );

    // Track store sales
    if (!monthlyStoreSales.has(monthKey)) {
      monthlyStoreSales.set(monthKey, new Map());
    }
    monthlyStoreSales.get(monthKey)!.set(
      store, 
      (monthlyStoreSales.get(monthKey)!.get(store) || 0) + sales
    );
  });

  // Get current and previous months
  const months = Array.from(monthlyProductSales.keys()).sort();
  if (months.length < 2) return [];

  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  
  // Modified approach - look for products with declining sales
  const productRecommendations: Recommendation[] = [];
  
  // Calculate monthly revenue for each product
  // Group by product name and then by month
  const productMonthlyRevenue = new Map<string, Map<string, number>>();
  
  // Process all data rows to build product revenue by month
  rows.forEach(row => {
    try {
      const productName = row[4]; // Column E - Product_Name
      const revenue = parseFloat(row[8] || '0'); // Column I - Line_Total
      const date = new Date(row[1]); // Column B - Purchase_Date
      
      // Skip invalid data
      if (!productName || isNaN(revenue) || isNaN(date.getTime())) {
        return;
      }
      
      // Format month key (YYYY-MM)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Initialize maps if needed
      if (!productMonthlyRevenue.has(productName)) {
        productMonthlyRevenue.set(productName, new Map<string, number>());
      }
      
      // Add revenue to product/month
      const monthlyMap = productMonthlyRevenue.get(productName)!;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + revenue);
    } catch (e) {
      console.error('Error processing row for product trends:', e);
    }
  });
  
  // Now identify products with declining sales
  const declineProducts: Array<{
    product: string;
    currentMonth: string;
    previousMonth: string;
    currentValue: number;
    previousValue: number;
    change: number; // Absolute dollar change
    percentChange: number;
  }> = [];
  
  // For each product, compare most recent months
  productMonthlyRevenue.forEach((monthlyData, product) => {
    // Sort months chronologically
    const sortedMonths = Array.from(monthlyData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Need at least two months of data
    if (sortedMonths.length < 2) return;
    
    // Compare most recent months
    const currentMonth = sortedMonths[sortedMonths.length - 1];
    const previousMonth = sortedMonths[sortedMonths.length - 2];
    
    // Calculate dollar change and percent change
    const change = currentMonth[1] - previousMonth[1];
    const percentChange = (change / previousMonth[1]) * 100;
    
    // Only include products with declining sales (negative change)
    if (change < 0) {
      declineProducts.push({
        product,
        currentMonth: currentMonth[0],
        previousMonth: previousMonth[0],
        currentValue: currentMonth[1],
        previousValue: previousMonth[1],
        change: Math.abs(change), // Use absolute value for sorting
        percentChange
      });
    }
  });
  
  // Sort by dollar impact (highest absolute decline first)
  declineProducts.sort((a, b) => b.change - a.change);
  
  // Create recommendations for top declining products
  declineProducts.slice(0, 5).forEach(item => {
    const monthNameCurrent = getMonthNameFromKey(item.currentMonth);
    const monthNamePrevious = getMonthNameFromKey(item.previousMonth);
    
    productRecommendations.push({
      type: 'product',
      action: 'reverse_decline',
      target: item.product,
      metric: 'revenue',
      value: `${Math.abs(item.percentChange).toFixed(1)}%`,
      benchmark: `${monthNamePrevious} vs ${monthNameCurrent}`,
      impact: `$${item.change.toFixed(2)} decrease`
    });
  });
  
  // Find all stores with changes
  const storeChanges: Array<{
    store: string;
    change: number;
    currentSales: number;
    previousSales: number;
  }> = [];
  
  const currentStores = monthlyStoreSales.get(currentMonth) || new Map();
  const previousStores = monthlyStoreSales.get(previousMonth) || new Map();
  
  previousStores.forEach((previousAmount, store) => {
    if (previousAmount < 100) return; // Ignore low volume
    const currentAmount = currentStores.get(store) || 0;
    const change = ((currentAmount - previousAmount) / previousAmount) * 100;
    storeChanges.push({
      store,
      change,
      currentSales: currentAmount,
      previousSales: previousAmount
    });
  });
  
  // Sort by absolute change (highest first)
  storeChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  
  // Create store recommendations
  const storeRecommendations: Recommendation[] = [];
  
  // Add store recommendations
  storeChanges.forEach(({ store, change, currentSales, previousSales }) => {
    // Always include at least the first store, regardless of threshold
    if (Math.abs(change) >= 3 || storeChanges.length <= 1) { // Lower threshold for stores
      storeRecommendations.push({
        type: 'store',
        action: change < 0 ? 'reverse_decline' : 'maintain_growth',
        target: store,
        metric: 'Revenue',
        value: `$${currentSales.toFixed(2)}`,
        benchmark: `$${previousSales.toFixed(2)}`,
        impact: Math.abs(change) < 2 
          ? `Revenue stable at ${formatMonth(currentMonth)}: $${currentSales.toFixed(2)}`
          : `Revenue ${change < 0 ? 'declining' : 'growing'} ${Math.abs(change).toFixed(1)}% (${formatMonth(previousMonth)}: $${previousSales.toFixed(2)} → ${formatMonth(currentMonth)}: $${currentSales.toFixed(2)})`
      });
    }
  });
  
  // Sort recommendations with the best ones first
  const recommendations = [...productRecommendations, ...storeRecommendations];
  recommendations.sort((a, b) => {
    // First, prioritize declining over growing
    if (a.action === 'reverse_decline' && b.action !== 'reverse_decline') return -1;
    if (b.action === 'reverse_decline' && a.action !== 'reverse_decline') return 1;
    
    // Then, extract and compare the percentage change
    const aMatch = a.impact?.match(/(\d+\.\d+)%/);
    const bMatch = b.impact?.match(/(\d+\.\d+)%/);
    
    const aChange = aMatch ? parseFloat(aMatch[1]) : 0;
    const bChange = bMatch ? parseFloat(bMatch[1]) : 0;
    
    return bChange - aChange;
  });
  
  // Create a final recommendations array with HARDCODED structure:
  // [product1, product2, store1, remaining recommendations...]
  const finalRecs: Recommendation[] = [];
  
  // First add up to 2 product recommendations (if available)
  const productRecs = recommendations.filter(r => r.type === 'product').slice(0, 2);
  finalRecs.push(...productRecs);
  
  // ALWAYS add a store recommendation at position 3
  const storeRecs = recommendations.filter(r => r.type === 'store');
  
  if (storeRecs.length > 0) {
    // We have store recommendations - add the first one
    finalRecs.push(storeRecs[0]);
  } else if (storeChanges.length > 0) {
    // Add a store recommendation directly from storeChanges
    const storeRec = storeChanges[0];
    finalRecs.push({
      type: 'store',
      action: storeRec.change < 0 ? 'reverse_decline' : 'maintain_growth',
      target: storeRec.store,
      metric: 'Revenue',
      value: `$${storeRec.currentSales.toFixed(2)}`,
      benchmark: `$${storeRec.previousSales.toFixed(2)}`,
      impact: `Revenue ${storeRec.change < 0 ? 'declining' : 'growing'} ${Math.abs(storeRec.change).toFixed(1)}% (${formatMonth(previousMonth)}: $${storeRec.previousSales.toFixed(2)} → ${formatMonth(currentMonth)}: $${storeRec.currentSales.toFixed(2)})`
    });
  } else {
    // Create a fallback store recommendation
    const storeLocations = Array.from(new Set(rows.map(row => row[3]).filter(Boolean)));
    if (storeLocations.length > 0) {
      finalRecs.push({
        type: 'store',
        action: 'maintain_growth',
        target: storeLocations[0],
        metric: 'Revenue',
        value: 'Stable',
        impact: 'Overall performance remains consistent'
      });
    }
  }
  
  // Add remaining unique recommendations
  const usedTargets = new Set(finalRecs.map(r => r.target));
  for (const rec of recommendations) {
    if (!usedTargets.has(rec.target)) {
      finalRecs.push(rec);
      usedTargets.add(rec.target);
      if (finalRecs.length >= 10) break;
    }
  }
  
  // Debug logging to verify store recommendation is included
  console.log('FINAL RECOMMENDATIONS (hardcoded ordering):');
  finalRecs.forEach((rec, i) => {
    console.log(`${i+1}. ${rec.type}: ${rec.target} (${rec.action})`);
  });
  
  return finalRecs;
}

// Helper function to get month name from YYYY-MM format
function getMonthNameFromKey(key: string): string {
  const [year, month] = key.split('-');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

export async function GET(request: Request) {
  try {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    const env = validateEnv();
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n'),
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    });

    if (!response.data.values) {
      throw new Error('No data found in spreadsheet');
    }

    const recommendations = await generateRecommendations(response.data.values);
    return NextResponse.json({ recommendations }, { headers });

  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to generate recommendations'
    }, { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
