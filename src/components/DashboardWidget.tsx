"use client";
import React from 'react';

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

export function DashboardWidget() {
  const [recommendations, setRecommendations] = React.useState<Recommendation[]>([]);
  const [recStates, setRecStates] = React.useState<Map<string, RecommendationState>>(new Map());
  const [selectedRec, setSelectedRec] = React.useState<Recommendation | null>(null);
  const [loading, setLoading] = React.useState(true);

  const SHEETS_URL = "https://docs.google.com/spreadsheets/d/1aRB9-8eXwOhrNbaCrsqluIRPcsruOLp5F4Z3GJv0GS4/edit?gid=0#gid=0";

  React.useEffect(() => {
    async function fetchRecommendations() {
      try {
        const res = await fetch('/api/recommendations');
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setRecommendations(data.recommendations || []);
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchRecommendations();
  }, []);

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
    setSelectedRec(rec);
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="p-6 border rounded-lg shadow-lg bg-white dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Top 3 Recommendations
          </h3>
          <a 
            href={SHEETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            View Data Source
          </a>
        </div>
        {loading ? (
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        ) : recommendations.length > 0 ? (
          <ul className="space-y-4">
            {recommendations.slice(0, 3).map((rec, idx) => {
              const state = recStates.get(rec.target) || { resolved: false, chatOpen: false };
              if (state.resolved) return null;
              
              return (
                <li key={idx} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {formatRecommendation(rec)}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleChatAbout(rec)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Get Advice
                      </button>
                      <button
                        onClick={() => handleResolve(rec)}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Mark Resolved
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-gray-600 dark:text-gray-300">
            No recommendations at this time.
          </p>
        )}
      </div>

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
  const [response, setResponse] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function getAdvice() {
      try {
        const res = await fetch('/api/advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendation })
        });
        const data = await res.json();
        setResponse(data.answer);
      } catch (error) {
        console.error('Error fetching advice:', error);
        setResponse('Failed to load advice. Please try again.');
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
