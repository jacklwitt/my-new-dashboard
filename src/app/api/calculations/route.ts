import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { validateEnv } from '@/utils/env';
import type { ApiError } from '@/types/api';

function calculateAnswer(question: string, data: any[], conversation?: any[]): string {
  console.log('=== Starting calculation ===');
  console.log('Question:', question);
  
  const rows = data.slice(1);
  const questionLower = question.toLowerCase();
  
  // Extract product name
  const allProducts = Array.from(new Set(
    rows.map(row => row[4])
      .filter(Boolean)
  ));
  
  let matchedProduct = '';
  const questionWords = questionLower.split(' ');
  
  // Find longest matching product name
  for (const product of allProducts) {
    const productLower = product.toLowerCase();
    if (questionLower.includes(productLower)) {
      if (productLower.length > matchedProduct.length) {
        matchedProduct = product;
      }
    }
  }
  console.log('Matched product:', matchedProduct);

  // Handle individual month breakdowns
  if ((questionLower.includes('individually') || 
       questionLower.includes('separately') || 
       questionLower.includes('each') || 
       questionLower.includes('break'))) {
    
    // Filter rows for the matched product
    const productRows = rows.filter(row => row[4] === matchedProduct);
    console.log('Product rows count:', productRows.length);
    
    const novSales = productRows
      .filter(row => {
        const date = new Date(row[1]);
        const isNov = date.getMonth() === 10 && date.getFullYear() === 2024;
        if (isNov) {
          console.log('November row:', { date: row[1], amount: row[8] });
        }
        return isNov;
      })
      .reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);

    const decSales = productRows
      .filter(row => {
        const date = new Date(row[1]);
        const isDec = date.getMonth() === 11 && date.getFullYear() === 2024;
        if (isDec) {
          console.log('December row:', { date: row[1], amount: row[8] });
        }
        return isDec;
      })
      .reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);

    console.log('Monthly totals:', { novSales, decSales });
    return `November 2024: $${novSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}\nDecember 2024: $${decSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  // Regular total calculation
  if (questionLower.includes('total sales') || 
      questionLower.includes('revenue') || 
      questionLower.includes('sales') ||
      questionLower.includes('what were')) {
    
    // Extract date from question
    const monthMap: { [key: string]: number } = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    let targetMonth: number | null = null;
    let targetYear: number | null = null;

    // Look for month and year in question
    for (const [monthStr, monthNum] of Object.entries(monthMap)) {
      if (questionLower.includes(monthStr)) {
        targetMonth = monthNum;
        // Look for year after month mention
        const yearMatch = questionLower.substring(questionLower.indexOf(monthStr))
          .match(/\b20\d{2}\b/);
        if (yearMatch) {
          targetYear = parseInt(yearMatch[0]);
        }
        break;
      }
    }

    console.log('Extracted date:', { targetMonth, targetYear });

    const dateFilter = (date: Date) => {
      if (targetMonth === null || targetYear === null) return true;
      return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
    };

    const filteredRows = rows.filter(row => {
      const matches = dateFilter(new Date(row[1])) && row[4] === matchedProduct;
      if (matches) {
        console.log('Matched row:', { date: row[1], product: row[4], amount: row[8] });
      }
      return matches;
    });

    console.log('Filtered rows count:', filteredRows.length);

    if (filteredRows.length === 0) {
      return 'Cannot calculate from available data';
    }

    const total = filteredRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
    console.log('Total calculated:', total);
    
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  return 'Cannot calculate from available data';
}

export async function POST(request: Request) {
  console.log('Calculations POST handler called');
  
  try {
    const env = validateEnv();
    const body = await request.json();
    console.log('Request body:', body);
    
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

    console.log('Spreadsheet response received');
    if (!response.data.values) {
      throw new Error('No data found in spreadsheet');
    }

    const answer = calculateAnswer(body.question, response.data.values, body.conversation);
    console.log('Calculated answer:', answer);
    
    return NextResponse.json({ answer });

  } catch (error: unknown) {
    console.error('Calculation error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to process calculation'
    }, { 
      status: 500 
    });
  }
} 