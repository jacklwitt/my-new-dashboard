import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

function calculateAnswer(question: string, data: any[], previousQuestion?: string): string {
  const rows = data.slice(1);
  const questionLower = question.toLowerCase();
  const previousLower = previousQuestion?.toLowerCase() || '';
  
  // Handle individual month breakdowns
  if ((questionLower.includes('individually') || 
       questionLower.includes('separately') || 
       questionLower.includes('each') || 
       questionLower.includes('break')) && 
      previousLower.includes('protein acai bowl')) {

    const productRows = rows.filter(row => row[4]?.toLowerCase().includes('protein acai bowl'));
    
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

function monthlyBreakdown(rows: any[], months: Array<{month: number, year: number}>, context: string): string {
  // Get product filter from context
  let productFilter: (row: any[]) => boolean = () => true;
  if (context.includes('protein acai bowl')) {
    productFilter = (row) => row[4]?.toLowerCase().includes('protein acai bowl');
  }

  const results = months.map(({ month, year }) => {
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, conversation } = body;

    // Get previous question for context
    const previousQuestion = conversation?.length > 0 
      ? conversation[conversation.length - 1].content 
      : '';

    const keyFilePath = path.join(process.cwd(), 'credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    });

    // Pass both current and previous question for context
    const answer = calculateAnswer(question, response.data.values || [], previousQuestion);
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
} 