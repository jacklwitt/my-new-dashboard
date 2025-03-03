import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

export function RecommendationDialog({ recommendation, onClose }: DialogProps) {
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent scrolling when dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch advice from API
  const getAdvice = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching advice for:', recommendation);
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        console.error('Advice fetch failed:', errorData);
        throw new Error(errorData.error || 'Failed to fetch advice');
      }
      
      const data = await res.json();
      console.log('Advice response:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setResponse(data.answer);
      setError(null);
    } catch (error) {
      console.error('Error fetching advice:', error);
      setError(error instanceof Error ? error.message : 'Failed to load advice');
      setResponse('');
    } finally {
      setLoading(false);
    }
  };

  // Call getAdvice on mount
  useEffect(() => {
    getAdvice();
  }, [recommendation]);

  // Create portal content
  const dialogContent = (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80" 
      style={{ 
        position: 'fixed',
        zIndex: 99999,
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{ position: 'relative', zIndex: 100000 }}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-bold">Action Plan</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4">
            <strong>Product: </strong>{recommendation.target}
          </div>
          <div className="mb-4">
            <strong>Situation: </strong>{recommendation.impact}
          </div>
          <div className="prose dark:prose-invert max-w-none">
            {loading ? (
              <p>Loading advice...</p>
            ) : error ? (
              <div className="text-red-600">
                <p>{error}</p>
                <button 
                  onClick={() => getAdvice()}
                  className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{response}</div>
            )}
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow"
          >
            Close
          </button>
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