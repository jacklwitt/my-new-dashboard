import { NextResponse } from 'next/server';
import { fetchSpreadsheetData } from '@/lib/data';

export async function GET() {
  try {
    // Get data from spreadsheet
    const data = await fetchSpreadsheetData();
    
    // Format data consistently - handle different possible shapes
    let rows = [];
    if (Array.isArray(data)) {
      rows = data.slice(1); // Skip header
    } else if (data.data && Array.isArray(data.data)) {
      rows = data.data.slice(1); // Skip header
    }
    
    // Extract unique product names from column E (index 4)
    const products = Array.from(new Set(
      rows
        .filter((row: any) => row && row.length > 4 && row[4]) // Ensure row and product name exists
        .map((row: any) => row[4]) // Get product name
    ));
    
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
} 