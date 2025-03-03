"use client";
import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Add debug logging
console.log('GraphWidget module loading');

type TimeSeriesData = {
  date: string;
  value: number;
  category?: string;
}[];

type PieChartData = {
  name: string;
  value: number;
}[];

type GraphData = {
  revenueTrend: TimeSeriesData;
  revenueByLocation: PieChartData;
  revenueByProduct: PieChartData;
  monthlyComparison: {
    month: string;
    current: number;
    previous: number;
  }[];
};

// Color palette for consistent look
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// Add this type for time range options
type TimeRange = 'all' | '30days' | '90days' | '6months' | '1year';

export function GraphWidget() {
  console.log('GraphWidget component rendering');
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGraph, setActiveGraph] = useState<'revenue' | 'location' | 'product' | 'comparison'>('revenue');
  
  // Add time range state
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  useEffect(() => {
    console.log('GraphWidget mounted');
    
    async function fetchGraphData() {
      try {
        setError(null);
        setLoading(true);
        
        // Add timeRange parameter to the API request
        const res = await fetch(`/api/graphs?timeRange=${timeRange}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ 
            error: 'Server error' 
          }));
          throw new Error(errorData.error || `Server error (${res.status})`);
        }
        const data = await res.json();
        console.log('Graph data received:', data);
        setGraphData(data);
      } catch (e) {
        console.error('Failed to load graph data:', e);
        setError(e instanceof Error ? e.message : 'Failed to load graph data');
      } finally {
        setLoading(false);
      }
    }

    fetchGraphData();
    
    return () => console.log('GraphWidget unmounted');
  }, [timeRange]); // Add timeRange as a dependency

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 w-1/4 mb-8 rounded"></div>
        <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <p className="text-gray-500 dark:text-gray-400">No data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Sales Analytics
          </h2>
          
          {/* Time Range Selection */}
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg">
            <span className="text-sm text-gray-500 dark:text-gray-400">Time Range:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              <option value="all">All Time</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="6months">Last 6 Months</option>
              <option value="1year">Last Year</option>
            </select>
          </div>
        </div>
        
        {/* Tab navigation with emojis */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => setActiveGraph('revenue')}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              activeGraph === 'revenue' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            💵 Revenue Trend
          </button>
          <button
            onClick={() => setActiveGraph('location')}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              activeGraph === 'location' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            🏪 By Location
          </button>
          <button
            onClick={() => setActiveGraph('product')}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              activeGraph === 'product' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            🛍️ By Product
          </button>
          <button
            onClick={() => setActiveGraph('comparison')}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              activeGraph === 'comparison' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            📊 Monthly Comparison
          </button>
        </div>
      </div>

      {/* Graph container - reduce height */}
      <div className="p-6 flex-1">
        <div className="h-full" style={{ minHeight: '350px', maxHeight: '450px' }}>
          <ResponsiveContainer width="100%" height="100%">
            {(() => {
              if (activeGraph === 'revenue') {
                return (
                  <LineChart
                    data={graphData.revenueTrend}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={formatCurrency} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name="Revenue" 
                      stroke="#0088FE" 
                      activeDot={{ r: 8 }} 
                    />
                  </LineChart>
                );
              } else if (activeGraph === 'location') {
                return (
                  <PieChart>
                    <Pie
                      data={graphData.revenueByLocation}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {graphData.revenueByLocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                  </PieChart>
                );
              } else if (activeGraph === 'product') {
                return (
                  <PieChart>
                    <Pie
                      data={graphData.revenueByProduct}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {graphData.revenueByProduct.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                  </PieChart>
                );
              } else if (activeGraph === 'comparison') {
                return (
                  <BarChart
                    data={graphData.monthlyComparison}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={formatCurrency} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="current" name="Current Year" fill="#0088FE" />
                    <Bar dataKey="previous" name="Previous Year" fill="#00C49F" />
                  </BarChart>
                );
              }
              
              // Always return a valid chart as fallback instead of null
              return (
                <LineChart
                  data={graphData.revenueTrend}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={formatCurrency} />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    name="Revenue" 
                    stroke="#0088FE" 
                    activeDot={{ r: 8 }} 
                  />
                </LineChart>
              );
            })()}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
} 