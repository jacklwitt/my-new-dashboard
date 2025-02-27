export function validateEnv() {
  console.log('Environment check:', {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID,
    GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY?.length,
    SPREADSHEET_ID: !!process.env.SPREADSHEET_ID,
  });

  const requiredEnvs = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    SPREADSHEET_ID: process.env.SPREADSHEET_ID
  };

  // Validate all required environment variables are present
  for (const [key, value] of Object.entries(requiredEnvs)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Validate email format
  if (!requiredEnvs.GOOGLE_CLIENT_EMAIL?.includes('@')) {
    throw new Error('GOOGLE_CLIENT_EMAIL is not a valid email address');
  }

  // Clean up private key - handle both escaped and unescaped versions
  const privateKey = process.env.GOOGLE_PRIVATE_KEY!
    .replace(/\\n/g, '\n')
    .replace(/"([^"]*)"/, '$1');

  return {
    ...requiredEnvs,
    GOOGLE_PRIVATE_KEY: privateKey
  };
} 