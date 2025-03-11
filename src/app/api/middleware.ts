import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Store timestamps of recent requests
const apiCalls = new Map<string, number[]>();
const RATE_LIMIT = 10; // calls
const RATE_WINDOW = 1000 * 60 * 60; // 1 hour

export function middleware(request: NextRequest) {
  // Only apply to OpenAI API routes
  if (request.nextUrl.pathname.startsWith('/api/advice') || 
      request.nextUrl.pathname.startsWith('/api/chat')) {
    
    const ip = request.ip || 'anonymous';
    const now = Date.now();
    
    // Get recent calls and filter out old ones
    const recentCalls = (apiCalls.get(ip) || [])
      .filter(timestamp => now - timestamp < RATE_WINDOW);
    
    // Check if rate limit exceeded
    if (recentCalls.length >= RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    // Add current call
    recentCalls.push(now);
    apiCalls.set(ip, recentCalls);
  }
  
  return NextResponse.next();
} 