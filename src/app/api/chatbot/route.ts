import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getEnv } from '@/utils/env';

// Initialize the Sheets API client
const sheets = google.sheets('v4');

// Initialize Google credentials with error handling
function getGoogleAuth() {
  try {
    // Get the private key and handle different possible formats
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    
    // Check for double escaped newlines (\\n) and replace with actual newlines
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!privateKey) {
      throw new Error("No Google private key provided");
    }
    
    // Standard JWT client with additional options for Node.js 22 compatibility
    return new google.auth.JWT({
      email: getEnv('GOOGLE_CLIENT_EMAIL'),
      key: getEnv('GOOGLE_PRIVATE_KEY'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } catch (error) {
    console.error("Error initializing Google auth:", error);
    throw new Error(`Failed to initialize Google authentication: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function POST(request: Request) {
  try {
    // Check for required environment variables
    if (!process.env.SPREADSHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.error("Missing required environment variables for Google Sheets API");
      return NextResponse.json(
        { success: false, error: 'Missing required configuration for Google Sheets API' },
        { status: 500 }
      );
    }
    
    // Get authentication client with error handling
    const auth = getGoogleAuth();
    
    console.log('Chatbot: Fetching spreadsheet data directly...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
      key: process.env.GOOGLE_API_KEY,
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