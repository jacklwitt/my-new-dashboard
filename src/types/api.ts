// Common API types
export type ApiError = {
  name?: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

export type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  question: string;
  conversation?: ChatMessage[];
};

export type ChatResponse = ApiResponse<{
  answer: string;
}>; 