"use client";
import React, { useState, useEffect } from 'react';
import { RecommendationDialog } from './RecommendationDialog';
import { Recommendation as DialogRecommendation } from './RecommendationDialog';
// Let's use SVG icons directly instead of the heroicons package

// Simple SVG icons directly in the component
const CoffeeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const StoreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72L4.318 3.44A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72m-13.5 8.65h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .415.336.75.75.75Z" />
  </svg>
);

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

type RecommendationState = 'default' | 'highlighted' | 'dimmed';

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

function RecommendationCard({ recommendation }: { recommendation: any }) {
  // Check if we actually have a recommendation
  if (!recommendation || !recommendation.target) return null;

  const isUrgent = recommendation.action === 'reverse_decline';
  const icon = recommendation.type === 'product' 
    ? <CoffeeIcon /> 
    : <StoreIcon />;

  return (
    <div className={`p-4 rounded-lg border ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center">
          <div className={`p-2 rounded-full ${isUrgent ? 'bg-red-100' : 'bg-green-100'} mr-3`}>
            {icon}
          </div>
          <div>
            <h3 className="font-medium">
              {isUrgent ? 'Urgent: ' : ''} 
              {recommendation.type === 'product' ? 'Boost promotion for ' : 'Focus on location: '}
              {recommendation.target}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{recommendation.impact}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Update the cleanImpactText function to handle undefined values
const cleanImpactText = (impact?: string): string => {
  // Handle undefined case
  if (!impact) return '';
  
  // Remove the parenthetical part containing the values that we're already displaying separately
  return impact.replace(/\s*\(November 2024:.+\)/, '');
};

// Make same change in extractValuesFromImpact
const extractValuesFromImpact = (impact?: string) => {
  try {
    // Handle undefined case
    if (!impact) return { previousValue: null, currentValue: null };
    
    // Extract values using regex
    const novMatch = impact.match(/November 2024: \$([0-9,.]+)/);
    const decMatch = impact.match(/December 2024: \$([0-9,.]+)/);
    
    const novValue = novMatch ? novMatch[1].replace(/,/g, '') : null;
    const decValue = decMatch ? decMatch[1].replace(/,/g, '') : null;
    
    return {
      previousValue: novValue,
      currentValue: decValue
    };
  } catch (e) {
    console.error('Error extracting values:', e);
    return { previousValue: null, currentValue: null };
  }
};

function createCompleteRecommendation(rec: any): DialogRecommendation {
  return {
    id: `rec_${Date.now()}`,
    type: rec.type || 'product',
    target: rec.target || 'Unknown',
    title: `${rec.target || 'Product'} Recommendation`,
    description: `Recommendation for ${rec.target || 'product'}`,
    impact: rec.impact || 'Improve sales performance',
    impactLevel: 'medium' as const,
    createdAt: new Date().toISOString()
  };
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
      case 'store':
        switch (rec.action) {
          case 'maintain_growth':
            return `Continue optimizing location ${rec.target} - ${rec.impact}`;
          case 'reverse_decline':
            return `Urgent: Focus on location ${rec.target} - ${rec.impact}`;
          default:
            return `Location recommendation for ${rec.target}: ${rec.value}`;
        }
      case 'discount':
        return `${rec.target} promotion is driving ${rec.impact}`;
      default:
        return `${rec.type}: ${rec.target} - ${rec.impact || rec.value}`;
    }
  }

  const initializeRecState = (target: string) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      newMap.set(target, 'default');
      return newMap;
    });
  };

  const handleResolve = (rec: Recommendation) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      newMap.set(rec.target, 'highlighted');
      return newMap;
    });
  };

  const toggleChat = (target: string) => {
    setRecStates(prev => {
      const newMap = new Map(prev);
      newMap.set(target, prev.get(target) === 'highlighted' ? 'default' : 'highlighted');
      return newMap;
    });
  };

  const handleChatAbout = (rec: Recommendation) => {
    console.log('Opening advice for:', rec);
    setTimeout(() => {
      setSelectedRec(rec);
    }, 0);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Recommendations
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
      </div>
      
      <div className="p-6 flex-1 overflow-auto">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        ) : recommendations && recommendations.length > 0 ? (
          <ul className="space-y-4">
            {recommendations
              // Filter out resolved recommendations
              .filter(rec => {
                const state = recStates.get(rec.target) || 'default';
                return state === 'default';
              })
              // Take the first 3 unresolved recommendations
              .slice(0, 3)
              .map((rec, idx) => {
                const state = recStates.get(rec.target) || 'default';
                
                return (
                  <li key={idx} className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div className="flex-1">
                        <div className="font-medium text-red-600 dark:text-red-400 mb-3 flex items-center gap-2 text-lg">
                          <span>Urgent: {rec.target}</span>
                        </div>
                        
                        <div className="text-gray-700 dark:text-gray-300 space-y-3 mb-4">
                          <p className="mb-2">{cleanImpactText(rec.impact)}</p>
                          
                          {/* Extract and display values */}
                          {(() => {
                            const { previousValue, currentValue } = extractValuesFromImpact(rec.impact);
                            return (
                              <>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium">November 2024:</span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    ${previousValue ? Number(previousValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium">December 2024:</span>
                                  <span className="text-gray-900 dark:text-gray-100">
                                    ${currentValue ? Number(currentValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 self-start">
                        <button
                          onClick={() => handleChatAbout(rec)}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 w-32"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Get Advice
                        </button>
                        <button
                          onClick={() => handleResolve(rec)}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 w-32"
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
            <div className="text-5xl mb-4">✅</div>
            <p className="text-lg">All caught up! No recommendations at this time.</p>
          </div>
        )}
      </div>

      {selectedRec && (
        <RecommendationDialog
          recommendation={createCompleteRecommendation(selectedRec)}
          onClose={() => setSelectedRec(null)}
        />
      )}
    </div>
  );
}
