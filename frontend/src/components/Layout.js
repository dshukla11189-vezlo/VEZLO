import React from 'react';
import Sidebar from './Sidebar';

export default function Layout({ children, title }) {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="p-6 md:p-8 lg:p-10">
          {title && (
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-[#14532D]" data-testid="page-title">{title}</h1>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}