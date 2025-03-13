import { useState, useEffect } from 'react';

export function PriceOptimizationTab() {
  const [products, setProducts] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [priceData, setPriceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Fetch available products on load
  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("Invalid product data");
        }
        setProducts(data);
        setSelectedProduct(data[0]);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Unable to load products. Please try again later.");
      }
    }
    fetchProducts();
  }, []);

  // Fetch price data when selected product changes
  useEffect(() => {
    async function fetchPriceData() {
      if (!selectedProduct) return;
      try {
        setLoading(true);
        const response = await fetch(`/api/calculations?product=${encodeURIComponent(selectedProduct)}`);
        if (!response.ok) throw new Error('Failed to fetch price data');
        const data = await response.json();
        setPriceData(data.priceAnalysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    if (selectedProduct) fetchPriceData();
  }, [selectedProduct]);

  // Helper functions for price operations
  const getCurrentPrice = (data: any) => {
    return parseFloat(data.formattedReport?.currentPrice?.replace(/[^0-9.-]+/g, '') || '0');
  };

  const getRecommendedPrice = (data: any) => {
    return parseFloat(data.formattedReport?.optimalPrice?.replace(/[^0-9.-]+/g, '') || '0');
  };

  const getElasticityTitle = (elasticity: number) => {
    if (elasticity === undefined || elasticity === null || isNaN(elasticity)) {
      return "Insufficient data available";
    }
    if (elasticity < 0) return "Unusual Price-Sales Pattern";
    if (Math.abs(elasticity) > 1.2) return "High Price Sensitivity";
    if (Math.abs(elasticity) < 0.8) return "Low Price Sensitivity";
    return "Moderate Price Sensitivity";
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Price Optimization</h2>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        {/* Product selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Product</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 dark:text-white"
          >
            {products.map((product) => (
              <option key={product} value={product}>{product}</option>
            ))}
          </select>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        ) : error || !priceData ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error || 'No price data available'}</p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Price Analysis for {selectedProduct}
            </h3>
            
            {/* Price metrics cards */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="flex items-center">
                  <span className="text-xl mr-2">💰</span>
                  <div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">CURRENT PRICE</div>
                    <div className="text-lg font-bold">{priceData.formattedReport?.currentPrice}</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800">
                <div className="flex items-center">
                  <span className="text-xl mr-2">✅</span>
                  <div>
                    <div className="text-xs text-green-700 dark:text-green-300">OPTIMAL PRICE</div>
                    <div className="text-lg font-bold">{priceData.formattedReport?.optimalPrice}</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800">
                <div className="flex items-center">
                  <span className="text-xl mr-2">📊</span>
                  <div>
                    <div className="text-xs text-purple-700 dark:text-purple-300">PRICE ELASTICITY</div>
                    <div className="text-lg font-bold">
                      {priceData.priceElasticity?.toFixed(2) || '0.00'}
                      {parseFloat(priceData.priceElasticity?.toFixed(2) || '0') === 0 && 
                        <span className="block text-xs text-purple-400 font-normal">Not enough data</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Recommendation */}
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
              <div className="flex items-center mb-2">
                <span className="text-xl mr-2">💡</span>
                <h4 className="font-medium">{getElasticityTitle(priceData.priceElasticity)}</h4>
              </div>
              <div className="text-sm ml-7">
                <span className="font-medium">Recommended Action: </span>
                {getCurrentPrice(priceData) < getRecommendedPrice(priceData) ? (
                  <span>Increase price from <span className="font-medium">{priceData.formattedReport?.currentPrice}</span> to <span className="font-medium text-green-600">{priceData.formattedReport?.optimalPrice}</span></span>
                ) : getCurrentPrice(priceData) > getRecommendedPrice(priceData) ? (
                  <span>Decrease price from <span className="font-medium">{priceData.formattedReport?.currentPrice}</span> to <span className="font-medium text-green-600">{priceData.formattedReport?.optimalPrice}</span></span>
                ) : (
                  <span>Maintain current price of <span className="font-medium text-green-600">{priceData.formattedReport?.currentPrice}</span></span>
                )}
              </div>
            </div>

            {/* Promotions */}
            {priceData.topPromotions && priceData.topPromotions.length > 0 && (
              <div className="mb-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="bg-green-50 dark:bg-green-900/20 p-3 border-b flex items-center">
                  <span className="text-xl mr-2">🏷️</span>
                  <h4 className="font-medium">Most Effective Promotions</h4>
                </div>
                
                <div className="divide-y divide-gray-100 dark:divide-gray-600">
                  {priceData.topPromotions.slice(0, 2).map((promo: any, index: number) => (
                    <div key={index} className="p-3 flex justify-between items-center">
                      <div>
                        <h5 className="font-medium">{promo.code}</h5>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          ${promo.totalRevenue.toFixed(2)} | {promo.unitsPerOrder.toFixed(1)} units/order
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300">
                        {promo.avgDiscount.toFixed(1)}% off
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Price History */}
            <div className="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center p-3 border-b bg-gray-50 dark:bg-gray-800">
                <h3 className="font-medium flex items-center">
                  <span className="text-xl mr-2">📈</span>
                  Price Performance History
                </h3>
                <button
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="px-2 py-1 rounded-full text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                >
                  {isHistoryExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              
              <div className="p-3">
                {isHistoryExpanded ? (
                  <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="py-2 pl-4 pr-3 text-left text-sm font-medium">Price Point</th>
                        <th className="px-3 py-2 text-left text-sm font-medium">Units Sold</th>
                        <th className="px-3 py-2 text-left text-sm font-medium">Orders</th>
                        <th className="px-3 py-2 text-left text-sm font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-700">
                      {priceData.formattedReport?.priceComparison?.map((price: any, index: number) => (
                        <tr key={index} className={index === 0 ? "bg-green-50 dark:bg-green-900/10" : ""}>
                          <td className="py-2 pl-4 pr-3 text-sm">{price.price}</td>
                          <td className="px-3 py-2 text-sm">{price.units.toLocaleString()}</td>
                          <td className="px-3 py-2 text-sm">{price.ordersAtPrice.toLocaleString()}</td>
                          <td className="px-3 py-2 text-sm">{price.revenue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <div className="text-xs text-gray-500 mb-1">Best Price</div>
                      <div className="font-medium">{priceData.formattedReport?.priceComparison?.[0]?.price}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <div className="text-xs text-gray-500 mb-1">Units</div>
                      <div className="font-medium">{priceData.formattedReport?.priceComparison?.[0]?.units.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <div className="text-xs text-gray-500 mb-1">Orders</div>
                      <div className="font-medium">{priceData.formattedReport?.priceComparison?.[0]?.ordersAtPrice.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <div className="text-xs text-gray-500 mb-1">Revenue</div>
                      <div className="font-medium">{priceData.formattedReport?.priceComparison?.[0]?.revenue}</div>
                    </div>
                  </div>
                )}

                {priceData.formattedReport?.priceComparison?.length <= 1 && (
                  <div className="mt-3 bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded border border-yellow-100 dark:border-yellow-800 flex">
                    <span className="text-xl mr-2">ℹ️</span>
                    <div>
                      <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-500">Limited price data available</h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        Try ${(parseFloat(priceData.formattedReport?.currentPrice.replace('$', '')) * 0.95).toFixed(2)} 
                        (-5%) and ${(parseFloat(priceData.formattedReport?.currentPrice.replace('$', '')) * 1.05).toFixed(2)} 
                        (+5%)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 