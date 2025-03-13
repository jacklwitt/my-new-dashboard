"use client";

import React from 'react';
import { DashboardWidget } from '@/components/DashboardWidget';
import { GraphWidget } from '@/components/GraphWidget';
import { Chatbot } from '@/components/Chatbot';
import { PriceOptimizationTab } from '@/components/PriceOptimizationTab';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Analytics Dashboard
            </h1>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top row - Recommendations and Sales Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <section>
            {/* Recommendations */}
            <DashboardWidget />
          </section>
          <section>
            {/* Sales Analytics */}
            <GraphWidget />
          </section>
        </div>
        
        {/* Middle row - Price Optimization */}
        <div className="mb-6">
          <PriceOptimizationTab />
        </div>
        
        {/* Bottom row - Analytics Assistant */}
        <section className="mb-6">
          <Chatbot />
        </section>
      </main>
    </div>
  );
}
