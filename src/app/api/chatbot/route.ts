import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// Initialize the Sheets API client
const sheets = google.sheets('v4');

// Create auth with JSON credentials
function getGoogleAuth() {
  try {
    // Create credentials object from environment variables
    const credentials = {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      // Add other required fields that might be in your service account JSON
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID || ""
    };

    // Create OAuth2 client from JSON credentials
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    console.log("Created auth client with GoogleAuth instead of JWT");
    return auth;
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
    
    console.log('Chatbot: Fetching spreadsheet data with GoogleAuth...');
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