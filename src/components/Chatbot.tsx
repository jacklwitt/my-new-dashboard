"use client";
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Add type for props
type ChatbotProps = {
  previousQuestion?: string;
};

// Module load logging
console.log('Chatbot module initializing');
console.log('Import check:', { useState, useEffect });

function isCalculationQuery(question: string, previousQuestion?: string): boolean {
  console.log('Checking if calculation query:', { question, previousQuestion });
  const calculationKeywords = [
    'total sales',
    'revenue',
    'sales for',
    'how much',
    'how many',
    'what were',
    'what was'
  ];
  
  const complexQuestions = [
    'how can i',
    'how do i',
    'how should',
    'why',
    'explain',
    'analyze',
    'compare',
    'suggest',
    'recommend'
  ];
  
  const questionLower = question.toLowerCase();

  // Handle follow-up questions
  if (questionLower.includes('individually') || 
      questionLower.includes('each') || 
      questionLower.includes('break') || 
      questionLower.includes('separately')) {
    console.log('isCalculationQuery result:', true);
    return true;
  }
  
  const result = calculationKeywords.some(keyword => questionLower.includes(keyword)) &&
         !complexQuestions.some(phrase => questionLower.includes(phrase));
  console.log('isCalculationQuery result:', result);
  return result;
}

// Use underscore to indicate intentional non-use
export function Chatbot({ previousQuestion: _prevQuestion }: ChatbotProps) {
  console.log('Chatbot component rendering');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Chatbot mounted');
    async function testConnection() {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'test connection',
            conversation: [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: 'Server error' 
          }));
          throw new Error(errorData.error || `Server error (${response.status})`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error('Connection test failed:', error);
        throw error;
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    return () => console.log('Chatbot unmounted');
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log('Submit handler called with input:', input);
    
    if (!input.trim()) return;

    const userMessage: Message = { 
      role: 'user', 
      content: input 
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const previousQuestion = messages.length > 0 ? messages[messages.length - 1].content : undefined;
      const endpoint = isCalculationQuery(input, previousQuestion) ? '/api/calculations' : '/api/chat';
      console.log('Selected endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: input,
          conversation: messages
        }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = { 
        role: 'assistant', 
        content: data.answer 
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error in submit handler:', error);
      const errorMessage: Message = { 
        role: 'assistant', 
        content: error instanceof Error ? error.message : 'Sorry, there was an error processing your request.' 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[700px] border border-gray-200 rounded-xl shadow-lg bg-white dark:bg-gray-800">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Analytics Assistant
        </h2>
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
          <p className="text-gray-700 dark:text-gray-300 space-y-2">
            <span className="block font-semibold">💡 Try asking:</span>
            <span className="block ml-4">• "What were total sales for [product] in November 2024?"</span>
            <span className="block ml-4">• "Show sales for [product] in Nov and Dec 2024 individually"</span>
            <span className="block ml-4">• "How can I improve sales for [product] based on previous data?"</span>
            <span className="block ml-4">• "Compare revenue between months"</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 shadow-sm ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-700 rounded-lg p-4 shadow-sm animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm hover:shadow flex items-center gap-2"
          >
            <span>Send</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
