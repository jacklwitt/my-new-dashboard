import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import path from 'path';
import { google } from 'googleapis';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeProductPromotions(data: any[], productName: string): Promise<{
  bestPromo: string;
  promoImpact: number;
  salesGrowth: number;
  peakSales: number;
  bestTiming: string;
  bestCustomers: string;
  marketingStats: {
    channel: string;
    conversion: number;
  };
}> {
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
  let maxSalesGrowth = 0;
  let peakMonthlySales = 0;
  let bestTimeSlot = '';
  let bestCustomerType = '';
  let bestMarketingChannel = { channel: '', conversion: 0 };

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recommendation } = body;

    // Load and analyze data
    const keyFilePath = path.join(process.cwd(), 'credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Sheet1!A1:I10001',
    });

    const analysis = await analyzeProductPromotions(response.data.values || [], recommendation.target);

    const systemPrompt = `You are a retail analytics expert. Based on this data analysis:

- Best promotion "${analysis.bestPromo}" drove ${analysis.promoImpact.toFixed(1)}% of sales
- Peak monthly sales: $${analysis.peakSales.toLocaleString()}
- Best performance time: ${analysis.bestTiming}
- Strong performance with ${analysis.bestCustomers} customers

Provide specific recommendations in this format:

Based on historical data:

1. Promotion Strategy
   - Include specific promotion details and impact
   - Recommend similar approach with specific numbers
   - Set clear targets based on peak performance

2. Timing & Audience
   - Best performance timing
   - Most responsive customer segment

3. Marketing Focus
   - Most effective channel
   - Specific integration tactics

Keep it data-driven and concise.`;

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Provide recommendations for ${recommendation.target} to improve current performance.` }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return NextResponse.json({ answer: chatResponse.choices[0].message.content });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
} 