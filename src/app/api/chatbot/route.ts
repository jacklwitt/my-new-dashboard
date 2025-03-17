import { google } from 'googleapis';
import { NextResponse } from 'next/server';
// Fix the import based on your actual env.ts exports
import * as envUtils from '@/utils/env';
// Alternative options:
// import { getEnv } from '@/utils/env';
// import env from '@/utils/env';

// Initialize the Sheets API client
const sheets = google.sheets('v4');

export async function POST(request: Request) {
  try {
    console.log('Chatbot: Attempting to fetch spreadsheet data with env utility...');

    // Set up authentication
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
      auth,
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      console.warn("Spreadsheet returned no data or only headers");
      return NextResponse.json(
        { success: false, error: 'Spreadsheet contains no data' },
        { status: 404 }
      );
    }
    
    // Convert to objects with headers
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      return headers.reduce((obj, header, index) => {
        obj[header] = row[index];
        return obj;
      }, {});
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