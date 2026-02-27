import React from 'react';
import { Link } from 'react-router-dom';
import {
  Home,
  Send,
  RefreshCw,
  Users,
  Sparkles,
  LayoutTemplate,
  Grid,
  Settings,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Inbox,
  PlugZap,
  Kanban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '../Logo';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const Sidebar = ({ activeTab, onTabChange, isCollapsed, toggleSidebar }: SidebarProps) => {
  const navSections = [
    {
      label: 'Core',
      items: [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'campaigns', label: 'Campaigns', icon: Send },
        { id: 'inbox', label: 'Inbox', icon: Inbox }
      ]
    },
    {
      label: 'Engage',
      items: [
        { id: 'automations', label: 'Automations', icon: RefreshCw },
        { id: 'contacts', label: 'Contacts', icon: Users },
        { id: 'pipeline', label: 'Pipeline', icon: Kanban },
        { id: 'segments', label: 'Segments', icon: Sparkles, badge: 'Beta' }
      ]
    },
    {
      label: 'Assets',
      items: [
        { id: 'templates', label: 'Templates', icon: LayoutTemplate },
        { id: 'connect', label: 'Connect site', icon: Grid, hasSubmenu: true }
      ]
    },
    {
      label: 'System',
      items: [
        { id: 'integrations', label: 'Integrations', icon: PlugZap },
        { id: 'settings', label: 'Settings', icon: Settings, hasSubmenu: true }
      ]
    }
  ];

  return (
    <aside className={cn(
      "bg-[var(--shell-surface)] border-r border-[var(--shell-border)] flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300 shadow-[8px_0_30px_rgba(15,23,42,0.06)]",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("p-6 flex items-center gap-2", isCollapsed && "justify-center px-2")}>
        <Logo 
          showText={!isCollapsed} 
          textClassName="text-xl text-[var(--shell-ink)]"
        />
      </div>


      <button
        type="button"
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-white/90 border border-[var(--shell-border)] rounded-full p-1 shadow-sm hover:bg-white z-40"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4 text-[var(--shell-muted)]" /> : <ChevronLeft className="h-4 w-4 text-[var(--shell-muted)]" />}
      </button>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4 last:mb-0">
            {!isCollapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = activeTab === item.id;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onTabChange(item.id)}
                      className={cn(
                        "group relative w-full flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                        isActive
                          ? "bg-emerald-50/80 text-emerald-900 shadow-[0_8px_16px_rgba(16,185,129,0.15)]"
                          : "text-slate-600 hover:bg-white/80 hover:text-slate-900",
                        isCollapsed ? "justify-center px-2" : "justify-between"
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full transition-colors",
                          isActive ? "bg-emerald-500" : "bg-transparent"
                        )}
                      ></span>
                      <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors",
                            isActive ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-600"
                          )}
                        />
                        {!isCollapsed && <span>{item.label}</span>}
                      </div>
                      {!isCollapsed && item.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 rounded border border-amber-200">
                          {item.badge}
                        </span>
                      )}
                      {!isCollapsed && item.hasSubmenu && (
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[var(--shell-border)]">
        <Link
          to="/profile"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-white/80 transition-colors",
            isCollapsed && "justify-center"
          )}
          title={isCollapsed ? "Go to Profile" : undefined}
        >
          {!isCollapsed && <span>Go to Profile</span>}
          <ExternalLink className={cn("h-4 w-4 text-slate-400", !isCollapsed && "ml-auto")} />
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;
