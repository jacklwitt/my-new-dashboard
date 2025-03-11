import { google } from 'googleapis';
import { validateEnv } from '@/utils/env';
import { DataMetadata } from '@/types/data';

// Centralized data access functions for spreadsheet operations

export async function fetchSpreadsheetData() {
  const env = validateEnv();
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
  
  return { sheets, env, data: response.data.values };
}

export function getDataMetadata(data: any[]): DataMetadata {
  const rows = data.slice(1); // Skip header row
  
  // Extract dynamic data from spreadsheet
  const availableProducts = [...new Set(rows.map(row => row[4]))].filter(Boolean);
  const availableLocations = [...new Set(rows.map(row => row[3]))].filter(Boolean);
  
  // Get date range
  const dates = rows.map(row => new Date(row[1])).filter(d => !isNaN(d.getTime()));
  const months = [...new Set(dates.map(d => 
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  ))].sort();
  
  // Convert months to readable format
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
  const timeRange = months.map(m => {
    const [year, month] = m.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  });
  
  return {
    availableProducts,
    availableLocations,
    months,
    timeRange,
    monthNames
  };
}

export async function extractContext(question: string, data: any[]): Promise<any> {
  // Get metadata about the data
  const metadata = getDataMetadata(data);
  
  // Context object to return
  const context: any = {};
  
  // Check if any product is mentioned
  const productFocus = metadata.availableProducts.find(product => 
    question.toLowerCase().includes(product.toLowerCase())
  );
  
  if (productFocus) {
    context.productFocus = productFocus;
  }
  
  // Check for location mentions
  const locationFocus = metadata.availableLocations.find(location => 
    question.toLowerCase().includes(location.toLowerCase())
  );
  
  if (locationFocus) {
    context.locationFocus = locationFocus;
  }
  
  // Check for date/time focus
  const monthMatch = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  
  if (monthMatch) {
    context.timeFocus = {
      month: monthMatch[1],
      year: monthMatch[2]
    };
  }
  
  // Check for query intent
  if (/top|best|highest/i.test(question)) {
    context.intent = 'top_performers';
  } else if (/worst|bottom|lowest/i.test(question)) {
    context.intent = 'bottom_performers';
  } else if (/trend|growth|decline|compare/i.test(question)) {
    context.intent = 'trend_analysis';
  } else if (/improve|optimize|strategy|recommendation/i.test(question)) {
    context.intent = 'recommendations';
  }
  
  return context;
}

export function extractMonthYear(question: string, timeParameters?: any) {
  if (timeParameters?.dates && timeParameters.dates.length > 0) {
    return {
      month: timeParameters.dates[0].month.toLowerCase(),
      year: timeParameters.dates[0].year
    };
  }
  
  const monthMatch = question.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  
  if (monthMatch) {
    return {
      month: monthMatch[1].toLowerCase(),
      year: monthMatch[2]
    };
  }
  
  // Default values from the most recent data
  return {
    month: 'november',
    year: '2024'
  };
}

export function createSystemPrompt(data: any[]): string {
  const totalRows = data.length - 1;
  const dateRange = {
    start: new Date(data[1][1]),
    end: new Date(data[totalRows][1])
  };

  return `
You are a strategic business advisor for a food company. Your primary goal is to provide actionable recommendations based on sales data analysis.

Available data covers ${totalRows} transactions from ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}.

When making recommendations:
1. Base your suggestions on clear data patterns and trends
2. Prioritize location-specific strategies when location differences exist
3. Consider seasonality and timing patterns in the data
4. Suggest specific pricing, promotion, or placement strategies
5. Always include expected outcomes for each recommendation
6. Quantify potential impact whenever possible (% improvement)

For any product or location analysis, automatically include 3-5 actionable recommendations that would improve performance.

Format your recommendations in clear bullet points with bold headings for each main suggestion.
`;
} 