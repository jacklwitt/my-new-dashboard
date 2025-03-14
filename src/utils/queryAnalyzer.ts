/**
 * Analyzes a user query to determine if it's a data/analytics question
 * @param query The user's question
 * @returns Analysis result indicating query type
 */

// Define the QueryAnalysisResult interface
export interface QueryAnalysisResult {
  isProductQuery: boolean;
  isLocationQuery: boolean;
  isTimeQuery: boolean;
  isComparisonQuery: boolean;
  isAnalyticsQuery: boolean;
  isProductContributionQuery: boolean;
  isContributionQuestion: boolean;
  isRevenueQuery: boolean;
  shouldUseDataAnalysis: boolean;
}

export function analyzeQuery(query: string): QueryAnalysisResult {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Log the query being analyzed
  console.log(`Analyzing query: "${normalizedQuery}"`);
  
  // Check for product revenue contribution patterns - make this more specific and reliable
  const isProductContributionQuery = (
    (/which|what|top|best|highest|most|leading|greatest|main|primary|major|key/).test(normalizedQuery) && 
    (/product|item|menu item|dish|bowl|smoothie/).test(normalizedQuery) && 
    (/revenue|sales|profit|income|earning|money|contribute|contribution|performer|performing|seller|selling/).test(normalizedQuery)
  );
  
  // Direct revenue questions
  const isRevenueQuery = (
    (/revenue|sales|profit|income|earning|money/).test(normalizedQuery) &&
    (/most|highest|top|best|greatest|largest/).test(normalizedQuery)
  );
  
  // Check for product analysis patterns
  const isProductQuery = /product|acai|bowl|smoothie|item|menu|selling/.test(normalizedQuery);
  
  // Check for location analysis patterns
  const isLocationQuery = /location|store|shop|branch|where|place|city|neighborhood/.test(normalizedQuery);
  
  // Check for time period patterns
  const isTimeQuery = /month|year|weekly|daily|quarterly|january|february|march|april|may|june|july|august|september|october|november|december|2023|2024/.test(normalizedQuery);
  
  // Check for comparison patterns
  const isComparisonQuery = /compare|comparison|versus|vs|against|difference|better|worse|more than|less than/.test(normalizedQuery);
  
  // Check for specific analytical requests
  const isAnalyticsQuery = /sales|revenue|data|statistics|performance|trend|growth|decline|analysis|analyze|report|metric|kpi|percentage|calculate|projection|forecast/.test(normalizedQuery);
  
  // Specifically check for "contributes most" type questions - expand this pattern
  const isContributionQuestion = (
    /contributes? (the )?most|highest contribution|biggest impact|main source|primary source|largest share|major contributor|most popular|best seller|top (performer|revenue|seller)/.test(normalizedQuery)
  );

  // Log each condition result for debugging
  const analysisResult = {
    isProductQuery,
    isLocationQuery,
    isTimeQuery,
    isComparisonQuery,
    isAnalyticsQuery,
    isProductContributionQuery,
    isContributionQuestion,
    isRevenueQuery,
    shouldUseDataAnalysis: isProductContributionQuery || isContributionQuestion || isRevenueQuery || 
      (isAnalyticsQuery && (isProductQuery || isLocationQuery || isTimeQuery))
  };
  
  // Log the detailed analysis
  console.log("Query analysis result:", analysisResult);
  
  return analysisResult;
} 