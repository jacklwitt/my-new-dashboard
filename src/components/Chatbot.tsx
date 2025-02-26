"use client";
import React from 'react';
import type { FormEvent } from 'react';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

function isCalculationQuery(question: string, previousQuestion?: string): boolean {
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
    return true;
  }
  
  return calculationKeywords.some(keyword => questionLower.includes(keyword)) &&
         !complexQuestions.some(phrase => questionLower.includes(phrase));
}

export function Chatbot({ previousQuestion: _previousQuestion }: ChatbotProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Test connection on component mount
  React.useEffect(() => {
    async function testConnection() {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: 'test connection',
            conversation: [],
          }),
        });
        const data = await response.json();
        console.log('Connection test result:', data);
      } catch (error) {
        console.error('Connection test failed:', error);
      }
    }
    testConnection();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const previousQuestion = messages.length > 0 ? messages[messages.length - 1].content : undefined;
      const endpoint = isCalculationQuery(input, previousQuestion) ? '/api/calculations' : '/api/chat';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: input,
          conversation: messages // Only needed for chat endpoint
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage = { role: 'assistant', content: data.answer };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: error instanceof Error ? error.message : 'Sorry, there was an error processing your request.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] border rounded-lg shadow-lg bg-white dark:bg-gray-800">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
              Thinking...
            </div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:text-gray-100"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
