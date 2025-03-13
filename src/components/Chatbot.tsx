"use client";
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, github } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Fix the message type error
interface Message {
  role: 'user' | 'assistant' | 'system';  // Use literal types
  content: string;
}

// Add type for props
type ChatbotProps = {
  previousQuestion?: string;
};

// Add types for products and locations
type Product = {
  id: string;
  name: string;
  category: string;
};

type Location = {
  id: string;
  name: string;
  region: string;
};

// Module load logging
console.log('Chatbot module initializing');
console.log('Import check:', { useState, useEffect });

const isCalculationQuery = (query: string): boolean => {
  const calculationKeywords = [
    'sales', 'revenue', 'compare', 'show', 'calculate', 'total', 
    'average', 'growth', 'decline', 'by month', 'between', 'location', 
    'product', 'percentage'
  ];
  
  // Check if the query contains calculation-related keywords
  const containsKeywords = calculationKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Check for specific patterns that indicate data requests
  const isDataRequest = /show|display|what (were|was)|how much|compare/.test(query.toLowerCase());
  
  return containsKeywords && isDataRequest;
};

// Enhance the extraction of date information to handle years - using compatible approach
const extractDateInfo = (query: string) => {
  // Check for month and year patterns (e.g., "November 2024" or "Nov 2024")
  const monthYearPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i;
  const comparisonPattern = /\b(vs|versus|compared to|against)\b/i;
  
  // Extract month-year using individual matches instead of matchAll
  const dates = [];
  let match;
  const regex = new RegExp(monthYearPattern, 'gi');
  
  // Use exec in a loop instead of matchAll and spread
  while ((match = regex.exec(query)) !== null) {
    dates.push({
      month: match[1],
      year: match[2]
    });
  }
  
  // Check if this is a comparison query
  const isComparison = comparisonPattern.test(query) || dates.length > 1;
  
  return {
    dates,
    isComparison,
    hasYearSpecified: dates.length > 0
  };
};

// Use underscore to indicate intentional non-use
export function Chatbot({ previousQuestion: _prevQuestion }: ChatbotProps) {
  console.log('Chatbot component rendering');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Fetch products and locations on mount
  useEffect(() => {
    async function fetchMetadata() {
      try {
        // Fetch products
        const productsResponse = await fetch('/api/products');
        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          setProducts(productsData.products || []);
        }

        // Fetch locations
        const locationsResponse = await fetch('/api/locations');
        if (locationsResponse.ok) {
          const locationsData = await locationsResponse.json();
          setLocations(locationsData.locations || []);
        }
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
      }
    }

    fetchMetadata();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userQuestion = input.trim();
    console.log("Processing question:", userQuestion);
    
    // Add user message to the chat
    setMessages(prev => [...(prev || []), { role: 'user', content: userQuestion }]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Make the API request
      console.log("Sending API request with question:", userQuestion);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          conversation: messages?.slice(-6) || []
        })
      });
      
      // Enhanced response debugging
      const rawText = await response.text();
      console.log("Raw API response:", rawText);
      console.log("Response length:", rawText.length);
      
      let answerContent = "";
      try {
        // Try to parse as JSON
        const data = JSON.parse(rawText);
        console.log("Parsed response data:", data);
        
        // Simple, direct access to the answer string
        if (typeof data.answer === 'string' && data.answer.trim().length > 0) {
          answerContent = data.answer;
        } else {
          // Use explicit stringification for any non-string answers
          answerContent = JSON.stringify(data.answer, null, 2);
        }
      } catch (error) {
        console.error("Error parsing response:", error);
        answerContent = rawText || "No response received";
      }
      
      // Always add a message, even if we couldn't parse the response
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: answerContent || "No interpretable response received."
      }]);
      
    } catch (error) {
      console.error("Chat request error:", error);
      
      // Add an error message to the chat
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Add a helper function to extract product focus
  function extractProductFocus(query: string, products: Product[]): string | null {
    // Check if any product name appears in the query
    for (const product of products) {
      if (query.toLowerCase().includes(product.name.toLowerCase())) {
        return product.name;
      }
    }
    return null;
  }

  // Add this helper function to detect and format price data
  const formatPriceResponse = (content: string) => {
    if (content.includes("price analysis") || content.includes("optimal price") || 
        content.includes("pricing recommendation")) {
      
      // Extract current and optimal price if they exist
      const currentPriceMatch = content.match(/current price:?\s*\$?([\d,.]+)/i);
      const optimalPriceMatch = content.match(/optimal price:?\s*\$?([\d,.]+)/i);
      
      const currentPrice = currentPriceMatch ? currentPriceMatch[1] : null;
      const optimalPrice = optimalPriceMatch ? optimalPriceMatch[1] : null;
      
      // If we have both prices, create an enhanced display
      if (currentPrice && optimalPrice) {
        return (
          <div>
            <div className="mb-3">{content}</div>
            
            {currentPrice !== optimalPrice && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700 dark:text-gray-300">Current Price:</span>
                  <span className="font-medium">${currentPrice}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 dark:text-gray-300">Recommended Price:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">${optimalPrice}</span>
                </div>
              </div>
            )}
          </div>
        );
      }
    }
    
    // If no price data detected or couldn't parse properly, return normal content
    return content;
  };

  // Update the formatChatResponse function to remove bold text and headings

  function formatChatResponse(message: string): React.ReactNode {
    // Simple text formatting without bold text or different heading sizes
    return (
      <div className="whitespace-pre-wrap">
        {message.split('\n\n').map((paragraph, i) => {
          // Check if it's a list item
          if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
            return (
              <ul key={i} className="list-disc pl-5 my-2">
                {paragraph.split('\n').map((item, j) => (
                  <li key={j} className="my-1">
                    {item.replace(/^[-*]\s+/, '')}
                  </li>
                ))}
              </ul>
            );
          }
          
          // Check if it's a numbered list
          if (/^\d+\.\s/.test(paragraph)) {
            return (
              <ol key={i} className="list-decimal pl-5 my-2">
                {paragraph.split('\n').map((item, j) => (
                  <li key={j} className="my-1">
                    {item.replace(/^\d+\.\s+/, '')}
                  </li>
                ))}
              </ol>
            );
          }
          
          // Remove bold text formatting
          const plainText = paragraph.replace(/\*\*(.*?)\*\*/g, '$1');
          
          // Regular paragraph without any special formatting
          return (
            <p key={i} className={i > 0 ? "mt-4" : ""}>
              {plainText}
            </p>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col h-[650px]">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Analytics Assistant
        </h2>
        
        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">Try asking high-value questions:</span>
          </p>
          <ul className="mt-2 space-y-1 text-sm text-blue-700 dark:text-blue-300">
            <li>• 🏆 "Which location had the highest revenue for {products[0]?.name || '[product]'} in December 2024?"</li>
            <li>• 📊 "Show me the top 3 performing products in November 2024"</li>
            <li>• 💡 "What factors are impacting {products[0]?.name || '[product]'} performance and how can we improve it?"</li>
          </ul>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 dark:bg-gray-900/50">
        {messages.map((message, index) => (
          <div 
            key={index}
            className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'} mb-4`}
          >
            <div 
              className={`${
                message.role === 'assistant' 
                  ? 'bg-gray-100 dark:bg-gray-700 mr-12' 
                  : 'bg-blue-500 text-white ml-12'
              } rounded-lg px-4 py-3 max-w-3xl`}
            >
              {formatChatResponse(message.content)}
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

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
