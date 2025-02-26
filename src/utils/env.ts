export function validateEnv() {
  const required = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    SPREADSHEET_ID: process.env.SPREADSHEET_ID
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate email format
  if (!required.GOOGLE_CLIENT_EMAIL?.includes('@')) {
    throw new Error('GOOGLE_CLIENT_EMAIL is not a valid email address');
  }

  // Validate private key format
  if (!required.GOOGLE_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY')) {
    throw new Error('GOOGLE_PRIVATE_KEY is not in the correct format');
  }

  return required as Record<keyof typeof required, string>;
} 