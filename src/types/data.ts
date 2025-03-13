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

// Data structure interfaces

export interface ProductSales {
  name: string;
  sales: number;
}

export interface LocationSales {
  location: string;
  sales: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  sales: number;
  growth?: number;
}

export interface PromotionInsight {
  code: string;
  totalRevenue: number;
  count: number;
  avgDiscount: number;
  unitsPerOrder: number;
}

export interface ProductPerformance {
  summary: string;
  locationInsights: string;
  timingPatterns: string;
  timeOfDayInsights: string;
  dayOfWeekInsights: string;
  promotionEffects: string | null;
  totalSales: number;
  avgOrderValue: number;
  topLocations: LocationSales[];
  monthlyTrends: MonthlyTrend[];
  topTimeOfDay: Array<{timeSlot: string; sales: number; percentage: number}>;
  topDaysOfWeek: Array<{day: string; sales: number; percentage: number}>;
  promotions: PromotionInsight[];
}

export interface ProductRecommendation {
  summary: string;
  locationInsights: string;
  timingPatterns: string;
  topLocations: any[];
  monthlyTrends: any[];
  promotions: any[];
  totalSales: number;
  avgOrderValue: number;
  timeOfDayInsights: string;
  dayOfWeekInsights: string;
  promotionEffects: any;
  topTimeOfDay: any[];
  topDaysOfWeek: any[];
  topLocationStrategy?: string | null;
  growthOpportunities?: string | null;
}

export interface TimeParameters {
  dates: Array<{month: string; year: string}>;
  isComparison: boolean;
  hasYearSpecified: boolean;
}

export interface DataMetadata {
  availableProducts: string[];
  availableLocations: string[];
  months: string[];
  timeRange: string[];
  monthNames: string[];
} 