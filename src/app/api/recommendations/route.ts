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

async function generateRecommendations(data: any[]): Promise<Recommendation[]> {
  const rows = data.slice(1);
  const recommendations: Recommendation[] = [];

  // Track monthly sales by product
  const monthlyProductSales = new Map<string, Map<string, number>>();
  
  // Process and validate rows
  rows.forEach(row => {
    try {
      const date = new Date(row[1]);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date found:', row[1]);
        return;
      }

      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const product = row[4];
      const sales = parseFloat(row[8]) || 0;

      if (!monthlyProductSales.has(monthKey)) {
        monthlyProductSales.set(monthKey, new Map());
      }
      const monthSales = monthlyProductSales.get(monthKey)!;
      monthSales.set(product, (monthSales.get(product) || 0) + sales);
    } catch (error) {
      console.warn('Error processing row:', error);
    }
  });

  // Get sorted months
  const months = Array.from(monthlyProductSales.keys()).sort();
  if (months.length < 2) {
    console.warn('Not enough months of data');
    return [];
  }

  // Get last two months
  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  console.log('Analyzing months:', { currentMonth, previousMonth });

  const currentSales = monthlyProductSales.get(currentMonth) || new Map();
  const previousSales = monthlyProductSales.get(previousMonth) || new Map();

  // Find products with significant decline
  const declines = new Map<string, number>();
  previousSales.forEach((previousAmount, product) => {
    if (previousAmount >= 100) { // Minimum threshold
      const currentAmount = currentSales.get(product) || 0;
      const decline = ((previousAmount - currentAmount) / previousAmount) * 100;
      if (decline > 3) { // Significant decline threshold
        declines.set(product, decline);
      }
    }
  });

  console.log('Found declines:', Array.from(declines.entries()));

  // Sort and get top 3 declines
  const sortedDeclines = Array.from(declines.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Format month for display
  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    return new Date(parseInt(year), parseInt(month) - 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Generate recommendations
  sortedDeclines.forEach(([product, decline]) => {
    const previousAmount = previousSales.get(product) || 0;
    const currentAmount = currentSales.get(product) || 0;

    recommendations.push({
      type: 'product',
      action: 'reverse_decline',
      target: product,
      metric: 'Revenue',
      value: `$${currentAmount.toFixed(2)}`,
      benchmark: `$${previousAmount.toFixed(2)}`,
      impact: `Revenue declining ${decline.toFixed(1)}% (${formatMonth(previousMonth)}: $${previousAmount.toFixed(2)} → ${formatMonth(currentMonth)}: $${currentAmount.toFixed(2)})`
    });
  });

  return recommendations;
}

export async function GET(request: Request) {
  try {
    // Add CORS headers first
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Then validate environment
    console.log('Validating environment in recommendations API...');
    const env = validateEnv();
    console.log('Environment validated successfully');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n'),
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    console.log('Authenticating with Google...');
    const client = await auth.getClient();
    
    console.log('Creating Google Sheets client...');
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    
    console.log('Fetching data from spreadsheet:', env.SPREADSHEET_ID);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    });

    if (!response.data.values) {
      throw new Error('No data found in spreadsheet');
    }

    const recommendations = await generateRecommendations(response.data.values);
    console.log('Generated recommendations:', recommendations.length);

    return NextResponse.json({ recommendations }, { headers });
  } catch (error: unknown) {
    const e = error as ApiError;
    console.error('API Error:', {
      name: e.name,
      message: e.message,
      stack: e.stack?.split('\n')[0],
      cause: e.cause
    });

    return NextResponse.json({ 
      error: e.message || 'Failed to generate recommendations'
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
