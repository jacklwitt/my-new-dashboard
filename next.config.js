/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...existing config
  
  // This is forwarded to Vercel when deployed
  experimental: {
    serverExternalPackages: ['canvas', 'jsdom', 'openai'],
  }
};

module.exports = nextConfig; 