import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // Always open sidebar on desktop
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} />
      
      {/* Mobile Header */}
      {isMobile && (
        <div className="mobile-header">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            data-testid="open-sidebar-button"
          >
            <Menu size={24} className="text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-[#14532D]">FreshFlow</h1>
          <div className="w-10"></div>
        </div>
      )}
      
      <div className="main-content">
        <div className="p-4 md:p-6 lg:p-8">
          {title && (
            <div className="mb-4 md:mb-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#14532D]" data-testid="page-title">{title}</h1>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
