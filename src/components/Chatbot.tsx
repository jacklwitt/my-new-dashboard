"use client";
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, github } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { stripMarkdownFormatting } from '../utils/markdownProcessor';
import { analyzeQuery } from '../utils/queryAnalyzer';

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
  revenue: number;
};

type Location = {
  id: string;
  name: string;
  region: string;
};

// First, add a type for the product data items
interface ProductRevenue {
  name?: string;
  product?: string;
  id?: string;
  revenue?: number;
  value?: number;
  total?: number | string;
}

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

// Update the queryProductRevenue function with proper type annotations
async function queryProductRevenue(question: string): Promise<string> {
  try {
    // Use the graphs API instead, which has the actual revenue data
    const graphsResponse = await fetch('/api/graphs?timeRange=all');
    if (!graphsResponse.ok) throw new Error('Failed to fetch revenue data');
    const graphsData = await graphsResponse.json();
    
    console.log("Graphs API response:", graphsData);
    
    // The revenue by product data should be in the revenueByProduct field
    let productData: ProductRevenue[] = [];
    if (graphsData.revenueByProduct && Array.isArray(graphsData.revenueByProduct)) {
      productData = graphsData.revenueByProduct;
    } else {
      // Try to find the data in other possible locations
      for (const key in graphsData) {
        if (Array.isArray(graphsData[key]) && graphsData[key].length > 0 && 
            graphsData[key][0] && (graphsData[key][0].name || graphsData[key][0].product)) {
          productData = graphsData[key];
          break;
        }
      }
    }
    
    if (!productData.length) {
      throw new Error("Could not find product revenue data in the API response");
    }
    
    // Normalize the data to ensure each product has a name and revenue
    const normalizedProducts = productData.map((item: ProductRevenue) => ({
      name: item.name || item.product || item.id || "Unnamed Product",
      revenue: parseFloat(item.revenue?.toString() || item.value?.toString() || item.total?.toString() || "0") || 0
    }));
    
    // Sort by revenue, highest first
    const sortedProducts = normalizedProducts.sort((a, b) => b.revenue - a.revenue);
    
    // Format response
    let response = `# Top Revenue Products\n\nBased on our data analysis, here are the products that contribute most to overall revenue:\n\n`;
    
    // Add top 3 products
    sortedProducts.slice(0, 3).forEach((product, index) => {
      response += `${index + 1}. **${product.name}**: $${product.revenue.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}\n`;
    });
    
    if (sortedProducts.length > 0) {
      response += `\nThe product that contributes the most to overall revenue is **${sortedProducts[0].name}** with $${
        sortedProducts[0].revenue.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })
      }.`;
    } else {
      response += "\nNo product data available.";
    }
    
    return response;
  } catch (error) {
    console.error('Error in direct product revenue query:', error);
    return `I encountered an error while retrieving product revenue data: ${error instanceof Error ? error.message : 'Unknown error'}. Please try asking a different question.`;
  }
}

// Move the categorize query function outside the component as it doesn't need component state
function categorizeQuery(question: string): { type: string; confidence: number } {
  // Lowercase and normalize the query
  const normalizedQuery = question.toLowerCase().trim();
  
  // Define specialized patterns with confidence levels
  const patterns = [
    // Product revenue queries (high confidence)
    {
      type: 'product_revenue',
      confidence: 0.95,
      test: (q: string) => {
        const hasProductTerm = /\b(product|item|bowl|smoothie)\b/.test(q);
        const hasContributionTerm = /\b(contributes?|highest|most|top|best)\b/.test(q);
        const hasRevenueTerm = /\b(revenue|sales|profit|income|money)\b/.test(q);
        
        // Only match if all three components are present
        return hasProductTerm && hasContributionTerm && hasRevenueTerm;
      }
    },
    
    // Day of week sales queries - only match specific patterns
    {
      type: 'day_of_week',
      confidence: 0.9,
      test: (q: string) => {
        return /\b(what|which)\b.{0,20}\b(day|weekday)\b.{0,30}\b(highest|most|best|top)\b.{0,20}\b(sales|revenue)\b/.test(q) ||
               /\b(day).{0,10}\b(with)\b.{0,15}\b(highest|most|best|top)\b.{0,20}\b(sales|revenue)\b/.test(q);
      }
    }
  ];
  
  // Check each pattern in order
  for (const pattern of patterns) {
    if (pattern.test(normalizedQuery)) {
      return { type: pattern.type, confidence: pattern.confidence };
    }
  }
  
  // If we get here, determine if it's a general analytics question
  // but with lower confidence
  if (/\b(sales|revenue|performance|metrics)\b/.test(normalizedQuery)) {
    return { type: 'general_analytics', confidence: 0.6 };
  }
  
  // Default to general question with high confidence
  return { type: 'general_question', confidence: 0.9 };
}

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

  // All handlers that need access to component state must be inside the component
  
  // Helper function to check if we have day of week data available
  function hasImplementedDayOfWeekAnalysis(): boolean {
    // For now, return false since we haven't implemented this yet
    return false;
  }

  // Handler for general questions (uses ChatGPT API)
  async function handleGeneralQuestion(question: string, previousMessages: Message[]): Promise<string> {
    // First, check if we have the products list to provide context
    let validProductContext = "";
    if (products && products.length > 0) {
      validProductContext = "The business sells the following products: " + 
        products.map(p => p.name).join(", ") + ". ";
    }
    
    // Add a system message with explicit instructions not to make up product info
    const systemMessage = {
      role: 'system',
      content: `${validProductContext}Only refer to the products listed above. NEVER make up products that aren't in this list. If you don't have data about a specific analytical question, acknowledge that you don't have that information instead of making up an answer.`
    };
    
    // Add the system message to the conversation context
    const conversationWithContext = [
      systemMessage,
      ...previousMessages?.slice(-6) || []
    ];
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        conversation: conversationWithContext
      })
    });
    
    if (!response.ok) {
      throw new Error(`ChatGPT API error: ${response.status}`);
    }
    
    const rawText = await response.text();
    
    try {
      const data = JSON.parse(rawText);
      return data.answer || rawText;
    } catch {
      return rawText;
    }
  }

  // Main submit handler must be inside the component to access state
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userQuestion = input.trim();
    console.log("Processing question:", userQuestion);
    
    // First add the user message to the chat
    setMessages(prev => [...(prev || []), { role: 'user', content: userQuestion }]);
    setInput('');
    setIsLoading(true);
    
    try {
      // STEP 1: Categorize the question with confidence scoring
      const { type: queryType, confidence } = categorizeQuery(userQuestion);
      console.log(`Query categorized as: ${queryType} (confidence: ${confidence})`);
      
      // STEP 2: Only route to specialized handlers if confidence is high enough
      let response;
      
      if (confidence >= 0.9) {
        if (queryType === 'product_revenue') {
          response = await queryProductRevenue(userQuestion);
        } 
        else if (queryType === 'day_of_week' && hasImplementedDayOfWeekAnalysis()) {
          // We won't reach this yet since hasImplementedDayOfWeekAnalysis returns false
          response = await handleGeneralQuestion(userQuestion, messages);
        }
        else {
          // For all other types, including high confidence general questions
          response = await handleGeneralQuestion(userQuestion, messages);
        }
      } else {
        // For lower confidence matches, always use ChatGPT
        console.log("Low confidence match, routing to ChatGPT");
        response = await handleGeneralQuestion(userQuestion, messages);
      }
      
      // Add the response to messages
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: response
      }]);
    } catch (error) {
      console.error("Error processing query:", error);
      // Add error message to chat
      setMessages(prev => [...(prev || []), { 
        role: 'assistant', 
        content: `I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Add the formatChatResponse function inside the component
  function formatChatResponse(content: string) {
    // This function renders markdown content in chat messages
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const inline = props.inline || false;
            
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Add styling for other markdown elements
          p: ({ children }) => <p className="mb-2">{children}</p>,
          h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-md font-bold mb-2 mt-3">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
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
        <div className="flex">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isLoading || !input.trim()}
          >
            Send {isLoading ? "..." : "→"}
          </button>
        </div>
      </form>
    </div>
  );
}
