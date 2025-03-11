/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...existing config
  
  // This is forwarded to Vercel when deployed
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core'],
    serverFunctionTimeouts: {
      '*': 60 // seconds
    }
  }
};

module.exports = nextConfig; 