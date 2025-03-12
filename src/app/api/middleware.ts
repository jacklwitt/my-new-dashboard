import { NextRequest, NextResponse } from 'next/server';

// Store recent API calls to implement rate limiting
const recentApiCalls: Map<string, number[]> = new Map();

// Configuration
const MAX_CALLS_PER_MINUTE = 10;

export function rateLimit(request: NextRequest) {
  // Only apply rate limiting to API routes that are expensive
  if (request.nextUrl.pathname.startsWith('/api/advice') || 
      request.nextUrl.pathname.startsWith('/api/chat')) {
    
    // Get client IP using headers - Next.js 15 compatible approach
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'anonymous';
    const now = Date.now();
    
    // Get recent calls and filter out old ones
    const recentCalls = (recentApiCalls.get(ip) || [])
      .filter(timestamp => now - timestamp < 60000); // Keep calls from last minute
    
    // Add current call
    recentCalls.push(now);
    recentApiCalls.set(ip, recentCalls);
    
    // Check if rate limit exceeded
    if (recentCalls.length > MAX_CALLS_PER_MINUTE) {
      console.log(`Rate limit exceeded for ${ip}: ${recentCalls.length} calls in the last minute`);
      return NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 }
      );
    }
  }
  
  // Continue with the request
  return NextResponse.next();
} 