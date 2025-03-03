import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { validateEnv } from '@/utils/env';
import type { ApiError } from '@/types/api';

type TimeSeriesData = {
  date: string;
  value: number;
  category?: string;
}[];

type PieChartData = {
  name: string;
  value: number;
}[];

// Add utility function to filter by date range
function filterByTimeRange(rows: any[], timeRange: string): any[] {
  const currentDate = new Date();
  let startDate: Date;
  
  switch (timeRange) {
    case '30days':
      startDate = new Date(currentDate);
      startDate.setDate(currentDate.getDate() - 30);
      break;
    case '90days':
      startDate = new Date(currentDate);
      startDate.setDate(currentDate.getDate() - 90);
      break;
    case '6months':
      startDate = new Date(currentDate);
      startDate.setMonth(currentDate.getMonth() - 6);
      break;
    case '1year':
      startDate = new Date(currentDate);
      startDate.setFullYear(currentDate.getFullYear() - 1);
      break;
    default: // 'all' or any other value
      return rows; // Return all rows if no specific range
  }
  
  return rows.filter(row => {
    if (!row[1]) return false;
    const rowDate = new Date(row[1]);
    return !isNaN(rowDate.getTime()) && rowDate >= startDate;
  });
}

// Functions to process data for different chart types
function generateRevenueTrend(data: any[], timeRange: string): TimeSeriesData {
  console.log('Generating revenue trend data');
  const rows = data.slice(1); // Skip header
  const filteredRows = filterByTimeRange(rows, timeRange);
  
  // Group by month
  const monthlyRevenue = new Map<string, number>();
  
  filteredRows.forEach(row => {
    if (!row[1]) return; // Skip if no date
    
    const date = new Date(row[1]);
    if (isNaN(date.getTime())) return; // Skip invalid dates
    
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const sales = parseFloat(row[8]) || 0;
    
    monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + sales);
  });
  
  // Convert to array format for chart
  return Array.from(monthlyRevenue.entries())
    .sort((a, b) => a[0].localeCompare(b[0])) // Sort by date
    .map(([month, sales]) => {
      // Format the month for display
      const [year, monthNum] = month.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      
      return {
        date: `${monthName} ${year}`,
        value: sales
      };
    });
}

function generateRevenueByLocation(data: any[], timeRange: string): PieChartData {
  console.log('Generating revenue by location data');
  const rows = data.slice(1); // Skip header
  const filteredRows = filterByTimeRange(rows, timeRange);
  
  // Group by location
  const locationRevenue = new Map<string, number>();
  
  filteredRows.forEach(row => {
    const location = row[3]; // Store location column
    if (!location) return;
    
    const sales = parseFloat(row[8]) || 0;
    locationRevenue.set(location, (locationRevenue.get(location) || 0) + sales);
  });
  
  // Convert to array format for chart
  return Array.from(locationRevenue.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by revenue (highest first)
    .slice(0, 6) // Take top 6 for readability
    .map(([location, sales]) => ({
      name: location,
      value: sales
    }));
}

function generateRevenueByProduct(data: any[], timeRange: string): PieChartData {
  console.log('Generating revenue by product data');
  const rows = data.slice(1); // Skip header
  const filteredRows = filterByTimeRange(rows, timeRange);
  
  // Group by product
  const productRevenue = new Map<string, number>();
  
  filteredRows.forEach(row => {
    const product = row[4]; // Product name column
    if (!product) return;
    
    const sales = parseFloat(row[8]) || 0;
    productRevenue.set(product, (productRevenue.get(product) || 0) + sales);
  });
  
  // Convert to array format for chart
  return Array.from(productRevenue.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by revenue (highest first)
    .slice(0, 6) // Take top 6 for readability
    .map(([product, sales]) => ({
      name: product,
      value: sales
    }));
}

function generateMonthlyComparison(data: any[], timeRange: string): any[] {
  console.log('Generating monthly comparison data');
  const rows = data.slice(1); // Skip header
  const filteredRows = filterByTimeRange(rows, timeRange);
  
  // Group by month and year
  const monthlyRevenue = new Map<string, Map<number, number>>();
  
  filteredRows.forEach(row => {
    if (!row[1]) return; // Skip if no date
    
    const date = new Date(row[1]);
    if (isNaN(date.getTime())) return; // Skip invalid dates
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthName = date.toLocaleString('default', { month: 'short' });
    
    if (!monthlyRevenue.has(monthName)) {
      monthlyRevenue.set(monthName, new Map<number, number>());
    }
    
    const yearMap = monthlyRevenue.get(monthName)!;
    const sales = parseFloat(row[8]) || 0;
    yearMap.set(year, (yearMap.get(year) || 0) + sales);
  });
  
  // Get the two most recent years
  const years = Array.from(
    new Set(
      filteredRows
        .map(row => new Date(row[1]).getFullYear())
        .filter(year => !isNaN(year))
    )
  ).sort((a, b) => b - a).slice(0, 2);
  
  const currentYear = years[0];
  const previousYear = years[1] || currentYear - 1;
  
  // Generate comparison data
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return monthNames.map(month => ({
    month,
    current: (monthlyRevenue.get(month)?.get(currentYear) || 0),
    previous: (monthlyRevenue.get(month)?.get(previousYear) || 0)
  }));
}

export async function GET(request: Request) {
  try {
    console.log('Graphs API endpoint called');
    
    // Extract timeRange from query parameters
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') || 'all';
    console.log('Time range requested:', timeRange);
    
    const env = validateEnv();
    
    // Setup Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY,
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    
    console.log('Fetching spreadsheet data...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    });

    if (!response.data.values) {
      throw new Error('No data found in spreadsheet');
    }

    const data = response.data.values;
    console.log(`Data loaded. Total rows: ${data.length}`);
    
    // Generate chart data
    const revenueTrend = generateRevenueTrend(data, timeRange);
    const revenueByLocation = generateRevenueByLocation(data, timeRange);
    const revenueByProduct = generateRevenueByProduct(data, timeRange);
    const monthlyComparison = generateMonthlyComparison(data, timeRange);
    
    return NextResponse.json({
      revenueTrend,
      revenueByLocation,
      revenueByProduct,
      monthlyComparison
    });

  } catch (error: unknown) {
    console.error('Graphs API Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to process graph data'
    }, { 
      status: 500 
    });
  }
} 