import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { google } from 'googleapis';
import type { ApiError } from '@/types/api';
import { validateEnv } from '@/utils/env';
import type { ChatCompletion } from 'openai/resources';

async function analyzeProductData(data: any[], productName: string) {
  const rows = data.slice(1);
  const productRows = rows.filter(row => row[4]?.toLowerCase().includes(productName.toLowerCase()));
  
  // Group by month and promotion
  const monthlyStats = new Map<string, {
    sales: number;
    promoSales: Map<string, number>;
    customerTypes: Map<string, number>;
    timeOfDay: Map<string, number>;
  }>();

  productRows.forEach(row => {
    const date = new Date(row[1]);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const promoCode = row[7] || 'None';
    const sales = parseFloat(row[8]) || 0;
    const hour = date.getHours();
    const timeSlot = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    const customerType = row[2]?.includes('LOYAL') ? 'Loyalty' : 'Regular';

    if (!monthlyStats.has(monthKey)) {
      monthlyStats.set(monthKey, {
        sales: 0,
        promoSales: new Map(),
        customerTypes: new Map(),
        timeOfDay: new Map()
      });
    }

    const stats = monthlyStats.get(monthKey)!;
    stats.sales += sales;
    stats.promoSales.set(promoCode, (stats.promoSales.get(promoCode) || 0) + sales);
    stats.customerTypes.set(customerType, (stats.customerTypes.get(customerType) || 0) + sales);
    stats.timeOfDay.set(timeSlot, (stats.timeOfDay.get(timeSlot) || 0) + sales);
  });

  // Find best performing promotion
  let bestPromo = '';
  let bestPromoImpact = 0;
  const maxSalesGrowth = 0;
  let peakMonthlySales = 0;
  let bestTimeSlot = '';
  let bestCustomerType = '';
  const bestMarketingChannel = { channel: '', conversion: 0 };

  monthlyStats.forEach((stats, month) => {
    // Track peak sales
    peakMonthlySales = Math.max(peakMonthlySales, stats.sales);

    // Analyze promotions
    stats.promoSales.forEach((promoSales, promoCode) => {
      if (promoCode !== 'None') {
        const impact = (promoSales / stats.sales) * 100;
        if (impact > bestPromoImpact) {
          bestPromo = promoCode;
          bestPromoImpact = impact;
        }
      }
    });

    // Find best time slot
    let maxTimeSlotSales = 0;
    stats.timeOfDay.forEach((sales, timeSlot) => {
      if (sales > maxTimeSlotSales) {
        maxTimeSlotSales = sales;
        bestTimeSlot = timeSlot;
      }
    });

    // Find best customer type
    stats.customerTypes.forEach((sales, type) => {
      if (type === 'Loyalty' && sales > stats.sales * 0.4) {
        bestCustomerType = 'Loyalty';
      }
    });
  });

  return {
    bestPromo,
    promoImpact: bestPromoImpact,
    salesGrowth: maxSalesGrowth,
    peakSales: peakMonthlySales,
    bestTiming: bestTimeSlot,
    bestCustomers: bestCustomerType,
    marketingStats: bestMarketingChannel
  };
}

// Move function declaration outside the try block
async function getCompletion(
  openai: OpenAI,
  model: 'gpt-4' | 'gpt-3.5-turbo',
  systemPrompt: string,
  targetProduct: string
): Promise<ChatCompletion> {
  console.log(`Attempting with model: ${model}`);
  const timeoutDuration = model === 'gpt-4' ? 8000 : 9000; // 8s for GPT-4, 9s for GPT-3.5
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${model} API call timed out after ${timeoutDuration/1000}s`));
    }, timeoutDuration);
  });

  const completionPromise = openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `Please provide detailed recommendations for ${targetProduct} based on the analysis.` 
      }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  }, {
    timeout: timeoutDuration - 1000 // Add timeout to request options instead
  });

  return Promise.race([completionPromise, timeoutPromise]);
}

export async function POST(request: Request) {
  console.log('=== Advice API Starting ===');
  
  try {
    const env = validateEnv();
    
    // Check environment setup
    console.log('Environment validation:', {
      hasOpenAI: !!env.OPENAI_API_KEY?.length,
      hasGoogleCreds: !!env.GOOGLE_CLIENT_EMAIL && !!env.GOOGLE_PRIVATE_KEY,
      privateKeyLength: env.GOOGLE_PRIVATE_KEY?.length,
      privateKeyStart: env.GOOGLE_PRIVATE_KEY?.substring(0, 50),
      isVercel: process.env.VERCEL === '1'
    });

    const body = await request.json();
    console.log('Request validation:', {
      hasRecommendation: !!body.recommendation,
      recommendationType: body.recommendation?.type,
      hasTarget: !!body.recommendation?.target
    });

    if (!body.recommendation) {
      throw new Error('No recommendation provided');
    }

    // Test Google Auth
    try {
      console.log('Initializing Google Auth...');
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: env.GOOGLE_CLIENT_EMAIL,
          private_key: env.GOOGLE_PRIVATE_KEY,
          project_id: env.GOOGLE_PROJECT_ID
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      console.log('Getting Google client...');
      const client = await auth.getClient();
      console.log('Google Auth successful');

      const sheets = google.sheets({ version: 'v4', auth: client as any });
      
      console.log('Fetching spreadsheet data...');
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SPREADSHEET_ID,
        range: 'Sheet1!A1:I10001',
      });

      if (!response.data.values) {
        throw new Error('No data found in spreadsheet');
      }

      // Analyze the data
      const analysis = await analyzeProductData(response.data.values, body.recommendation.target);
      console.log('Data analysis complete:', analysis);

      // Create enhanced prompt with analysis
      const systemPrompt = `You are a retail analytics expert. Based on this analysis:

Product: ${body.recommendation.target}
Current Status: ${body.recommendation.impact}
Key Metrics:
• Best promotion "${analysis.bestPromo}" drove ${analysis.promoImpact.toFixed(1)}% of sales
• Peak monthly sales: $${analysis.peakSales.toLocaleString()}
• Best performance time: ${analysis.bestTiming}
• Strong performance with ${analysis.bestCustomers} customers

Provide specific recommendations in this format:

1. Promotion Strategy
   • Recommend specific promotion approach based on ${analysis.bestPromo}'s success
   • Set clear targets based on peak sales of $${analysis.peakSales.toLocaleString()}
   • Suggest pricing or discount strategy

2. Timing & Audience
   • Best timing: ${analysis.bestTiming}
   • Target customer segments: ${analysis.bestCustomers || 'All segments'}
   • Customer engagement tactics

3. Marketing Focus
   • Specific marketing channels
   • Key messages to highlight
   • Integration with current promotions

Keep recommendations specific, data-driven, and actionable within 30 days.`;

      console.log('Creating OpenAI client...');
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        maxRetries: 0, // Disable retries to respect our timeouts
      });

      let completion: ChatCompletion;
      try {
        // Use GPT-3.5-Turbo first in production for faster response
        if (process.env.VERCEL === '1') {
          console.log('Production environment detected, trying GPT-3.5-Turbo first...');
          try {
            completion = await getCompletion(openai, 'gpt-3.5-turbo', systemPrompt, body.recommendation.target);
            console.log('GPT-3.5-Turbo response received successfully');
          } catch (turboError) {
            console.log('GPT-3.5-Turbo failed, attempting GPT-4...', {
              error: turboError instanceof Error ? turboError.message : 'Unknown error'
            });
            completion = await getCompletion(openai, 'gpt-4', systemPrompt, body.recommendation.target);
            console.log('GPT-4 response received successfully');
          }
        } else {
          // In development, try GPT-4 first
          console.log('Development environment detected, trying GPT-4 first...');
          try {
            completion = await getCompletion(openai, 'gpt-4', systemPrompt, body.recommendation.target);
            console.log('GPT-4 response received successfully');
          } catch (gpt4Error) {
            console.log('GPT-4 failed, falling back to GPT-3.5-Turbo...', {
              error: gpt4Error instanceof Error ? gpt4Error.message : 'Unknown error'
            });
            completion = await getCompletion(openai, 'gpt-3.5-turbo', systemPrompt, body.recommendation.target);
            console.log('GPT-3.5-Turbo response received successfully');
          }
        }
      } catch (error) {
        console.error('All model attempts failed:', error);
        throw new Error('Failed to generate advice with any available model');
      }

      console.log('OpenAI response received:', {
        status: 'success',
        timestamp: new Date().toISOString(),
        hasContent: !!completion.choices[0].message.content,
        contentLength: completion.choices[0].message.content?.length
      });

      const answer = completion.choices[0].message.content;
      
      if (!answer) {
        throw new Error('No advice generated');
      }

      return NextResponse.json({ answer });

    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('OpenAI or Google Error:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n')[0],
          timestamp: new Date().toISOString(),
          isTimeout: error.message.includes('timed out')
        });
      } else {
        console.error('Unknown Error:', error);
      }
      throw error;
    }

  } catch (error: unknown) {
    console.error('Advice API Error:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n')[0] : undefined,
      isVercel: process.env.VERCEL === '1'
    });
    const message = error instanceof Error ? error.message : 'Failed to generate advice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 