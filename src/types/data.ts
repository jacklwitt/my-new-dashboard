export type SalesRow = [
  string,  // Transaction_ID
  string,  // Purchase_Date
  string,  // Customer_ID
  string,  // Store_Location
  string,  // Product_Name
  string,  // Unit_Price
  string,  // Quantity
  string,  // Discount_Code_Used
  string   // Line_Total
];

export type SalesData = SalesRow[];

export type MonthlyStats = {
  sales: number;
  promoSales: Record<string, number>;
  customerTypes: Record<string, number>;
  timeOfDay: Record<string, number>;
};

export type Analysis = {
  monthlyData: Record<string, MonthlyStats>;
  bestPromo: string;
  promoImpact: number;
  peakSales: number;
  bestTiming: string;
  bestCustomerType: string;
  recentTrend: number;
}; 