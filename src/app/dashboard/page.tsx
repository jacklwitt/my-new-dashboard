import React from 'react';
import { DashboardWidget } from '@/components/DashboardWidget';
import { Chatbot } from '@/components/Chatbot'; // Adjust path if needed

export default function DashboardPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard!</p>
      <div className="grid grid-cols-1 gap-4">
        {/* Render the dashboard recommendations widget */}
        <DashboardWidget />
        {/* Render the Chatbot component */}
        <Chatbot />
      </div>
    </main>
  );
}
