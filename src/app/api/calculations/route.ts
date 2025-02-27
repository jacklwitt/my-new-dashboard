import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { validateEnv } from '@/utils/env';
import type { ApiError } from '@/types/api';

function calculateAnswer(question: string, data: any[], conversation?: any[]): string {
  const rows = data.slice(1);
  const questionLower = question.toLowerCase();
  
  // Get the previous question from conversation if it exists
  const previousQuestion = conversation && conversation.length > 0 
    ? conversation[conversation.length - 1].content 
    : '';
  const previousLower = previousQuestion?.toLowerCase() || '';
  
  // Extract unique product names from column E (index 4)
  const allProducts = new Set(
    rows.map(row => row[4])
      .filter(Boolean) // Remove null/undefined values
  );

  // Find the product name from the question by matching against actual products
  let matchedProduct = '';
  const questionWords = questionLower.split(' ');
  
  // Try to find the longest matching product name
  for (const product of allProducts) {
    const productLower = product.toLowerCase();
    // If the product name is found as a whole in the question
    if (questionLower.includes(productLower)) {
      // Update if this is a longer match than previous
      if (productLower.length > matchedProduct.length) {
        matchedProduct = product;
      }
    }
  }

  // If no exact match found, try partial matching
  if (!matchedProduct) {
    for (const product of allProducts) {
      const productWords = product.toLowerCase().split(' ');
      // Check if all words from the product appear in the question
      if (productWords.every(word => questionWords.includes(word))) {
        matchedProduct = product;
        break;
      }
    }
  }

  // Handle individual month breakdowns
  if ((questionLower.includes('individually') || 
       questionLower.includes('separately') || 
       questionLower.includes('each') || 
       questionLower.includes('break'))) {
    
    if (!matchedProduct) {
      return 'Could not identify the product in your question. Please specify the product name more clearly.';
    }

    // Filter rows for the matched product
    const productRows = rows.filter(row => row[4] === matchedProduct);
    
    const novSales = productRows
      .filter(row => {
        const date = new Date(row[1]);
        return date.getMonth() === 10 && date.getFullYear() === 2024;
      })
      .reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);

    const decSales = productRows
      .filter(row => {
        const date = new Date(row[1]);
        return date.getMonth() === 11 && date.getFullYear() === 2024;
      })
      .reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);

    return `November 2024: $${novSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}\nDecember 2024: $${decSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  // Handle date-specific queries
  let dateFilter: (date: Date) => boolean = () => true;
  let monthsToCalculate: { month: number, year: number }[] = [];
  
  if (questionLower.includes('individually') || questionLower.includes('each month')) {
    if (questionLower.includes('nov') && questionLower.includes('dec')) {
      monthsToCalculate = [
        { month: 10, year: 2024 }, // November
        { month: 11, year: 2024 }  // December
      ];
    }
  } else if (questionLower.includes('nov 2024') && questionLower.includes('dec 2024')) {
    dateFilter = (date: Date) => 
      (date.getMonth() === 10 || date.getMonth() === 11) && 
      date.getFullYear() === 2024;
  } else if (questionLower.includes('nov 2024')) {
    dateFilter = (date: Date) => date.getMonth() === 10 && date.getFullYear() === 2024;
  } else if (questionLower.includes('dec 2024')) {
    dateFilter = (date: Date) => date.getMonth() === 11 && date.getFullYear() === 2024;
  }

  // Handle product-specific queries
  let productFilter: (row: any[]) => boolean = () => true;
  if (questionLower.includes('protein acai bowl')) {
    productFilter = (row) => row[4]?.toLowerCase().includes('protein acai bowl');
  }

  // If asking for individual months
  if (monthsToCalculate.length > 0) {
    const results = monthsToCalculate.map(({ month, year }) => {
      const monthFilter = (date: Date) => date.getMonth() === month && date.getFullYear() === year;
      const filteredRows = rows.filter(row => 
        monthFilter(new Date(row[1])) && 
        productFilter(row)
      );
      
      const total = filteredRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
      const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
      return `${monthName} 2024: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });
    
    return results.join('\n');
  }

  // Regular total calculation
  if (questionLower.includes('total sales') || 
      questionLower.includes('revenue') || 
      questionLower.includes('sales') ||
      questionLower.includes('what were')) {
    const filteredRows = rows.filter(row => 
      dateFilter(new Date(row[1])) && 
      productFilter(row)
    );

    if (filteredRows.length === 0) {
      return 'Cannot calculate from available data';
    }

    const total = filteredRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return 'Cannot calculate from available data';
}

export async function POST(request: Request) {
  try {
    const env = validateEnv();
    const body = await request.json();
    
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

    const answer = calculateAnswer(body.question, response.data.values, body.conversation);
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