import { NextResponse } from 'next/server';

export async function GET() {
  // Log the Node.js version
  console.log("Node.js version:", process.version);
  
  return NextResponse.json({
    success: true,
    nodeVersion: process.version,
  });
}