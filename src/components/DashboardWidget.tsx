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
  novemberData?: number;
  decemberData?: number;
  previousData?: number;
  currentData?: number;
};

type RecommendationState = 'default' | 'highlighted' | 'dimmed' | 'resolved';

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
    if (!impact) return { previousValue: null, currentValue: null };
    
    // Extract values using regex
    const novMatch = impact.match(/November 2024:\s*\$([0-9,.]+)/);
    const decMatch = impact.match(/December 2024:\s*\$([0-9,.]+)/);
    
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

// Add this helper function near other utility functions in the component
const getRecKey = (rec: Recommendation): string => {
  return `${rec.type}:${rec.target}`;
};

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
  
  // Add this state for recommendation values
  const [valuesState, setValuesState] = useState<{
    values: Record<string, { previousValue: number, currentValue: number }>,
    loadingValues: Record<string, boolean>
  }>({
    values: {},
    loadingValues: {}
  });
  
  // Helper to update state
  const setStateHelper = (updater: (prev: typeof valuesState) => typeof valuesState) => {
    setValuesState(updater);
  };
  
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
      newMap.set(rec.target, 'resolved');
      return newMap;
    });
    
    // Refresh recommendations to show the next one
    setRecommendations(currentRecs => {
      // Make a shallow copy to trigger re-render
      return [...currentRecs];
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

  const fetchValuesForRec = async (rec: Recommendation) => {
    const key = `${rec.type}:${rec.target}`;
    
    // Mark as loading
    setValuesState(prev => ({
      ...prev,
      loadingValues: {
        ...prev.loadingValues,
        [key]: true
      }
    }));
    
    try {
      const response = await fetch(`/api/data/values?target=${encodeURIComponent(rec.target)}&type=${rec.type}`);
      if (!response.ok) throw new Error('Failed to fetch values');
      
      const data = await response.json();
      
      // Log the fetched data
      console.log(`Fetched data for ${rec.target}:`, data);
      
      // Assuming the API returns an object with previousValue and currentValue
      const previousValue = data.previousValue || 0;
      const currentValue = data.currentValue || 0;

      // Save the values
      setValuesState(prev => ({
        ...prev,
        values: {
          ...prev.values,
          [key]: {
            previousValue,
            currentValue
          }
        },
        loadingValues: {
          ...prev.loadingValues,
          [key]: false
        }
      }));

      console.log(`Fetched values for ${rec.target}:`, {
        previousValue,
        currentValue
      });
    } catch (error) {
      console.error(`Error fetching values for ${rec.target}:`, error);
      setValuesState(prev => ({
        ...prev,
        loadingValues: {
          ...prev.loadingValues,
          [key]: false
        }
      }));
    }
  };

  // Inside the render method, log the values state
  console.log('Current values state:', valuesState.values);

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
              // Filter to only show downtrending items that aren't resolved
              .filter(rec => rec.action === 'reverse_decline' && recStates.get(rec.target) !== 'resolved')
              // Take only 3 recommendations
              .slice(0, 3)
              .map((rec, idx) => {
                const key = `${rec.type}:${rec.target}`;
                
                // Extract percentage
                const percentMatch = rec.value?.match(/(\d+(\.\d+)?)/);
                const percent = percentMatch ? parseFloat(percentMatch[1]) : 0;

                // Log the entire recommendation for debugging
                console.log(`Full recommendation for ${rec.target}:`, rec);

                // Try multiple methods to extract values
                let previousValue = 0;
                let currentValue = 0;

                // Method 1: From impact field using our existing function
                const extractedValues = extractValuesFromImpact(rec.impact);
                console.log(`Extracted values from impact for ${rec.target}:`, extractedValues);

                // Method 2: Try to parse from the benchmark data if available
                if (rec.benchmark) {
                  console.log(`Benchmark data for ${rec.target}:`, rec.benchmark);
                  try {
                    const parts = rec.benchmark.split(' vs ');
                    if (parts.length === 2) {
                      // Try to extract monetary values from other sources
                      const novData = rec.novemberData || rec.previousData;
                      const decData = rec.decemberData || rec.currentData;
                      
                      if (novData && typeof novData === 'number') previousValue = novData;
                      if (decData && typeof decData === 'number') currentValue = decData;
                      
                      console.log(`Extracted from benchmark for ${rec.target}:`, { previousValue, currentValue });
                    }
                  } catch (e) {
                    console.error(`Error parsing benchmark for ${rec.target}:`, e);
                  }
                }

                // Method 3: Try to calculate from percentage and impact amount
                if (rec.action === 'reverse_decline' && rec.impact && rec.value && (previousValue === 0 || currentValue === 0)) {
                  const decreaseMatch = rec.impact?.match(/\$([0-9,.]+)/);
                  if (decreaseMatch) {
                    const decrease = parseFloat(decreaseMatch[1].replace(/,/g, ''));
                    if (!isNaN(decrease) && !isNaN(percent) && percent > 0) {
                      // If this is a X% decrease of $Y, we can calculate the previous value
                      previousValue = (100 * decrease) / percent;
                      currentValue = previousValue - decrease;
                      console.log(`Calculated from percentage for ${rec.target}:`, { previousValue, currentValue });
                    }
                  }
                }

                // Fallback to extracted values from impact if other methods failed
                if (previousValue === 0 && extractedValues.previousValue) {
                  previousValue = parseFloat(extractedValues.previousValue);
                }
                if (currentValue === 0 && extractedValues.currentValue) {
                  currentValue = parseFloat(extractedValues.currentValue);
                }

                // Additional fallback: try to fetch from the API if we still don't have values
                if (previousValue === 0 || currentValue === 0) {
                  console.log(`No values found for ${rec.target}, triggering API fetch`);
                  // This will trigger the fetchValuesForRec in useEffect
                  setTimeout(() => fetchValuesForRec(rec), 100);
                }

                console.log(`Final values for ${rec.target}:`, { previousValue, currentValue });

                return (
                  <li key={idx} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-medium text-red-600 dark:text-red-500">
                            Urgent: {rec.target}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Revenue declining by {percent.toFixed(1)}%
                          </p>
                        </div>
                        
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleChatAbout(rec)}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                          >
                            Get Advice
                          </button>
                          
                          <button
                            onClick={() => handleResolve(rec)}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all mt-1"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-1 mt-1">
                        <div className="flex justify-start">
                          <span className="text-gray-600 dark:text-gray-400">November 2024:</span>
                          <span className="text-gray-900 dark:text-gray-100 font-medium ml-2">
                            ${previousValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <div className="flex justify-start">
                          <span className="text-gray-600 dark:text-gray-400">December 2024:</span>
                          <span className="text-red-600 dark:text-red-400 font-medium ml-2">
                            ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
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
