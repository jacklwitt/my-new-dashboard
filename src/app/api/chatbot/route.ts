import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { Buffer } from 'buffer';

// Initialize the Sheets API client
const sheets = google.sheets('v4');

// More robust function to handle different private key formats
function preparePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return '';
  
  // If the key is already formatted correctly
  if (rawKey.includes('-----BEGIN PRIVATE KEY-----') && rawKey.includes('\n')) {
    return rawKey;
  }
  
  // Replace literal \n with actual line breaks
  let formattedKey = rawKey.replace(/\\n/g, '\n');
  
  // If missing PEM headers/footers, add them
  if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
    formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----\n`;
  }
  
  return formattedKey;
}

// Initialize Google credentials with error handling
function getGoogleAuth() {
  try {
    let privateKey: string;
    
    // Use base64 encoded key if available (recommended)
    if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
      privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      console.log("Using base64 encoded private key");
    }
    // Fallback to regular key with formatting
    else if (process.env.GOOGLE_PRIVATE_KEY) {
      privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
      console.log("Using regular private key with formatting");
    }
    else {
      throw new Error("No Google private key provided");
    }
    
    return new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: privateKey,
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
    
    // Return a more detailed error message to help debug
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