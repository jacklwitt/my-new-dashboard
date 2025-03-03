import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { google } from 'googleapis';
import path from 'path';
import type { ChatRequest, ChatResponse, ApiError } from '@/types/api';
import { validateEnv } from '@/utils/env';

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

// Move OpenAI instance creation to a function to ensure env is validated
function createOpenAIClient() {
  const env = validateEnv();
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
}

async function processWithGPT(
  openaiClient: OpenAI,  // Rename parameter to avoid confusion
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

  const completion = await openaiClient.chat.completions.create({  // Use the passed client
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

function calculateSeasonalPerformance(data: any[]) {
  const rows = data.slice(1); // Skip header
  
  // Initialize seasonal data
  const seasonalData = {
    Spring: { sales: 0, transactions: 0 },  // Mar-May
    Summer: { sales: 0, transactions: 0 },  // Jun-Aug
    Autumn: { sales: 0, transactions: 0 },  // Sep-Nov
    Winter: { sales: 0, transactions: 0 }   // Dec-Feb
  };

  // Map months to seasons
  const seasonMap = {
    0: 'Winter',  // Jan
    1: 'Winter',  // Feb
    2: 'Spring',  // Mar
    3: 'Spring',  // Apr
    4: 'Spring',  // May
    5: 'Summer',  // Jun
    6: 'Summer',  // Jul
    7: 'Summer',  // Aug
    8: 'Autumn',  // Sep
    9: 'Autumn',  // Oct
    10: 'Autumn', // Nov
    11: 'Winter'  // Dec
  };

  // Aggregate data by season
  rows.forEach(row => {
    const date = new Date(row[1]);
    const season = seasonMap[date.getMonth() as keyof typeof seasonMap];
    const sales = parseFloat(row[8]) || 0;

    seasonalData[season].sales += sales;
    seasonalData[season].transactions += 1;
  });

  // Calculate averages and find best season
  let bestSeason = '';
  let maxSales = 0;

  Object.entries(seasonalData).forEach(([season, data]) => {
    if (data.sales > maxSales) {
      maxSales = data.sales;
      bestSeason = season;
    }
  });

  return {
    seasonalData,
    bestSeason,
    bestSeasonSales: maxSales
  };
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

async function analyzeProductSales(data: any[], productName: string) {
  const rows = data.slice(1);
  const productRows = rows.filter(row => 
    row[4]?.toLowerCase().includes(productName.toLowerCase())
  );

  // Group sales by month
  const monthlySales = new Map<string, number>();
  const monthlyTransactions = new Map<string, number>();

  productRows.forEach(row => {
    const date = new Date(row[1]);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const amount = parseFloat(row[8]) || 0;

    monthlySales.set(monthKey, (monthlySales.get(monthKey) || 0) + amount);
    monthlyTransactions.set(monthKey, (monthlyTransactions.get(monthKey) || 0) + 1);
  });

  // Calculate growth metrics
  const monthlyData = Array.from(monthlySales.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sales]) => ({
      month,
      sales,
      transactions: monthlyTransactions.get(month) || 0,
      avgOrderValue: sales / (monthlyTransactions.get(month) || 1)
    }));

  // Calculate month-over-month growth
  const growthData = monthlyData.map((data, i) => {
    if (i === 0) return { ...data, growth: 0 };
    const prevSales = monthlyData[i - 1].sales;
    const growth = ((data.sales - prevSales) / prevSales) * 100;
    return { ...data, growth };
  });

  return {
    monthlyData: growthData,
    totalSales: productRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0),
    totalTransactions: productRows.length,
    averageOrderValue: productRows.reduce((sum, row) => sum + (parseFloat(row[8]) || 0), 0) / productRows.length
  };
}

export async function POST(request: Request) {
  try {
    // Add CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    console.log('Validating environment...');
    const env = validateEnv();
    console.log('Environment validated');

    const openaiClient = createOpenAIClient();

    const body = await request.json() as ChatRequest;
    console.log('Request:', {
      questionLength: body.question?.length,
      hasConversation: !!body.conversation
    });

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n'),
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    console.log('Authenticating with Google...');
    const client = await auth.getClient();
    
    console.log('Creating Google Sheets client...');
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: client as any
    });
    
    console.log(`Fetching spreadsheet data...`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
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

    console.log('Data loaded. Processing response...');
    const data = response.data.values;

    const questionLower = body.question.toLowerCase();

    // Check if it's a seasonal question
    if (questionLower.includes('season')) {
      const seasonalAnalysis = calculateSeasonalPerformance(data);
      
      const systemPrompt = `You are a retail analytics expert. Here's the seasonal performance data:

${Object.entries(seasonalAnalysis.seasonalData)
  .map(([season, data]) => 
    `${season}:
• Total Sales: $${data.sales.toFixed(2)}
• Total Transactions: ${data.transactions}
• Average Order: $${(data.sales / data.transactions).toFixed(2)}`
  ).join('\n\n')}

Best performing season: ${seasonalAnalysis.bestSeason} with $${seasonalAnalysis.bestSeasonSales.toFixed(2)} in sales.

Provide a detailed analysis of the seasonal patterns, focusing on the strongest and weakest seasons. Include specific numbers and percentages where relevant.`;

      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.question }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return NextResponse.json({ answer: completion.choices[0].message.content }, { headers });
    }

    // Check for product-specific questions
    const productMatch = data
      .slice(1)
      .map(row => row[4])
      .find(product => product && questionLower.includes(product.toLowerCase()));

    if (productMatch) {
      const analysis = await analyzeProductSales(data, productMatch);

      // Create a detailed prompt with the analysis
      const systemPrompt = `You are a retail analytics expert. Answer the question using this sales data for ${productMatch}:

Monthly Performance:
${analysis.monthlyData.map(m => 
  `${m.month}: $${m.sales.toFixed(2)} (${m.transactions} orders, ${m.growth.toFixed(1)}% growth)`
).join('\n')}

Overall Metrics:
• Total Sales: $${analysis.totalSales.toFixed(2)}
• Total Orders: ${analysis.totalTransactions}
• Average Order: $${analysis.averageOrderValue.toFixed(2)}

Provide a concise but detailed answer focusing on the specific aspects asked about in the question. Include relevant numbers and trends.`;

      console.log('Using product-specific prompt');
      // Pass the original question to GPT, not the system prompt
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.question }  // Pass the original question
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return NextResponse.json({ answer: completion.choices[0].message.content }, { headers });
    }

    // If no specific analysis matches, fall back to GPT
    console.log('No specific analysis matched, falling back to GPT...');
    const chatResponse = await processWithGPT(openaiClient, body.question, body.conversation || [], data);
    return NextResponse.json({ answer: chatResponse }, { headers });

  } catch (error: unknown) {
    const e = error as ApiError;
    console.error('Chat API Error:', {
      name: e.name,
      message: e.message,
      stack: e.stack?.split('\n')[0],
      cause: e.cause
    });

    return NextResponse.json({ 
      error: e.message || 'Failed to process request'
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
} 