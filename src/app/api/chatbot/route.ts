import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// Initialize the Sheets API client
const sheets = google.sheets('v4');

// Get environment variables
const env = {
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Add this function to properly format the private key
function formatPrivateKey(key: string): string {
  // If the key already includes the correct PEM format with line breaks, return it as is
  if (key.includes('-----BEGIN PRIVATE KEY-----') && key.includes('\n')) {
    return key;
  }
  
  // Replace literal '\n' strings with actual line breaks
  const formattedKey = key.replace(/\\n/g, '\n');
  
  // If the key doesn't have the proper PEM header/footer, add them
  if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----\n`;
  }
  
  return formattedKey;
}

// Then modify where you initialize the Google credentials
const privateKey = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY || '');

// Set up authentication
const auth = new google.auth.JWT({
  email: env.GOOGLE_CLIENT_EMAIL,
  key: privateKey,  // Use the formatted key
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

export async function POST(request: Request) {
  try {
    // Directly fetch data from Google Sheets
    console.log('Chatbot: Fetching spreadsheet data directly...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
      auth,
    });

    const rows = response.data.values || [];
    
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
    return NextResponse.json(
      { success: false, error: 'Failed to fetch spreadsheet data' },
      { status: 500 }
    );
  }
} 