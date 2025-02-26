import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { google } from 'googleapis';
import path from 'path';
import type { ChatRequest, ChatResponse, ApiError } from '@/types/api';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function createSystemPrompt(data: any[]): string {
  const totalRows = data.length - 1;
  const dateRange = {
    start: new Date(data[1][1]),
    end: new Date(data[totalRows][1])
  };

  return `
You are an expert data analyst assistant. You have access to a dataset with ${totalRows} transactions from ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}.

The data structure:
- Transaction_ID (A): Unique identifier
- Purchase_Date (B): Transaction date
- Customer_ID (C): Customer identifier
- Store_Location (D): Store location
- Product_Name (E): Product name
- Unit_Price (F): Price per unit
- Quantity (G): Units purchased
- Discount_Code_Used (H): Discount code
- Line_Total (I): Total amount

Previous calculations and answers are available in the conversation history.

INSTRUCTIONS:
1. For numerical queries (totals, averages, etc.), I will calculate them. Only interpret the results.
2. For complex analysis, trends, or insights, provide detailed explanations.
3. Reference previous questions and answers when relevant.
4. If asked about previous calculations, explain the context and relationships.
5. For questions you can't answer with the data, say "I cannot answer that with the available data."
`;
}

async function processWithGPT(
  question: string,
  conversation: any[],
  data: any[],
  calculatedAnswer?: string
): Promise<string> {
  const messages = [
    { role: 'system', content: createSystemPrompt(data) },
    ...conversation,
    { role: 'user', content: question }
  ];

  if (calculatedAnswer) {
    messages.push({
      role: 'system',
      content: `The calculated answer to the current question is: ${calculatedAnswer}`
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: messages as any,
    temperature: 0.2,
    max_tokens: 1000,
  });

  return completion.choices[0].message.content || 'No response generated';
}

function getUniqueValues(data: any[], columnIndex: number): string[] {
  // Skip header row and get unique values from the specified column
  return Array.from(new Set(
    data.slice(1)
      .map(row => row[columnIndex]?.toLowerCase().trim())
      .filter(Boolean) // Remove empty/null values
  ));
}

function calculateAnswer(question: string, data: any[]): string {
  const rows = data.slice(1); // Skip header row
  const questionLower = question.toLowerCase();
  
  // Handle date-specific queries
  let dateFilter: (date: Date) => boolean = () => true;
  if (questionLower.includes('jan 2024') || questionLower.includes('january 2024')) {
    dateFilter = (date: Date) => date.getMonth() === 0 && date.getFullYear() === 2024;
  } else if (questionLower.includes('feb 2024') || questionLower.includes('february 2024')) {
    dateFilter = (date: Date) => date.getMonth() === 1 && date.getFullYear() === 2024;
  }

  // Get unique values from the data
  const locations = getUniqueValues(data, 3);  // Column D: Store_Location
  const products = getUniqueValues(data, 4);   // Column E: Product_Name
  const discountCodes = getUniqueValues(data, 7); // Column H: Discount_Code_Used

  // Handle location-specific queries
  let locationFilter: (row: any[]) => boolean = () => true;
  for (const loc of locations) {
    if (questionLower.includes(loc)) {
      locationFilter = (row) => row[3]?.toLowerCase().trim() === loc;
      break;
    }
  }

  // Handle product-specific queries
  let productFilter: (row: any[]) => boolean = () => true;
  for (const product of products) {
    if (questionLower.includes(product)) {
      productFilter = (row) => row[4]?.toLowerCase().trim() === product;
      break;
    }
  }

  // Handle discount code queries
  let discountFilter: (row: any[]) => boolean = () => true;
  for (const code of discountCodes) {
    if (questionLower.includes(code)) {
      discountFilter = (row) => row[7]?.toLowerCase().trim() === code;
      break;
    }
  }

  // Calculate based on question type
  if (questionLower.includes('total sales') || 
      questionLower.includes('revenue') || 
      questionLower.includes('sales')) {
    const filteredRows = rows.filter(row => 
      dateFilter(new Date(row[1])) && 
      locationFilter(row) && 
      productFilter(row) && 
      discountFilter(row)
    );

    if (filteredRows.length === 0) {
      return 'Cannot calculate from available data';
    }

    const total = filteredRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (questionLower.includes('average order') || questionLower.includes('avg order')) {
    const filteredRows = rows.filter(row => 
      dateFilter(new Date(row[1])) && 
      locationFilter(row) && 
      productFilter(row) && 
      discountFilter(row)
    );

    if (filteredRows.length === 0) {
      return 'Cannot calculate from available data';
    }

    const total = filteredRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0);
    const avg = total / filteredRows.length;
    return `$${avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return 'Cannot calculate from available data';
}

async function loadSheetData() {
  try {
    console.log('Loading credentials from:', path.join(process.cwd(), 'credentials.json'));

    if (!process.env.SPREADSHEET_ID) {
      throw new Error('SPREADSHEET_ID environment variable is not set');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').split('\\n').join('\n'),
        project_id: process.env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    console.log('Authenticating with Google...');
    const client = await auth.getClient();
    
    console.log('Creating Google Sheets client...');
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: client as any  // Type assertion to fix compatibility issue
    });
    
    console.log(`Attempting to fetch data from spreadsheet: ${process.env.SPREADSHEET_ID}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    }).catch(error => {
      console.error('Google Sheets API Error:', error.message);
      if (error.message.includes('has not been used')) {
        throw new Error('Google Sheets API is not enabled. Please enable it in the Google Cloud Console.');
      }
      if (error.message.includes('not found')) {
        throw new Error('Spreadsheet not found or service account lacks access');
      }
      throw error;
    });

    if (!response.data.values) {
      throw new Error('No data found in spreadsheet');
    }

    console.log('Successfully loaded sheet data. Row count:', response.data.values.length);
    return response.data.values;
  } catch (error) {
    console.error('Error loading sheet data:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
}

async function analyzeProductData(data: any[], productName: string) {
  console.log('Starting product analysis for:', productName);
  console.log('Total rows:', data.length);
  
  const rows = data.slice(1);
  const productRows = rows.filter(row => {
    const match = row[4]?.toLowerCase().includes(productName.toLowerCase());
    return match;
  });
  
  console.log('Found product rows:', productRows.length);
  
  // Group by month
  const monthlyData: any = {};
  
  productRows.forEach(row => {
    const date = new Date(row[1]);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    console.log('Processing row:', { monthKey, row });
    const promoCode = row[7] || 'None';
    const sales = parseFloat(row[8]) || 0;
    const hour = date.getHours();
    const timeSlot = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    const customerType = row[2]?.includes('LOYAL') ? 'Loyalty' : 'Regular';

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        sales: 0,
        promoSales: {},
        customerTypes: {},
        timeOfDay: {}
      };
    }

    const stats = monthlyData[monthKey];
    stats.sales += sales;
    stats.promoSales[promoCode] = (stats.promoSales[promoCode] || 0) + sales;
    stats.customerTypes[customerType] = (stats.customerTypes[customerType] || 0) + sales;
    stats.timeOfDay[timeSlot] = (stats.timeOfDay[timeSlot] || 0) + sales;
  });

  // Log analysis results
  console.log('Monthly data:', monthlyData);
  
  // Find best metrics
  let bestPromo = '';
  let bestPromoImpact = 0;
  let peakSales = 0;
  let bestTiming = '';
  let bestCustomerType = '';
  let recentTrend = 0;

  Object.entries(monthlyData).forEach(([_month, stats]: [string, any]) => {
    // Track peak sales
    peakSales = Math.max(peakSales, stats.sales);

    // Find best promotion
    Object.entries(stats.promoSales as Record<string, number>).forEach(([code, sales]) => {
      if (code !== 'None') {
        const impact = (sales / stats.sales) * 100;
        if (impact > bestPromoImpact) {
          bestPromo = code;
          bestPromoImpact = impact;
        }
      }
    });

    // Find best time slot
    Object.entries(stats.timeOfDay as Record<string, number>).forEach(([slot, sales]) => {
      if (sales > (stats.timeOfDay[bestTiming] || 0)) {
        bestTiming = slot;
      }
    });

    // Find best customer type
    Object.entries(stats.customerTypes as Record<string, number>).forEach(([type, sales]) => {
      if (type === 'Loyalty' && sales > stats.sales * 0.4) {
        bestCustomerType = type;
      }
    });
  });

  // Calculate recent trend
  const months = Object.keys(monthlyData).sort();
  if (months.length >= 2) {
    const lastMonth = monthlyData[months[months.length - 1]].sales;
    const prevMonth = monthlyData[months[months.length - 2]].sales;
    recentTrend = ((lastMonth - prevMonth) / prevMonth) * 100;
  }

  return {
    monthlyData,
    bestPromo,
    promoImpact: bestPromoImpact,
    peakSales,
    bestTiming,
    bestCustomerType,
    recentTrend
  };
}

export async function POST(request: Request) {
  try {
    // Add detailed environment validation logging
    console.log('Environment Validation:', {
      GOOGLE_PROJECT_ID: {
        exists: !!process.env.GOOGLE_PROJECT_ID,
        length: process.env.GOOGLE_PROJECT_ID?.length
      },
      GOOGLE_CLIENT_EMAIL: {
        exists: !!process.env.GOOGLE_CLIENT_EMAIL,
        length: process.env.GOOGLE_CLIENT_EMAIL?.length,
        isEmail: process.env.GOOGLE_CLIENT_EMAIL?.includes('@')
      },
      GOOGLE_PRIVATE_KEY: {
        exists: !!process.env.GOOGLE_PRIVATE_KEY,
        length: process.env.GOOGLE_PRIVATE_KEY?.length,
        hasHeader: process.env.GOOGLE_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY'),
        hasFooter: process.env.GOOGLE_PRIVATE_KEY?.includes('END PRIVATE KEY')
      },
      SPREADSHEET_ID: {
        exists: !!process.env.SPREADSHEET_ID,
        length: process.env.SPREADSHEET_ID?.length
      },
      OPENAI_API_KEY: {
        exists: !!process.env.OPENAI_API_KEY,
        length: process.env.OPENAI_API_KEY?.length,
        prefix: process.env.OPENAI_API_KEY?.substring(0, 7)
      }
    });

    // Test Google auth specifically
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: (process.env.GOOGLE_PRIVATE_KEY || '').split('\\n').join('\n'),
          project_id: process.env.GOOGLE_PROJECT_ID
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      
      console.log('Google Auth Test:', {
        authCreated: !!auth,
        credentialsValid: !!(auth as any)?.credentials,
      });
    } catch (error: unknown) {
      const e = error as ApiError;
      console.error('Google Auth Error:', {
        name: e.name,
        message: e.message,
        stack: e.stack
      });
    }

    // Add CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Log environment variables (without sensitive data)
    console.log('Environment check:', {
      hasGoogleCreds: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.SPREADSHEET_ID,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    });

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    const body = (await request.json()) as ChatRequest;
    console.log('Request received:', { 
      questionLength: body.question?.length,
      hasConversation: !!body.conversation
    });

    // Load data with error handling
    let data;
    try {
      data = await loadSheetData();
      console.log('Data loaded successfully:', {
        rowCount: data?.length,
        hasHeaders: !!data?.[0]
      });
    } catch (e) {
      console.error('Sheet data loading failed:', e);
      throw e;
    }

    // If it's about Protein Acai Bowl, analyze the data
    if (body.question.toLowerCase().includes('protein acai bowl')) {
      console.log('Analyzing Protein Acai Bowl data');
      const analysis = await analyzeProductData(data, 'Protein Acai Bowl');
      
      console.log('Analysis complete:', analysis);
      
      const systemPrompt = `You are a retail analytics expert. Here's the current data:

• Best promotion "${analysis.bestPromo}" drove ${analysis.promoImpact.toFixed(1)}% of sales
• Peak monthly sales: $${analysis.peakSales.toLocaleString()}
• Best performance time: ${analysis.bestTiming}
• Strong performance with ${analysis.bestCustomerType} customers
• Recent trend: ${analysis.recentTrend > 0 ? 'Up' : 'Down'} ${Math.abs(analysis.recentTrend).toFixed(1)}%

Format your response EXACTLY like this, with clear line breaks:

Based on historical data:

1. Promotion Strategy\n
   • ${analysis.bestPromo} promotion drove ${analysis.promoImpact.toFixed(1)}% of sales\n
   • Target: Exceed peak sales of $${analysis.peakSales.toLocaleString()}\n
   • Recommended discount: Similar to successful ${analysis.bestPromo} rate\n

2. Timing & Audience\n
   • Best performance: ${analysis.bestTiming}\n
   • Customer segment: ${analysis.bestCustomerType || 'Needs analysis'}\n
   • Recent trend: ${analysis.recentTrend.toFixed(1)}% change\n

3. Marketing Focus\n
   • Focus on ${analysis.bestTiming.toLowerCase()} promotions\n
   • Target similar demographics to current base\n
   • Monitor promotion effectiveness weekly\n

Use bullet points (•) with line breaks between sections.`;

      console.log('Using product-specific prompt');

      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { 
            role: 'system', 
            content: systemPrompt 
          },
          { 
            role: 'user', 
            content: body.question 
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const responseContent = chatResponse.choices[0].message?.content || '';
      return NextResponse.json({ answer: responseContent }, { headers });
    }

    console.log('Using general prompt');
    // For other questions, still try to use data
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a retail analytics expert. Always format responses with bullet points for readability:

• Use bullet points (•) for each main point
• Include specific numbers when available
• Group related points together
• Keep each point concise and clear
• Use data to support recommendations`
        },
        { role: 'user', content: body.question }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const responseContent = chatResponse.choices[0].message?.content || '';
    return NextResponse.json({ answer: responseContent }, { headers });
  } catch (error: unknown) {
    const e = error as ApiError;
    console.error('API Error:', {
      name: e.name,
      message: e.message,
      stack: e.stack,
      cause: e.cause
    });

    const response: ChatResponse = {
      error: e.message || 'Failed to process request'
    };

    return NextResponse.json(response, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
} 