/**
 * Sanitize input to prevent injection and encoding issues
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/"/g, '\\"');   // Escape quotes
}

/**
 * Validates chat input
 */
export function validateChatInput(question: string): void {
  if (!question || typeof question !== 'string') {
    throw new Error('Invalid question format');
  }
  
  const sanitizedQuestion = sanitizeInput(question);
  if (!sanitizedQuestion) {
    throw new Error('Question is empty after sanitization');
  }
} 