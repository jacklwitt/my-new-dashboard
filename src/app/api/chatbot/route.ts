import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { validateEnv } from '@/utils/env';
// Alternative options:
// import { getEnv } from '@/utils/env';
// import env from '@/utils/env';

// Use this approach which is common in Next.js apps
export async function POST(request: Request) {
  try {
    console.log('Chatbot: Using authentication method from recommendations route...');
    
    // Use the validated environment variables
    const env = validateEnv();

    // Use the same GoogleAuth pattern as recommendations
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n'),
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    // Get client and create sheets instance
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    
    // Fetch data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
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