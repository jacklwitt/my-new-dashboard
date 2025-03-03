import React from 'react';
import { DashboardWidget } from '@/components/DashboardWidget';
import { GraphWidget } from '@/components/GraphWidget';
import { Chatbot } from '@/components/Chatbot'; // Adjust path if needed

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
      
      {/* Main Content - Increased max width */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Adjusted grid for more space */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Give recommendations more space */}
          <section className="lg:col-span-5 flex flex-col">
            <DashboardWidget />
          </section>
          
          {/* Make analytics less vertical space */}
          <section className="lg:col-span-7 flex flex-col">
            <GraphWidget />
          </section>
        </div>
        
        {/* Chat Assistant */}
        <section className="mt-8">
          <Chatbot />
        </section>
      </main>
    </div>
  );
}
