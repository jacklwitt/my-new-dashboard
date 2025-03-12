import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

// Define the Recommendation type inline
export interface Recommendation {
  id: string;
  type: 'product' | 'location' | 'promotion' | 'general';
  target: string;
  title: string;
  description: string;
  impact: string;
  impactLevel: 'high' | 'medium' | 'low';
  createdAt: string;
}

// Add the missing DialogProps interface
interface DialogProps {
  recommendation: Recommendation;
  onClose: () => void;
}

export function RecommendationDialog({ recommendation, onClose }: DialogProps) {
  const [advice, setAdvice] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent scrolling when dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch advice when dialog opens
  useEffect(() => {
    async function getAdvice() {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`Fetching advice for ${recommendation.target}...`);
        const response = await fetch('/api/advice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product: recommendation.type === 'product' ? recommendation.target : null
          })
        });
        
        console.log('Advice API response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch advice: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Advice data received:', data);
        
        if (data && data.advice) {
          setAdvice(data.advice);
        } else {
          throw new Error('Invalid advice data structure');
        }
      } catch (err) {
        console.error('Error fetching advice:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch advice');
      } finally {
        setIsLoading(false);
      }
    }
    
    getAdvice();
  }, [recommendation.target]);

  // Create portal content
  const dialogContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {recommendation.target}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Recommendation</h4>
            <p className="text-gray-700 dark:text-gray-300">{recommendation.impact}</p>
          </div>
          
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Analysis</h4>
            
            {isLoading ? (
              <div className="animate-pulse flex space-x-4">
                <div className="flex-1 space-y-4 py-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                </div>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                {advice ? (
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {advice}
                  </p>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No analysis available.</p>
                )}
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level
  return ReactDOM.createPortal(
    dialogContent,
    document.body
  );
} 