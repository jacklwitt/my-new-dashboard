/**
 * Removes markdown formatting markers from text
 * @param text The text to process
 * @returns Text with markdown formatting markers removed
 */
export function stripMarkdownFormatting(text: string): string {
  if (!text) return '';
  
  // Remove heading markers (###)
  text = text.replace(/^###\s*/gm, '');
  
  // Remove bold/italic markers (***)
  text = text.replace(/\*\*\*/g, '');
  
  // Remove bold markers (**)
  text = text.replace(/\*\*/g, '');
  
  // Remove italic markers (*)
  text = text.replace(/\*/g, '');
  
  // Remove any excess newlines that might have been created
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text;
} 