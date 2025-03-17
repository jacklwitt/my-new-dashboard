import { NextResponse } from 'next/server';
// Fix the import based on your actual env.ts exports
import * as envUtils from '@/utils/env';
// Alternative options:
// import { getEnv } from '@/utils/env';
// import env from '@/utils/env';

export async function POST(request: Request) {
  try {
    console.log('Chatbot: Attempting to fetch spreadsheet data with direct HTTP request...');

    // Make direct HTTP request without JWT authentication
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}/values/Sheet1!A1:I10001?key=${process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const sheetsData = await response.json();
    const rows = sheetsData.values || [];
    
    if (rows.length <= 1) {
      console.warn("Spreadsheet returned no data or only headers");
      return NextResponse.json(
        { success: false, error: 'Spreadsheet contains no data' },
        { status: 404 }
      );
    }
    
    // Convert to objects with headers - with TypeScript types added
    const headers: string[] = rows[0] as string[];
    const data = rows.slice(1).map((row: any[]) => {
      return headers.reduce((obj: Record<string, any>, header: string, index: number) => {
        obj[header] = row[index];
        return obj;
      }, {} as Record<string, any>);
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in chatbot data API:', error);
    
    const errorMessage = error instanceof Error ? 
      `${error.name}: ${error.message}` : 
      'Unknown error occurred';
      
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch spreadsheet data',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}