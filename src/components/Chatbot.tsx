"use client";
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { stripMarkdownFormatting } from '../utils/markdownProcessor';
import { analyzeQuery } from '../utils/queryAnalyzer';

// Fix the message type error
interface Message {
  role: 'user' | 'assistant' | 'system';  // Use literal types
  content: string;
}

// Add type for props
type ChatbotProps = {
  previousQuestion?: string;
};

// Add types for products and locations
type Product = {
  id: string;
  name: string;
  category: string;
  revenue: number;
};

type Location = {
  id: string;
  name: string;
  region: string;
};

// First, add a type for the product data items
interface ProductRevenue {
  name?: string;
  product?: string;
  id?: string;
  revenue?: number;
  value?: number;
  total?: number;
}

// Module load logging
console.log('Chatbot module initializing');
console.log('Import check:', { useState, useEffect });

const isCalculationQuery = (query: string): boolean => {
  const calculationKeywords = [
    'sales', 'revenue', 'compare', 'show', 'calculate', 'total', 
    'average', 'growth', 'decline', 'by month', 'between', 'location', 
    'product', 'percentage'
  ];
  
  // Check if the query contains calculation-related keywords
  const containsKeywords = calculationKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Check for specific patterns that indicate data requests
  const isDataRequest = /show|display|what (were|was)|how much|compare/.test(query.toLowerCase());
  
  return containsKeywords && isDataRequest;
};

// Enhance the extraction of date information to handle years - using compatible approach
const extractDateInfo = (query: string) => {
  // Check for month and year patterns (e.g., "November 2024" or "Nov 2024")
  const monthYearPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i;
  const comparisonPattern = /\b(vs|versus|compared to|against)\b/i;
  
  // Extract month-year using individual matches instead of matchAll
  const dates = [];
  let match;
  const regex = new RegExp(monthYearPattern, 'gi');
  
  // Use exec in a loop instead of matchAll and spread
  while ((match = regex.exec(query)) !== null) {
    dates.push({
      month: match[1],
      year: match[2]
    });
  }
  
  // Check if this is a comparison query
  const isComparison = comparisonPattern.test(query) || dates.length > 1;
  
  return {
    dates,
    isComparison,
    hasYearSpecified: dates.length > 0
  };
};

// Enhance getFieldValue to handle a wider range of column names based on your spreadsheet
function getFieldValue(row: any, possibleFieldNames: string[]): any {
  // For debugging the specific field we're looking for
  const debugField = possibleFieldNames[0]; // Log just the first field name to reduce noise
  console.log(`FIELD DEBUG: Looking for '${debugField}' in:`, Object.keys(row).join(", "));
  
  for (const fieldName of possibleFieldNames) {
    if (row[fieldName] !== undefined && row[fieldName] !== null && row[fieldName] !== '') {
      console.log(`FIELD DEBUG: Found exact match: ${fieldName}`);
      return row[fieldName];
    }
    
    // Try with underscores (for fields like Product_Name)
    const underscoreVersion = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (row[underscoreVersion] !== undefined && row[underscoreVersion] !== null && row[underscoreVersion] !== '') {
      console.log(`FIELD DEBUG: Found underscore version: ${underscoreVersion}`);
      return row[underscoreVersion];
    }
    
    // Try lowercase version
    if (row[fieldName.toLowerCase()] !== undefined && row[fieldName.toLowerCase()] !== null && row[fieldName.toLowerCase()] !== '') {
      console.log(`FIELD DEBUG: Found lowercase: ${fieldName.toLowerCase()}`);
      return row[fieldName.toLowerCase()];
    }
  }
  
  console.log(`FIELD DEBUG: No match found for '${debugField}'`);
  return null;
}

// Create a helper function to calculate revenue correctly using the discount if available
function calculateRevenue(row: any): number {
  const lineTotal = parseFloat(getFieldValue(row, ['Line_Total', 'line_total']) || '0');
  const unitPrice = parseFloat(getFieldValue(row, ['Unit_Price', 'unit_price']) || '0');
  const quantity = parseInt(getFieldValue(row, ['Quantity', 'quantity']) || '0');
  
  console.log(`REVENUE DEBUG: Product=${getFieldValue(row, ['Product_Name', 'product'])}, LineTotal=${lineTotal}, UnitPrice=${unitPrice}, Qty=${quantity}`);
  
  if (lineTotal > 0) {
    console.log(`REVENUE DEBUG: Using line total: ${lineTotal}`);
    return lineTotal;
  }
  
  if (unitPrice > 0 && quantity > 0) {
    const calculated = unitPrice * quantity;
    console.log(`REVENUE DEBUG: Calculated from unit price & quantity: ${calculated}`);
    return calculated;
  }
  
  console.log(`REVENUE DEBUG: Could not calculate revenue, returning 0`);
  return 0;
}

// Enhance fetchRawSheetData with better logging
async function fetchRawSheetData() {
  try {
    console.log("Fetching raw sheet data...");
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
    
    const response = await fetch('/api/chatbot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId); // Clear the timeout
    
    if (!response.ok) {
      console.error(`Failed to fetch spreadsheet data: ${response.status}`);
      throw new Error(`Failed to fetch spreadsheet data: ${response.status}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      console.error(`API returned error: ${result.error || 'Unknown error'}`);
      throw new Error(result.error || 'Failed to fetch data');
    }
    
    // Log detailed information about the data we received
    const data = result.data || [];
    console.log(`Received ${data.length} rows of data`);
    
    // Validate the data structure
    if (data.length > 0) {
      // Log the column names from the first row to verify structure
      console.log("Column names in data:", Object.keys(data[0]));
      
      // Log the first row as a sample
      console.log("Sample data row:", data[0]);
      
      // Check for essential fields with more logging
      const hasProduct = data.some((row: any) => row.Product || row.product);
      const hasDate = data.some((row: any) => row.Date || row.date);
      const hasPrice = data.some((row: any) => row.Price || row.price);
      const hasQuantity = data.some((row: any) => row.Quantity || row.quantity);
      
      console.log("Field presence check:", {
        hasProduct,
        hasDate,
        hasPrice,
        hasQuantity
      });
      
      if (!hasProduct || !hasDate || !hasPrice || !hasQuantity) {
        console.warn("Missing essential fields in the data");
      }
    } else {
      console.warn("Received empty data array from API");
    }
    
    // Add this inside fetchRawSheetData after receiving data
    if (data.length > 0) {
      console.log("DATA FORMAT DEBUG: First row column names:", Object.keys(data[0]));
      console.log("DATA FORMAT DEBUG: Sample row data:", JSON.stringify(data[0]));
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching sheet data directly:', error);
    throw error;
  }
}

// Complete the handleSeasonalComparison function that was left incomplete
async function handleSeasonalComparison(question: string): Promise<string> {
  try {
    console.log("Starting seasonal comparison analysis");
    
    // Directly fetch the raw data from the Google Sheet
    const rawData = await fetchRawSheetData();
    
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return "I don't have access to seasonal sales data at the moment. Please try again later.";
    }
    
    // Define seasons by month (0-indexed)
    const seasons = {
      spring: [2, 3, 4],  // March, April, May
      summer: [5, 6, 7],  // June, July, August
      fall: [8, 9, 10],   // September, October, November
      winter: [11, 0, 1]  // December, January, February
    };
    
    // Fix TypeScript errors by properly typing the objects
    type SeasonType = 'spring' | 'summer' | 'fall' | 'winter';
    
    // Initialize data structures for tracking product performance by season
    const productSalesBySeason: Record<SeasonType, Record<string, number>> = {
      spring: {},
      summer: {},
      fall: {},
      winter: {}
    };
    
    // Keep track of products that appear in multiple seasons
    const productsInSeasons: Record<string, Set<string>> = {};
    
    // Process each transaction
    let parsedDateCount = 0;
    let invalidDateCount = 0;
    
    rawData.forEach(row => {
      // Extract necessary fields
      const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
      const dateStr = getFieldValue(row, ['Purchase_Date', 'purchase_date', 'Date', 'date']);
      
      if (!product || !dateStr) return;
      
      // Parse the date using our enhanced function
      const date = parseSpreadsheetDate(dateStr);
      
      if (!date) {
        invalidDateCount++;
        return;
      }
      
      parsedDateCount++;
      
      // Get the month (0-indexed)
      const month = date.getMonth();
      
      // Determine which season this transaction belongs to
      let transactionSeason: SeasonType | null = null;
      for (const [season, months] of Object.entries(seasons)) {
        if (months.includes(month)) {
          transactionSeason = season as SeasonType;
          break;
        }
      }
      
      if (!transactionSeason) return; // Shouldn't happen, but just in case
      
      // Calculate revenue
      const revenue = calculateRevenue(row);
      if (revenue <= 0) return;
      
      // Add to the season's product sales
      if (!productSalesBySeason[transactionSeason][product]) {
        productSalesBySeason[transactionSeason][product] = 0;
      }
      
      productSalesBySeason[transactionSeason][product] += revenue;
      
      // Track which seasons this product appears in
      if (!productsInSeasons[product]) {
        productsInSeasons[product] = new Set();
      }
      
      productsInSeasons[product].add(transactionSeason);
    });
    
    console.log(`Successfully parsed ${parsedDateCount} dates, failed on ${invalidDateCount}`);
    
    // Build response
    // Convert each season to a sorted array of products by revenue
    const topProductsBySeason: Record<SeasonType, Array<{name: string, revenue: number}>> = {
      spring: [],
      summer: [],
      fall: [],
      winter: []
    };
    
    // Get top products for each season
    Object.entries(productSalesBySeason).forEach(([season, products]) => {
      topProductsBySeason[season as SeasonType] = Object.entries(products)
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5); // Top 5 products
    });
    
    // Build the response
    let response = "# Seasonal Product Analysis\n\n";
    
    // Add sections for summer and winter (commonly requested)
    response += "## Top Products in Summer\n\n";
    topProductsBySeason.summer.forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
    });
    
    response += "\n## Top Products in Winter\n\n";
    topProductsBySeason.winter.forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
    });
    
    // Add comparison section
    response += "\n## Season Comparison\n\n";
    
    // Find products that appear in all seasons
    const productsInAllSeasons = Object.entries(productsInSeasons)
      .filter(([_, seasons]) => seasons.size === 4)
      .map(([product]) => product);
    
    response += `**Products popular in all seasons**: ${productsInAllSeasons.join(', ')}\n\n`;
    
    // Find products unique to each season
    const seasonsArray: SeasonType[] = ['summer', 'winter', 'spring', 'fall'];
    seasonsArray.forEach(season => {
      const uniqueProducts = Object.entries(productsInSeasons)
        .filter(([_, seasons]) => seasons.size === 1 && seasons.has(season))
        .map(([product]) => product);
      
      if (uniqueProducts.length > 0) {
        const capitalizedSeason = season.charAt(0).toUpperCase() + season.slice(1);
        response += `**Unique to ${capitalizedSeason}**: ${uniqueProducts.join(', ')}\n\n`;
      }
    });
    
    return response;
  } catch (error) {
    console.error('Error in seasonal comparison query:', error);
    return `I encountered an error while analyzing seasonal product trends: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later.`;
  }
}

// Update queryProductRevenue to be more specific about overall revenue
async function queryProductRevenue(question: string): Promise<string> {
  try {
    console.log("Starting OVERALL product revenue analysis");
    
    // Add some validation to ensure this is truly about overall revenue
    const questionLower = question.toLowerCase();
    
    // Check if this query should be routed elsewhere
    if (questionLower.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}/i)) {
      console.log("WARNING: This appears to be a time-specific query that should use queryProductRevenueForTime instead");
    }
    
    if (questionLower.match(/(midtown|downtown|uptown|location|store)/i)) {
      console.log("WARNING: This appears to be a location-specific query that should use queryLocationProducts instead");
    }
    
    // Directly fetch the raw data from the Google Sheet
    const rawData = await fetchRawSheetData();
    
    console.log("Raw data received for OVERALL product revenue analysis:", 
      rawData ? `${rawData.length} rows` : "No data");
    
    // Check if we have actual data to analyze
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return "I don't have access to product revenue data at the moment. Please try again later.";
    }
    
    // Aggregate revenue by product directly from raw data
    const productRevenue: Record<string, number> = {};
    let productsProcessed = 0;
    
    rawData.forEach((row, index) => {
      // Use getFieldValue with correct column names
      const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
      
      if (!product) {
        return; // Skip rows without product info
      }
      
      // Use Line_Total directly when available
      const lineTotal = parseFloat(getFieldValue(row, ['Line_Total', 'line_total']) || '0');
      
      let revenue = 0;
      if (lineTotal > 0) {
        revenue = lineTotal;
      } else {
        // Calculate from Unit_Price and Quantity if Line_Total not available
        const price = parseFloat(getFieldValue(row, ['Unit_Price', 'unit_price']) || '0');
        const quantity = parseInt(getFieldValue(row, ['Quantity', 'quantity']) || '0');
        
        if (isNaN(price) || isNaN(quantity) || price <= 0 || quantity <= 0) {
          return; // Skip invalid price/quantity
        }
        
        revenue = price * quantity;
      }
      
      // Initialize or update product revenue
      if (!productRevenue[product]) {
        productRevenue[product] = 0;
      }
      
      productRevenue[product] += revenue;
      productsProcessed++;
    });
    
    console.log(`Processed ${productsProcessed} valid product rows for OVERALL revenue`);
    
    // Convert to array for sorting
    const productArray = Object.entries(productRevenue)
      .map(([name, revenue]) => ({ name, revenue: revenue as number }))
      .filter(p => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    
    console.log(`Sorted ${productArray.length} products by OVERALL revenue`);
    
    // Build the response
    let outputText = "# Overall Product Revenue Analysis\n\n";
    
    // Check if we found any products
    if (productArray.length === 0) {
      return "I couldn't find any product revenue data in our database.";
    }
    
    // Get the top products by revenue
    const topProducts = productArray.slice(0, 5);
    outputText += "## Top Products by Revenue\n\n";
    
    topProducts.forEach((product, index) => {
      outputText += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
    });
    
    // Calculate total revenue and percentage for context
    const totalRevenue = productArray.reduce((sum, p) => sum + p.revenue, 0);
    
    outputText += "\n## Revenue Insights\n\n";
    
    // Add percentage of total revenue for top products
    topProducts.forEach(product => {
      const percentage = (product.revenue / totalRevenue) * 100;
      outputText += `- **${product.name}** accounts for ${percentage.toFixed(1)}% of total revenue.\n`;
    });
    
    // Add insight about the top performer
    if (topProducts.length > 0) {
      outputText += `\nThe product that contributes the most to overall revenue is **${topProducts[0].name}** with $${
        topProducts[0].revenue.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })
      }.`;
    }
    
    return outputText;
  } catch (error) {
    console.error('Error in direct product revenue query:', error);
    return `I encountered an error while retrieving product revenue data: ${error instanceof Error ? error.message : 'Unknown error'}. Please try asking a different question.`;
  }
}

// Enhance date parsing to correctly handle spreadsheet date format '2024-01-01 3:46:19'
function parseSpreadsheetDate(dateStr: string): Date | null {
  try {
    // Handle the spreadsheet date format 'YYYY-MM-DD HH:MM:SS'
    // First try direct parsing
    const date = new Date(dateStr);
    
    // Check if parsing was successful
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // If direct parsing failed, try manual parsing
    // Match format: 2024-01-01 3:46:19
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    
    if (match) {
      const [_, year, month, day, hour, minute, second] = match;
      // Note: month is 0-indexed in JavaScript Date
      return new Date(
        parseInt(year), 
        parseInt(month) - 1, 
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    
    console.error(`Failed to parse date: ${dateStr}`);
    return null;
  } catch (error) {
    console.error(`Error parsing date '${dateStr}':`, error);
    return null;
  }
}

// Update queryProductRevenueForTime to use the correct date parsing
async function queryProductRevenueForTime(question: string): Promise<string> {
  try {
    console.log("Starting time-bound product revenue analysis");
    
    // Extract month and year from the question
    const monthNames = ["january", "february", "march", "april", "may", "june", 
                        "july", "august", "september", "october", "november", "december"];
    const monthAbbr = ["jan", "feb", "mar", "apr", "may", "jun", 
                       "jul", "aug", "sep", "oct", "nov", "dec"];
                       
    const monthPattern = new RegExp(`\\b(${monthNames.join('|')}|${monthAbbr.join('|')})\\b`, 'i');
    const yearPattern = /\b(20\d{2})\b/;
    
    const monthMatch = question.toLowerCase().match(monthPattern);
    const yearMatch = question.match(yearPattern);
    
    if (!monthMatch) {
      return "I couldn't determine which month you're asking about. Please specify a month like 'January' or 'Jan'.";
    }
    
    // Extract the month index (0-11)
    let monthStr = monthMatch[1].toLowerCase();
    let monthIndex: number;
    
    // Check if it's an abbreviation or full name
    if (monthStr.length <= 3) {
      monthIndex = monthAbbr.findIndex(m => m === monthStr);
    } else {
      monthIndex = monthNames.findIndex(m => m === monthStr);
    }
    
    if (monthIndex === -1) {
      // Try partial match
      monthIndex = monthNames.findIndex(m => m.startsWith(monthStr));
    }
    
    if (monthIndex === -1) {
      return `I couldn't recognize '${monthStr}' as a valid month. Please use standard month names.`;
    }
    
    // Get the year - default to current year if not specified
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
    
    console.log(`Processing revenue data for ${monthNames[monthIndex]} ${year}`);
    
    // Check if this is a future date
    const currentDate = new Date();
    const targetDate = new Date(year, monthIndex);
    
    if (targetDate > currentDate) {
      return `I don't have data for ${monthNames[monthIndex]} ${year} as this is in the future. Would you like to see data from a past month instead?`;
    }
    
    // Fetch the raw data from the Google Sheet
    const rawData = await fetchRawSheetData();
    
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return `I don't have access to revenue data for ${monthNames[monthIndex]} ${year} at the moment.`;
    }
    
    console.log(`Filtering for month index: ${monthIndex} (${monthNames[monthIndex]})`);
    
    // Filter data for the specified month and year
    const productRevenue: Record<string, number> = {};
    
    rawData.forEach(row => {
      // Extract date from the row
      const dateStr = getFieldValue(row, ['Purchase_Date', 'purchase_date', 'Date', 'date']);
      if (!dateStr) return;
      
      // Parse the date using our enhanced function
      const date = parseSpreadsheetDate(dateStr);
      if (!date) return;
      
      // Check if this row is for the requested month and year
      if (date.getMonth() !== monthIndex || date.getFullYear() !== year) {
        return;
      }
      
      // Extract product and calculate revenue
      const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
      if (!product) return;
      
      const revenue = calculateRevenue(row);
      if (revenue <= 0) return;
      
      // Add to the product revenue
      if (!productRevenue[product]) {
        productRevenue[product] = 0;
      }
      
      productRevenue[product] += revenue;
    });
    
    // Convert to array for sorting
    const productArray = Object.entries(productRevenue)
      .map(([name, revenue]) => ({ name, revenue: revenue as number }))
      .sort((a, b) => b.revenue - a.revenue);
    
    console.log(`Found ${productArray.length} products with revenue data for ${monthNames[monthIndex]} ${year}`);
    
    // Build the response
    let response = `# Product Revenue Analysis for ${monthNames[monthIndex].charAt(0).toUpperCase() + monthNames[monthIndex].slice(1)} ${year}\n\n`;
    
    if (productArray.length === 0) {
      return `I couldn't find any product revenue data for ${monthNames[monthIndex]} ${year}.`;
    }
    
    // Get top products
    const topProducts = productArray.slice(0, 5);
    response += `## Top Products by Revenue\n\n`;
    
    topProducts.forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
    });
    
    // Calculate total revenue
    const totalRevenue = productArray.reduce((sum, p) => sum + p.revenue, 0);
    
    response += `\n## Month Summary\n\n`;
    response += `- Total revenue for ${monthNames[monthIndex]} ${year}: $${totalRevenue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}\n`;
    
    response += `- Number of products sold: ${productArray.length}\n`;
    
    // Add top performer insight
    if (topProducts.length > 0) {
      const topProduct = topProducts[0];
      const percentage = (topProduct.revenue / totalRevenue) * 100;
      
      response += `- **${topProduct.name}** was the top performer, accounting for ${percentage.toFixed(1)}% of the month's revenue.\n`;
    }
    
    return response;
  } catch (error) {
    console.error("Error in time-bound product revenue query:", error);
    return `I encountered an error analyzing product revenue by time: ${error instanceof Error ? error.message : "Unknown error"}. Please try again with a different query.`;
  }
}

// Update handleGeneralQuestion to use the raw sheet data for context
async function handleGeneralQuestion(question: string, previousMessages: Message[]): Promise<string> {
  try {
    console.log("Handling general question with raw sheet data context");
    
    // Fetch raw spreadsheet data directly from our Google Sheets API
    const rawData = await fetchRawSheetData();
    
    // Extract business context from the raw data
    let productList = "We don't have specific product data available.";
    let locationList = "We don't have specific location data available.";
    let dataInsights = "";
    let dataSchema = ""; // Add detailed schema information
    
    if (Array.isArray(rawData) && rawData.length > 0) {
      console.log(`Raw data received: ${rawData.length} rows`);
      
      // Get a sample row to understand the schema
      const sampleRow = rawData[0];
      
      // Create a detailed schema description
      dataSchema = "Our sales data includes these fields: ";
      const fieldNames = Object.keys(sampleRow);
      dataSchema += fieldNames.join(", ") + ". ";
      dataSchema += "Line_Total represents (Unit_Price - discount) * Quantity. ";
      
      // Extract unique products with better field detection
      const uniqueProducts = new Set();
      const uniqueLocations = new Set();
      let totalSales = 0;
      let totalQuantity = 0;
      let discountedOrderCount = 0;
      
      // Process each row in rawData
      rawData.forEach(row => {
        const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
        const location = getFieldValue(row, ['Store_Location', 'store_location', 'Location', 'location', 'Store', 'store']);
        const discountCode = getFieldValue(row, ['Discount_Code', 'discount_code', 'Discount', 'discount']);
        const quantity = parseInt(getFieldValue(row, ['Quantity', 'quantity']) || '0');
        const revenue = calculateRevenue(row);
        
        if (product) uniqueProducts.add(product);
        if (location) uniqueLocations.add(location);
        if (discountCode) discountedOrderCount++;
        
        if (revenue > 0 && !isNaN(quantity)) {
          totalSales += revenue;
          totalQuantity += quantity;
        }
      });
      
      // Format product list
      if (uniqueProducts.size > 0) {
        const productArray = Array.from(uniqueProducts).filter(p => !!p);
        productList = "Our business sells the following products: " + 
          productArray.join(", ") + ".";
        console.log(`Found ${uniqueProducts.size} unique products`);
      }
      
      // Format location list
      if (uniqueLocations.size > 0) {
        const locationArray = Array.from(uniqueLocations).filter(l => !!l);
        locationList = "Our business has the following locations: " + 
          locationArray.join(", ") + ".";
        console.log(`Found ${uniqueLocations.size} unique locations`);
      }
      
      // Enhance data insights with more detailed information
      if (totalSales > 0) {
        dataInsights = `Our total sales amount to $${totalSales.toLocaleString('en-US', { 
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })} across ${totalQuantity.toLocaleString()} items sold. `;
        
        if (discountedOrderCount > 0) {
          dataInsights += `${discountedOrderCount} orders included discount codes. `;
        }
      }
    }
    
    // Create a system message with detailed instructions and context
    const systemMessage = {
      role: 'system' as const,
      content: `You are assisting with a business analytics dashboard for an acai bowl and smoothie shop. 
      
      ${productList} 
      
      ${locationList}
      
      ${dataInsights}
      
      ${dataSchema}
      
      IMPORTANT DATA STRUCTURE:
      Our sales data includes Transaction_ID, Purchase_Date, Customer_ID, Store_Location, 
      Product_Name, Unit_Price, Quantity, Discount_Code, and Line_Total fields.
      
      Line_Total is calculated as (Unit_Price - any discount) * Quantity.
      
      IMPORTANT INSTRUCTIONS:
      1. ONLY reference products and locations from the data provided above.
      2. When analyzing sales, use the Line_Total which accounts for discounts.
      3. If you don't have enough data to answer a specific question, say so rather than making up information.
      4. Base all answers on the actual data provided, not assumptions about typical retail businesses.
      
      My current question is: "${question}"`
    };
    
    // Include a cleaner sample of raw data
    if (Array.isArray(rawData) && rawData.length > 0) {
      let dataContext = "\n\nHere's a sample of our recent transactions:\n";
      const sampleSize = Math.min(8, rawData.length);
      
      for (let i = 0; i < sampleSize; i++) {
        const row = rawData[i];
        const transactionId = getFieldValue(row, ['Transaction_ID', 'transaction_id']);
        const date = getFieldValue(row, ['Purchase_Date', 'purchase_date']);
        const product = getFieldValue(row, ['Product_Name', 'product_name']);
        const price = getFieldValue(row, ['Unit_Price', 'unit_price']);
        const quantity = getFieldValue(row, ['Quantity', 'quantity']);
        const location = getFieldValue(row, ['Store_Location', 'store_location']);
        const lineTotal = getFieldValue(row, ['Line_Total', 'line_total']);
        
        dataContext += `${transactionId}: ${date} | ${product} | ${location} | $${price} x ${quantity} = $${lineTotal}\n`;
      }
      
      systemMessage.content += dataContext;
    }
    
    // Add the system message to the conversation context
    const conversationWithContext = [
      systemMessage,
      ...previousMessages?.slice(-6) || []
    ];
    
    // Log what we're sending to the API
    console.log("Sending to ChatGPT API with context length:", systemMessage.content.length);
    
    // Make the API call with enhanced context and more raw data
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        conversation: conversationWithContext,
        strictFactCheck: true,
        rawData: rawData.slice(0, 30) // Send more sample rows for better context
      })
    });
    
    if (!response.ok) {
      console.error(`ChatGPT API error status: ${response.status}`);
      throw new Error(`ChatGPT API error: ${response.status}`);
    }
    
    const rawText = await response.text();
    
    try {
      const data = JSON.parse(rawText);
      return data.answer || rawText;
    } catch (error) {
      console.log("Failed to parse JSON response, returning raw text");
      return rawText;
    }
  } catch (error) {
    console.error('Error in general question handler:', error);
    return `I encountered an error processing your question: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or ask something else.`;
  }
}

// Define proper types for the patterns to avoid TypeScript errors
type PatternWithBoost = {
  required: RegExp[];
  optional?: RegExp[];
  boost?: RegExp[];
  confidence: number;
};

type PatternWithoutBoost = {
  required: RegExp[];
  optional?: RegExp[];
  confidence: number;
};

type Pattern = PatternWithBoost | PatternWithoutBoost;

// Update the categorization function with proper typing while keeping all patterns
function categorizeQuery(question: string): { type: string; confidence: number } {
  const questionLower = question.toLowerCase();
  
  // More precise detection patterns with proper typing
  const patterns: Record<string, Pattern> = {
    // Time-bound product revenue patterns
    timebound_product: {
      required: [
        /(product|item|bowl|smoothie)/i,
        /(revenue|sales|income|sell|performance|popular)/i,
        /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
      ],
      optional: [/(highest|top|best|most)/i],
      boost: [/(20\d{2})/i], // Year mention boosts confidence
      confidence: 0.92
    },
    
    // Location-specific product queries
    location_product: {
      required: [
        /(midtown|downtown|uptown|location|store)/i,
        /(product|bowl|smoothie|item)/i
      ],
      optional: [/(popular|best|top|sell|revenue|sales)/i],
      confidence: 0.93
    },
    
    // Day of week patterns
    day_of_week: {
      required: [/(day|weekday|weekend)/i],
      optional: [/(busy|busiest|highest|sales|revenue|popular)/i],
      confidence: 0.95
    },
    
    // Seasonal comparison patterns
    seasonal: {
      required: [/(season|seasonal|summer|winter|spring|fall|autumn)/i],
      optional: [/(compare|best|top|sell|popular|perform|during)/i, /(product|bowl|smoothie)/i],
      confidence: 0.94
    },
    
    // Date comparison patterns
    date_comparison: {
      required: [
        /(compare|comparison|versus|vs|difference|between)/i,
        /(sales|revenue|performance)/i
      ],
      optional: [/(20\d{2}|month|year|quarter|q[1-4])/i],
      confidence: 0.93
    },
    
    // General product revenue (should have lowest confidence/priority)
    product_revenue: {
      required: [
        /(product|bowl|smoothie)/i,
        /(revenue|sales|income|sell|performance|popular)/i,
        /(highest|top|best|most)/i
      ],
      confidence: 0.89 // Lower base confidence
    }
  };
  
  // Test each pattern set against the question
  for (const [type, pattern] of Object.entries(patterns)) {
    // Required patterns must ALL match
    const requiredMatch = pattern.required.every(regex => regex.test(questionLower));
    if (!requiredMatch) continue;
    
    // Calculate a confidence score based on matches
    let confidence = pattern.confidence;
    
    // Optional patterns boost confidence if they match
    if (pattern.optional) {
      const optionalMatches = pattern.optional.filter((regex: RegExp) => regex.test(questionLower)).length;
      const optionalBoost = optionalMatches * 0.02; // Each optional match adds 2%
      confidence += optionalBoost;
    }
    
    // Special boost patterns increase confidence further
    if ('boost' in pattern && pattern.boost && pattern.boost.some((regex: RegExp) => regex.test(questionLower))) {
      confidence += 0.03; // Boost patterns add 3%
    }
    
    // Add location-specific handling for the midtown query
    if (type === 'location_product' && 
        /midtown/i.test(questionLower) && 
        /popular|best|top/i.test(questionLower)) {
      return { type: 'location_product_midtown', confidence: 0.97 };
    }
    
    // Return early for high-confidence specialized matches
    if (confidence > 0.9) {
      return { type, confidence };
    }
  }
  
  // Check for explicit overall product revenue questions
  if (/(overall|total|all time|across all)/i.test(questionLower) && 
      /(revenue|sales)/i.test(questionLower) && 
      /(product|bowl|smoothie)/i.test(questionLower)) {
    return { type: 'product_revenue', confidence: 0.95 };
  }
  
  // Default to general with lower confidence
  return { type: 'general', confidence: 0.7 };
}

// Add the missing extractTimePeriod function
function extractTimePeriod(question: string): string | null {
  const questionLower = question.toLowerCase();
  
  // Check for common time period phrases
  if (questionLower.includes('this year')) return 'this year';
  if (questionLower.includes('last year')) return 'last year';
  if (questionLower.includes('this month')) return 'this month';
  if (questionLower.includes('last month')) return 'last month';
  if (questionLower.includes('this quarter')) return 'this quarter';
  if (questionLower.includes('last quarter')) return 'last quarter';
  
  // Try to extract specific months
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                 'july', 'august', 'september', 'october', 'november', 'december'];
  for (const month of months) {
    if (questionLower.includes(month)) {
      // Check if there's a year mentioned with the month
      const yearMatch = questionLower.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        return `${month} ${yearMatch[1]}`;
      }
      return month;
    }
  }
  
  // Check for year only
  const yearMatch = questionLower.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return yearMatch[1];
  }
  
  // No specific time period found
  return null;
}

// Update filterDataByTimePeriod to handle more date formats and be more robust
function filterDataByTimePeriod(data: any[], timePeriod: string): any[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  
  const timePeriodLower = timePeriod.toLowerCase();
  const currentDate = new Date();
  
  return data.filter(row => {
    // Get date from the row using flexible field handling
    const dateStr = getFieldValue(row, ['Purchase_Date', 'purchase_date', 'Date', 'date', 'TransactionDate']);
    if (!dateStr) return false;
    
    // Try to parse the date with multiple approaches
    let date: Date | null = null;
    
    // Try standard date parsing
    date = new Date(dateStr);
    
    // If that fails, try more specific formats
    if (isNaN(date.getTime())) {
      // Try DD/MM/YYYY format
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length === 3) {
        // Try both DD/MM/YYYY and MM/DD/YYYY
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (isNaN(date.getTime())) {
          date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
        }
      }
    }
    
    // If all parsing attempts fail, skip this row
    if (!date || isNaN(date.getTime())) return false;
    
    // Various time period filters with more flexible handling
    if (timePeriodLower === 'this year') {
      return date.getFullYear() === currentDate.getFullYear();
    }
    
    if (timePeriodLower === 'last year') {
      return date.getFullYear() === currentDate.getFullYear() - 1;
    }
    
    if (timePeriodLower === 'this month') {
      return date.getMonth() === currentDate.getMonth() && 
             date.getFullYear() === currentDate.getFullYear();
    }
    
    if (timePeriodLower === 'last month') {
      const lastMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
      const lastMonthYear = currentDate.getMonth() === 0 ? 
                           currentDate.getFullYear() - 1 : currentDate.getFullYear();
      return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    }
    
    // Check for month name in time period
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                   'july', 'august', 'september', 'october', 'november', 'december'];
    for (let i = 0; i < months.length; i++) {
      if (timePeriodLower.includes(months[i])) {
        // If month and year are specified
        if (/\b(20\d{2})\b/.test(timePeriodLower)) {
          const yearMatch = timePeriodLower.match(/\b(20\d{2})\b/);
          const year = parseInt(yearMatch![1]);
          return date.getMonth() === i && date.getFullYear() === year;
        }
        // Month only
        return date.getMonth() === i;
      }
    }
    
    // Check for year only
    const yearMatch = timePeriodLower.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      return date.getFullYear() === year;
    }
    
    // Default: include the row if no specific filtering was applied
    return true;
  });
}

// Alternative implementation using the products API for basic data
async function getBasicProductData() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) {
      throw new Error(`Failed to fetch product data: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching product data:', error);
    throw error;
  }
}

// Use underscore to indicate intentional non-use
export function Chatbot({ previousQuestion: _prevQuestion }: ChatbotProps) {
  console.log('Chatbot component rendering');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Fetch products and locations on mount
  useEffect(() => {
    async function fetchMetadata() {
      try {
        // Fetch products
        const productsResponse = await fetch('/api/products');
        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          setProducts(productsData.products || []);
        }

        // Fetch locations
        const locationsResponse = await fetch('/api/locations');
        if (locationsResponse.ok) {
          const locationsData = await locationsResponse.json();
          setLocations(locationsData.locations || []);
        }
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
      }
    }

    fetchMetadata();
  }, []);

  useEffect(() => {
    console.log('Chatbot mounted');
    async function testConnection() {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'test connection',
            conversation: [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: 'Server error' 
          }));
          throw new Error(errorData.error || `Server error (${response.status})`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error('Connection test failed:', error);
        throw error;
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    return () => console.log('Chatbot unmounted');
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // All handlers that need access to component state must be inside the component
  
  // Helper function to check if we have day of week data available
  function hasImplementedDayOfWeekAnalysis(): boolean {
    // For now, return false since we haven't implemented this yet
    return false;
  }

  // Main submit handler must be inside the component to access state
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userQuestion = input.trim();
    console.log("Processing question:", userQuestion);
    
    // First add the user message to the chat
    setMessages(prev => [...(prev || []), { role: 'user', content: userQuestion }]);
    setInput('');
    setIsLoading(true);
    
    try {
      console.log(`Starting to process user question: "${userQuestion}"`);
      const questionLower = userQuestion.toLowerCase();
      
      // SPECIFIC PATTERN MATCHING WITH EXACT PATTERNS
      
      // Explicit match for timebound product query with month/year
      const timebound_match = questionLower.match(/(?:highest|top|best|most).*(?:revenue|sales|popular).*(?:in|for|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?/i) || 
                              questionLower.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?.*(?:highest|top|best|most).*(?:revenue|sales|popular)/i);
      
      if (timebound_match) {
        console.log("EXACT MATCH: Product revenue for specific time period");
        const month = timebound_match[1];
        const year = timebound_match[2] || new Date().getFullYear().toString();
        console.log(`Detected month: ${month}, year: ${year}`);
        
        const response = await queryProductRevenueForTime(userQuestion);
        setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
        setIsLoading(false);
        return;
      }
      
      // Explicit match for midtown/location store query
      const location_match = questionLower.match(/(midtown|downtown|uptown).*(?:popular|best|top|sell|revenue|sales).*(?:products|bowls|smoothies)/i) ||
                             questionLower.match(/(?:popular|best|top|sell|revenue|sales).*(?:products|bowls|smoothies).*(?:at|in)\s+(midtown|downtown|uptown)/i);
      
      if (location_match) {
        console.log("EXACT MATCH: Location-specific product query");
        const location = location_match[1].charAt(0).toUpperCase() + location_match[1].slice(1);
        console.log(`Detected location: ${location}`);
        
        const response = await queryLocationProducts(userQuestion, location);
        setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
        setIsLoading(false);
        return;
      }
      
      // 1. Day of week analysis
      if (questionLower.includes('day of week') || 
          questionLower.includes('day of the week') ||
          (questionLower.includes('day') && questionLower.includes('highest sales')) ||
          (questionLower.includes('busiest') && questionLower.includes('day'))) {
        console.log("Detected day of week analysis question");
        const response = await analyzeDayOfWeekSales(userQuestion);
        setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
        setIsLoading(false);
        return;
      }
      
      // 2. Date comparison query
      if ((questionLower.includes('compare') || 
           questionLower.includes('difference') || 
           questionLower.includes('vs') || 
           questionLower.includes('versus') ||
           questionLower.includes('between')) && 
          (questionLower.includes('sales') || questionLower.includes('revenue'))) {
        
        // Extract month/date information
        const dateInfo = extractDateInfo(userQuestion);
        
        // If we have multiple dates or explicit comparison words, use the comparison handler
        if (dateInfo.isComparison || dateInfo.dates.length > 1) {
          console.log("Detected date comparison query");
          const response = await handleDateComparisonQuery(userQuestion);
          setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
          setIsLoading(false);
          return;
        }
      }
      
      // 3. Future date check - prevent confusion with future dates
      const { dates, hasFutureDate } = parseDateFromQuestion(userQuestion);
      if (hasFutureDate && dates.length > 0 && 
          (questionLower.includes('revenue') || questionLower.includes('sales'))) {
        console.log("Detected query about future dates:", dates);
        
        const futureDates = dates.filter(date => {
          const [month, year] = date.split(" ");
          const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 
                             'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month.toLowerCase());
          const dateObj = new Date(parseInt(year), monthIndex);
          return dateObj > new Date();
        });
        
        // Create a helpful response for future date queries
        let response = `# Future Date Analysis\n\n`;
        response += `I don't have data for ${futureDates.join(', ')} since ${futureDates.length > 1 ? "these are" : "this is"} in the future.\n\n`;
        
        // Suggest alternatives
        const currentDate = new Date();
        const currentMonth = ['january', 'february', 'march', 'april', 'may', 'june', 
                             'july', 'august', 'september', 'october', 'november', 'december'][currentDate.getMonth()];
        const lastMonth = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'][(currentDate.getMonth() + 11) % 12];
                            
        response += `Would you like to see data for:\n\n`;
        response += `- ${currentMonth} ${currentDate.getFullYear()}\n`;
        response += `- ${lastMonth} ${currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear()}\n`;
        response += `- Or a seasonal comparison across available data?\n`;
        
        setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
        setIsLoading(false);
        return;
      }
      
      // 4. Overall product revenue - make this very specific to avoid incorrect routing
      if (questionLower.match(/(?:overall|total).*(?:revenue|sales).*(?:product|bowl|smoothie)/i) || 
          (questionLower.includes('most') && 
           questionLower.includes('revenue') && 
           questionLower.includes('product') && 
           !questionLower.includes('midtown') && 
           !questionLower.includes('downtown') && 
           !questionLower.includes('uptown') && 
           !questionLower.includes('location') && 
           !questionLower.includes('store') && 
           !timebound_match)) {
        console.log("Detected overall product revenue question");
        const response = await queryProductRevenue(userQuestion);
        setMessages(prev => [...(prev || []), { role: 'assistant', content: response }]);
        setIsLoading(false);
        return;
      }
      
      // Continue with the regular categorization for other questions
      const { type: queryType, confidence } = categorizeQuery(userQuestion);
      console.log(`Query categorized as: ${queryType} with confidence ${confidence}`);
      
      // Only use specialized handlers with very high confidence
      let response;
      
      if (queryType === 'seasonal' && confidence >= 0.92) {
        console.log("Using specialized seasonal comparison handler");
        response = await handleSeasonalComparison(userQuestion);
      } 
      else if (queryType === 'timebound_product' && confidence >= 0.93) {
        console.log("Using specialized time-bound product revenue handler");
        response = await queryProductRevenueForTime(userQuestion);
      }
      else if (queryType === 'location_product_midtown' && confidence >= 0.95) {
        console.log("Using specialized midtown location product handler");
        response = await queryLocationProducts(userQuestion, 'Midtown');
      }
      else if (queryType === 'product_revenue' && confidence >= 0.94) { // Higher threshold
        console.log("Using specialized overall product revenue handler");
        response = await queryProductRevenue(userQuestion);
      } 
      else {
        // For all other types or lower confidence matches, use the general handler
        console.log("Using general query handler with data context, confidence too low for specialized handler");
        response = await handleGeneralQuestion(userQuestion, messages);
      }
      
      console.log("Received response, adding to message history");
      
      // Add the response to messages
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: response
      }]);
    } catch (error) {
      console.error("Error processing query:", error);
      // Add error message to chat
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: `I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Add the formatChatResponse function inside the component
  function formatChatResponse(content: string) {
    // This function renders markdown content in chat messages
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const inline = props.inline || false;
            
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Add styling for other markdown elements
          p: ({ children }) => <p className="mb-2">{children}</p>,
          h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-md font-bold mb-2 mt-3">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col h-[650px]">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Analytics Assistant
        </h2>
        
        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">Try asking high-value questions:</span>
          </p>
          <ul className="mt-2 space-y-1 text-sm text-blue-700 dark:text-blue-300">
            <li>• 🏆 "Which location had the highest revenue for {products[0]?.name || '[product]'} in December 2024?"</li>
            <li>• 📊 "Show me the top 3 performing products in November 2024"</li>
            <li>• 💡 "What factors are impacting {products[0]?.name || '[product]'} performance and how can we improve it?"</li>
          </ul>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 dark:bg-gray-900/50">
        {messages.map((message, index) => (
          <div 
            key={index}
            className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'} mb-4`}
          >
            <div 
              className={`${
                message.role === 'assistant' 
                  ? 'bg-gray-100 dark:bg-gray-700 mr-12' 
                  : 'bg-blue-500 text-white ml-12'
              } rounded-lg px-4 py-3 max-w-3xl`}
            >
              {formatChatResponse(message.content)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-700 rounded-lg p-4 shadow-sm animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isLoading || !input.trim()}
          >
            Send {isLoading ? "..." : "→"}
          </button>
        </div>
      </form>
    </div>
  );
}

// 1. Add an improved date detection and validation function
function parseDateFromQuestion(question: string): { dates: string[], hasFutureDate: boolean } {
  const questionLower = question.toLowerCase();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  // Extract all potential months and years
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthPattern = new RegExp(`\\b(${months.join('|')}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b`, 'gi');
  const yearPattern = /\b(20\d{2})\b/g;
  
  // Extract all mentioned months and years
  const mentionedMonths: string[] = [];
  const mentionedYears: number[] = [];
  
  let monthMatch;
  while ((monthMatch = monthPattern.exec(questionLower)) !== null) {
    mentionedMonths.push(monthMatch[0]);
  }
  
  let yearMatch;
  while ((yearMatch = yearPattern.exec(questionLower)) !== null) {
    mentionedYears.push(parseInt(yearMatch[0]));
  }
  
  // Build date strings and check for future dates
  const dates: string[] = [];
  let hasFutureDate = false;
  
  // If no years mentioned, assume current year
  if (mentionedYears.length === 0 && mentionedMonths.length > 0) {
    mentionedYears.push(currentYear);
  }
  
  // Create date combinations
  mentionedMonths.forEach(month => {
    let standardMonth = month.substring(0, 3).toLowerCase();
    let monthIndex = months.findIndex(m => m.startsWith(standardMonth));
    
    mentionedYears.forEach(year => {
      dates.push(`${months[monthIndex]} ${year}`);
      
      // Check if this is a future date
      if (year > currentYear || (year === currentYear && monthIndex > currentMonth)) {
        hasFutureDate = true;
      }
    });
  });
  
  // If no specific dates found but years mentioned, use those
  if (dates.length === 0 && mentionedYears.length > 0) {
    mentionedYears.forEach(year => {
      dates.push(year.toString());
      if (year > currentYear) {
        hasFutureDate = true;
      }
    });
  }
  
  return { dates, hasFutureDate };
}

// 2. Add improved handling for date comparison queries
function handleDateComparisonQuery(question: string): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      console.log("Handling date comparison query:", question);
      
      // Parse dates from the question
      const { dates, hasFutureDate } = parseDateFromQuestion(question);
      console.log("Parsed dates:", dates, "Future dates:", hasFutureDate);
      
      // If we don't have at least two dates, we can't do a comparison
      if (dates.length < 2) {
        resolve("I need two specific time periods to compare. Could you please specify which months or time periods you'd like to compare?");
        return;
      }
      
      // If any future dates, acknowledge this in the response
      if (hasFutureDate) {
        const pastDates = dates.filter(date => {
          const [month, year] = date.split(" ");
          const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 
                             'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month.toLowerCase());
          const dateObj = new Date(parseInt(year), monthIndex);
          return dateObj <= new Date();
        });
        
        if (pastDates.length === 0) {
          resolve(`I can't compare ${dates.join(" and ")} because they're in the future. Would you like to compare data from previous months instead?`);
          return;
        }
        
        const futureDates = dates.filter(d => !pastDates.includes(d));
        
        // If we have at least one past date, analyze that one
        const rawData = await fetchRawSheetData();
        const revenueData = await processRevenueDataForDate(rawData, pastDates[0]);
        
        let response = `# Sales Comparison Analysis\n\n`;
        response += `I can provide data for ${pastDates[0]}, but ${futureDates.join(" and ")} ${futureDates.length > 1 ? "are" : "is"} in the future, so I don't have that data yet.\n\n`;
        
        response += `## Top Products for ${pastDates[0]}\n\n`;
        if (revenueData.length > 0) {
          revenueData.slice(0, 5).forEach((product, index) => {
            response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}\n`;
          });
          
          const totalRevenue = revenueData.reduce((sum, p) => sum + p.revenue, 0);
          response += `\nTotal revenue for ${pastDates[0]}: $${totalRevenue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}\n`;
        } else {
          response += `No data available for ${pastDates[0]}.\n`;
        }
        
        resolve(response);
        return;
      }
      
      // Process both dates if neither is in the future
      const date1 = dates[0];
      const date2 = dates[1];
      
      console.log(`Processing comparison between ${date1} and ${date2}`);
      
      const rawData = await fetchRawSheetData();
      const revenue1 = await processRevenueDataForDate(rawData, date1);
      const revenue2 = await processRevenueDataForDate(rawData, date2);
      
      // Build the comparison response
      let response = `# Sales Comparison: ${date1} vs ${date2}\n\n`;
      
      // Calculate total revenue for each period
      const totalRevenue1 = revenue1.reduce((sum, p) => sum + p.revenue, 0);
      const totalRevenue2 = revenue2.reduce((sum, p) => sum + p.revenue, 0);
      
      // Overall comparison
      const difference = totalRevenue2 - totalRevenue1;
      const percentChange = ((difference / totalRevenue1) * 100).toFixed(1);
      const changeDescription = difference >= 0 ? "increased" : "decreased";
      
      response += `## Overall Revenue Comparison\n\n`;
      response += `- ${date1}: $${totalRevenue1.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
      response += `- ${date2}: $${totalRevenue2.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n`;
      
      response += `Total revenue ${changeDescription} by ${Math.abs(difference).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} (${percentChange}%) from ${date1} to ${date2}.\n\n`;
      
      // Product-specific comparisons
      response += `## Top Products Comparison\n\n`;
      
      // Combine all products from both periods
      const allProducts = new Set([...revenue1.map(p => p.name), ...revenue2.map(p => p.name)]);
      
      // Create comparison table for top products
      response += `| Product | ${date1} | ${date2} | Change |\n`;
      response += `|---------|---------|---------|--------|\n`;
      
      const productComparisons: ProductComparison[] = [];
      
      allProducts.forEach(product => {
        const prod1 = revenue1.find(p => p.name === product);
        const prod2 = revenue2.find(p => p.name === product);
        
        if (prod1 || prod2) {
          const rev1 = prod1 ? prod1.revenue : 0;
          const rev2 = prod2 ? prod2.revenue : 0;
          const prodDiff = rev2 - rev1;
          const prodPercent = rev1 === 0 ? "N/A" : ((prodDiff / rev1) * 100).toFixed(1) + "%";
          
          productComparisons.push({
            name: product,
            revenue1: rev1,
            revenue2: rev2,
            difference: prodDiff,
            percentChange: parseFloat(prodPercent)
          });
        }
      });
      
      // Sort by absolute difference to show biggest changes first
      productComparisons
        .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
        .slice(0, 8)  // Show only top changes
        .forEach(comp => {
          response += `| ${comp.name} | $${comp.revenue1.toLocaleString('en-US', {minimumFractionDigits: 2})} | $${comp.revenue2.toLocaleString('en-US', {minimumFractionDigits: 2})} | ${comp.difference >= 0 ? "+" : ""}$${comp.difference.toLocaleString('en-US', {minimumFractionDigits: 2})} (${comp.percentChange}) |\n`;
        });
      
      resolve(response);
    } catch (error) {
      console.error("Error in date comparison handler:", error);
      resolve(`I encountered an error while comparing sales periods: ${error instanceof Error ? error.message : "Unknown error"}. Please try a different question.`);
    }
  });
}

// Helper function to process revenue data for a specific date
async function processRevenueDataForDate(rawData: any[], dateStr: string): Promise<any[]> {
  try {
    console.log(`Processing revenue data for ${dateStr}`);
    
    // Parse date components
    const [month, year] = dateStr.toLowerCase().split(" ");
    
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                   'july', 'august', 'september', 'october', 'november', 'december'];
    
    const monthIndex = months.indexOf(month);
    const yearNum = parseInt(year);
    
    console.log(`Filtering for month index: ${monthIndex} (${month})`);
    
    // Filter data by the specified month and year
    const filteredData = rawData.filter(row => {
      // Get date from the row
      const dateStr = getFieldValue(row, ['Purchase_Date', 'purchase_date', 'Date', 'date']);
      if (!dateStr) return false;
      
      // Parse the date
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return false;
      
      // Match the month and year
      return date.getMonth() === monthIndex && date.getFullYear() === yearNum;
    });
    
    console.log(`Found ${filteredData.length} rows for ${month} ${year}`);
    
    // Process revenue data
    const productRevenue: Record<string, number> = {};
    
    filteredData.forEach(row => {
      const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
      if (!product) return;
      
      const revenue = calculateRevenue(row);
      if (revenue <= 0) return;
      
      if (!productRevenue[product]) {
        productRevenue[product] = 0;
      }
      
      productRevenue[product] += revenue;
    });
    
    // Convert to array and sort
    const result = Object.entries(productRevenue)
      .map(([name, revenue]) => ({ name, revenue: revenue as number }))
      .filter(p => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    
    console.log(`Found ${result.length} products with revenue data for ${month} ${year}`);
    
    return result;
  } catch (error) {
    console.error(`Error processing revenue for ${dateStr}:`, error);
    return [];
  }
}

// 3. Add a day of week analysis function
async function analyzeDayOfWeekSales(question: string): Promise<string> {
  try {
    console.log("Analyzing day of week sales patterns");
    
    // Fetch the raw data
    const rawData = await fetchRawSheetData();
    
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return "I don't have access to daily sales data at the moment. Please try again later.";
    }
    
    // Initialize data structures for day of week analysis
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const salesByDay = Array(7).fill(0);
    const transactionsByDay = Array(7).fill(0);
    const averageTransactionByDay = Array(7).fill(0);
    
    // Process each transaction
    let totalParsedDates = 0;
    let failedDateParses = 0;
    
    rawData.forEach(row => {
      // Extract date from the row
      const dateStr = getFieldValue(row, ['Purchase_Date', 'purchase_date', 'Date', 'date']);
      if (!dateStr) return;
      
      // Parse the date using our enhanced function
      const date = parseSpreadsheetDate(dateStr);
      
      if (!date) {
        failedDateParses++;
        return;
      }
      
      totalParsedDates++;
      
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Calculate transaction revenue
      const revenue = calculateRevenue(row);
      if (revenue <= 0) return;
      
      // Update the counters
      salesByDay[dayOfWeek] += revenue;
      transactionsByDay[dayOfWeek]++;
    });
    
    console.log(`Successfully parsed ${totalParsedDates} dates, failed to parse ${failedDateParses} dates`);
    
    // Calculate average transaction value
    for (let i = 0; i < 7; i++) {
      if (transactionsByDay[i] > 0) {
        averageTransactionByDay[i] = salesByDay[i] / transactionsByDay[i];
      }
    }
    
    // Find the highest sales day
    const maxSalesIndex = salesByDay.indexOf(Math.max(...salesByDay));
    const maxTransactionsIndex = transactionsByDay.indexOf(Math.max(...transactionsByDay));
    
    // Format the response
    let response = "# Day of Week Sales Analysis\n\n";
    
    response += `## Sales by Day of Week\n\n`;
    
    // Create a table of results
    response += `| Day | Total Sales | Transactions | Avg. Transaction |\n`;
    response += `|-----|-------------|--------------|------------------|\n`;
    
    for (let i = 0; i < 7; i++) {
      response += `| ${daysOfWeek[i]} | $${salesByDay[i].toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} | ${transactionsByDay[i]} | $${averageTransactionByDay[i].toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} |\n`;
    }
    
    response += `\n## Key Insights\n\n`;
    
    response += `- **${daysOfWeek[maxSalesIndex]}** generates the highest total revenue at $${salesByDay[maxSalesIndex].toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}\n`;
    
    response += `- **${daysOfWeek[maxTransactionsIndex]}** has the most transactions with ${transactionsByDay[maxTransactionsIndex]} orders\n`;
    
    // Find day with highest average transaction
    const maxAvgIndex = averageTransactionByDay.indexOf(Math.max(...averageTransactionByDay));
    response += `- **${daysOfWeek[maxAvgIndex]}** has the highest average transaction value at $${averageTransactionByDay[maxAvgIndex].toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}\n`;
    
    return response;
  } catch (error) {
    console.error("Error in day of week analysis:", error);
    return `I encountered an error analyzing sales by day of week: ${error instanceof Error ? error.message : "Unknown error"}. Please try again later.`;
  }
}

// Add this new handler for location-specific product queries
async function queryLocationProducts(question: string, location: string): Promise<string> {
  try {
    console.log(`Analyzing product performance at ${location} location`);
    
    // Fetch the raw data
    const rawData = await fetchRawSheetData();
    
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return `I don't have access to sales data for ${location} at the moment.`;
    }
    
    // Filter data for the specified location
    const locationRegex = new RegExp(location, 'i');
    const locationData = rawData.filter(row => {
      const storeLocation = getFieldValue(row, ['Store_Location', 'store_location', 'Location', 'location']);
      return storeLocation && locationRegex.test(storeLocation);
    });
    
    console.log(`Found ${locationData.length} transactions for ${location}`);
    
    if (locationData.length === 0) {
      return `I couldn't find any sales data for ${location} in our records.`;
    }
    
    // Process product sales at this location
    const productRevenue: Record<string, number> = {};
    const productQuantity: Record<string, number> = {};
    
    locationData.forEach(row => {
      const product = getFieldValue(row, ['Product_Name', 'product_name', 'Product', 'product']);
      if (!product) return;
      
      const revenue = calculateRevenue(row);
      const quantity = parseInt(getFieldValue(row, ['Quantity', 'quantity']) || '0');
      
      if (revenue <= 0 || quantity <= 0) return;
      
      // Track revenue
      if (!productRevenue[product]) {
        productRevenue[product] = 0;
        productQuantity[product] = 0;
      }
      
      productRevenue[product] += revenue;
      productQuantity[product] += quantity;
    });
    
    // Convert to arrays for sorting
    const revenueArray = Object.entries(productRevenue)
      .map(([name, revenue]) => ({ name, revenue: revenue as number }))
      .sort((a, b) => b.revenue - a.revenue);
      
    const quantityArray = Object.entries(productQuantity)
      .map(([name, quantity]) => ({ name, quantity: quantity as number }))
      .sort((a, b) => b.quantity - a.quantity);
    
    // Prepare response
    let response = `# ${location} Store Product Analysis\n\n`;
    
    // Top products by revenue
    response += `## Top Products by Revenue at ${location}\n\n`;
    
    revenueArray.slice(0, 5).forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n`;
    });
    
    // Top products by quantity
    response += `\n## Most Popular Products by Quantity at ${location}\n\n`;
    
    quantityArray.slice(0, 5).forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: ${product.quantity.toLocaleString()} units sold\n`;
    });
    
    // Add insights
    response += `\n## ${location} Store Insights\n\n`;
    
    // Calculate total revenue and items sold
    const totalRevenue = revenueArray.reduce((sum, p) => sum + p.revenue, 0);
    const totalItems = quantityArray.reduce((sum, p) => sum + p.quantity, 0);
    
    response += `- Total revenue: $${totalRevenue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}\n`;
    response += `- Total items sold: ${totalItems.toLocaleString()}\n`;
    
    // Add most popular item insight
    if (quantityArray.length > 0) {
      response += `- The most popular product by quantity is **${quantityArray[0].name}** with ${quantityArray[0].quantity.toLocaleString()} units sold.\n`;
    }
    
    // Add highest revenue item insight
    if (revenueArray.length > 0) {
      response += `- The highest revenue product is **${revenueArray[0].name}** generating $${revenueArray[0].revenue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}.\n`;
    }
    
    return response;
  } catch (error) {
    console.error(`Error analyzing ${location} product sales:`, error);
    return `I encountered an error analyzing product sales at ${location}: ${error instanceof Error ? error.message : "Unknown error"}. Please try again later.`;
  }
}

// Define the ProductComparison interface that was missing
interface ProductComparison {
  name: string;
  revenue1: number;
  revenue2: number;
  difference: number;
  percentChange: number;
}
