import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import LanguageSwitcher from './LanguageSwitcher';
import { Menu } from 'lucide-react';

export default function Layout({ children, title, hideTitle, hideSidebar, statusComponent }) {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // Always open sidebar on desktop (unless hidden)
      if (window.innerWidth >= 768 && !hideSidebar) {
        setSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [hideSidebar]);

  return (
    <div className={`dashboard-layout ${hideSidebar ? 'sidebar-hidden' : ''}`}>
      {!hideSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} />
      )}
      
      {/* Mobile Header */}
      {isMobile && !hideSidebar && (
        <div className="mobile-header flex items-center justify-between px-3 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="hover:bg-gray-100 rounded-lg p-1"
            data-testid="open-sidebar-button"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-gray-700" />
          </button>
          <h1 className="font-bold text-[#14532D] text-sm">{t('app.title')}</h1>
          <div className="scale-90">
            <LanguageSwitcher />
          </div>
        </div>
      )}
      
      <div className={`main-content ${hideSidebar ? 'w-full ml-0' : ''}`}>
        {/* Desktop Header with Language Switcher */}
        {!isMobile && (
          <div className="flex justify-end items-center p-3 border-b border-gray-200 bg-white shadow-sm" data-testid="desktop-header">
            <LanguageSwitcher />
          </div>
        )}
        <div className="p-4 md:p-6 lg:p-8">
          {title && !hideTitle && (
            <div className="mb-4 md:mb-8 flex flex-col md:flex-row items-center justify-center gap-4">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#14532D]" data-testid="page-title">{title}</h1>
              {statusComponent && statusComponent}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
