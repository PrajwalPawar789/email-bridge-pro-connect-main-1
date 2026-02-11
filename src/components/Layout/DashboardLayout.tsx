import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: any;
  onLogout: () => void;
  contentClassName?: string;
}

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'dashboard:sidebar-collapsed';

const DashboardLayout = ({ 
  children, 
  activeTab, 
  onTabChange, 
  user, 
  onLogout,
  contentClassName
}: DashboardLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSE_STORAGE_KEY,
        String(isSidebarCollapsed)
      );
    } catch {
      // Ignore storage failures (e.g. privacy mode).
    }
  }, [isSidebarCollapsed]);
  const layoutStyles = {
    ['--shell-bg' as any]:
      'radial-gradient(circle at 12% 15%, rgba(16, 185, 129, 0.12), transparent 55%), radial-gradient(circle at 88% 10%, rgba(245, 158, 11, 0.14), transparent 50%), linear-gradient(180deg, #f6f4ef 0%, #f1f5f4 55%, #ffffff 100%)',
    ['--shell-surface' as any]: 'rgba(255, 255, 255, 0.9)',
    ['--shell-surface-strong' as any]: 'rgba(255, 255, 255, 0.98)',
    ['--shell-border' as any]: 'rgba(148, 163, 184, 0.35)',
    ['--shell-ink' as any]: '#0f172a',
    ['--shell-muted' as any]: '#64748b',
    ['--shell-accent' as any]: '#0f766e',
    ['--shell-warm' as any]: '#f59e0b',
    ['--shell-font-display' as any]: '"Sora", sans-serif',
    ['--shell-font-body' as any]: '"IBM Plex Sans", sans-serif',
    fontFamily: 'var(--shell-font-body)'
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[var(--shell-bg)] text-[var(--shell-ink)]" style={layoutStyles}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap');
      `}</style>
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        isCollapsed={isSidebarCollapsed}
        toggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <div className={cn(
        "fixed top-0 right-0 z-20 transition-all duration-300",
        isSidebarCollapsed ? "left-20" : "left-64"
      )}>
        <Header user={user} onLogout={onLogout} activeTab={activeTab} />
      </div>
      
      <main className={cn(
        "pt-16 min-h-screen transition-all duration-300",
        isSidebarCollapsed ? "pl-20" : "pl-64"
      )}>
        <div className={cn("p-8 max-w-7xl mx-auto", contentClassName)}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
