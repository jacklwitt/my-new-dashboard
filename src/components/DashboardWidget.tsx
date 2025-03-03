"use client";
import { useState, useEffect } from 'react';

// Debug logging
console.log('DashboardWidget module initializing');

// Add debug logging
console.log('DashboardWidget module loading');
console.log('Import check:', { useState, useEffect });

type Recommendation = {
  type: 'store' | 'product' | 'discount';
  action: string;
  target: string;
  metric: string;
  value: string;
  benchmark?: string;
  impact?: string;
};

type RecommendationState = {
  resolved: boolean;
  chatOpen: boolean;
};

interface RecommendationDialogProps {
  recommendation: Recommendation;
  onClose: () => void;
}

async function fetchRecommendations() {
  try {
    const res = await fetch('/api/recommendations');
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ 
        error: 'Server error' 
      }));
      throw new Error(errorData.error || `Server error (${res.status})`);
    }
    const data = await res.json();
    return data.recommendations || [];
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    throw error;
  }
}

export function DashboardWidget() {
  console.log('DashboardWidget component rendering');
  
  // Add component initialization logging
  useEffect(() => {
    console.log('DashboardWidget mounted');
    return () => console.log('DashboardWidget unmounted');
  }, []);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recStates, setRecStates] = useState<Map<string, RecommendationState>>(new Map());
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1aRB9-8eXwOhrNbaCrsqluIRPcsruOLp5F4Z3GJv0GS4/edit?gid=0#gid=0";

  useEffect(() => {
    async function loadRecommendations() {
      try {
        setError(null);
        const recs = await fetchRecommendations();
        setRecommendations(recs);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recommendations');
      } finally {
        setLoading(false);
      }
    }
    loadRecommendations();
  }, []);

  if (loading) {
    return <div>Loading recommendations...</div>;
  }

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

  function formatRecommendation(rec: Recommendation): string {
    switch (rec.type) {
      case 'product':
        switch (rec.action) {
          case 'maintain_growth':
            return `Continue promoting ${rec.target} - ${rec.impact}`;
          case 'reverse_decline':
            return `Urgent: Boost promotion for ${rec.target} - ${rec.impact}`;
          case 'monitor_performance':
            return `Key product ${rec.target} - ${rec.impact}`;
          default:
            return `Product recommendation for ${rec.target}: ${rec.value}`;
        }
      case 'discount':
        return `${rec.target} promotion is driving ${rec.impact}`;
      default:
        return '';
    }
  }

  const initializeRecState = (target: string) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      newMap.set(target, { 
        resolved: false, 
        chatOpen: false 
      });
      return newMap;
    });
  };

  const handleResolve = (rec: Recommendation) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      const currentState = prev.get(rec.target) || { resolved: false, chatOpen: false };
      newMap.set(rec.target, { 
        ...currentState,
        resolved: true 
      });
      return newMap;
    });
  };

  const toggleChat = (target: string) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      const currentState = prev.get(target) || { resolved: false, chatOpen: false };
      newMap.set(target, {
        ...currentState,
        chatOpen: !currentState.chatOpen
      });
      return newMap;
    });
  };

  const handleChatAbout = (rec: Recommendation) => {
    console.log('Opening advice for:', rec);
    setSelectedRec(rec);
  };

  return (
    <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Top 3 Recommendations
          </h2>
          <a 
            href={SHEETS_URL} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <span>View Data</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-6 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
          <span className="block font-semibold mb-2">📊 Quick Guide:</span>
          • View top products needing attention based on revenue changes<br />
          • Get AI-powered advice by clicking "Get Advice"<br />
          • Mark items as resolved once actions are implemented
        </p>
      </div>

      {recommendations.length > 0 ? (
        <ul className="space-y-6">
          {recommendations.slice(0, 3).map((rec, idx) => {
            const state = recStates.get(rec.target) || { resolved: false, chatOpen: false };
            if (state.resolved) return null;
            
            return (
              <li key={idx} className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="font-medium text-red-600 dark:text-red-400 mb-2">
                      {formatRecommendation(rec)}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleChatAbout(rec)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Get Advice
                    </button>
                    <button
                      onClick={() => handleResolve(rec)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Resolve
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg">All caught up! No recommendations at this time.</p>
        </div>
      )}

      {selectedRec && (
        <RecommendationDialog 
          recommendation={selectedRec}
          onClose={() => setSelectedRec(null)}
        />
      )}
    </div>
  );
}

function RecommendationDialog({ recommendation, onClose }: RecommendationDialogProps) {
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getAdvice() {
      try {
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
    }
    getAdvice();
  }, [recommendation]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-xl font-bold">Action Plan</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            Below is an AI-generated action plan based on historical performance data. 
            Each section provides specific, actionable steps to improve product performance.
          </p>
        </div>
        
        <div className="p-6 overflow-y-auto">
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

        <div className="p-6 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
