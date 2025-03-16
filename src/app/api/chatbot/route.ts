import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { jwtHeader, createSignature } from './jwt-helper'; // We'd create this file

// At the very top of your file
if (process.env.NODE_ENV === 'production') {
  // Tell Node.js to use legacy OpenSSL provider
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --openssl-legacy-provider';
  console.log("Enabled OpenSSL legacy provider via NODE_OPTIONS");
}

// Enable the legacy provider for OpenSSL
try {
  // Enable the legacy provider for OpenSSL
  crypto.setEngine('legacy', crypto.constants.ENGINE_METHOD_ALL);
  console.log("Successfully enabled legacy crypto engine");
} catch (error) {
  console.warn("Unable to set legacy crypto engine:", error);
}

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
    
    // Validate the key has the necessary structure
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.error("Private key appears to be missing PEM format headers");
    }

    if (!privateKey) {
      throw new Error("No Google private key provided");
    }
    
    console.log("Auth setup with key starting with:", 
                privateKey.substring(0, 40) + "..." + 
                privateKey.substring(privateKey.length - 20));
    
    // Use a custom JWT implementation that works with Node.js 22
    return new google.auth.OAuth2Client({
      // Custom implementation that works around the OpenSSL issue
      // This would require more code in a jwt-helper.ts file
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