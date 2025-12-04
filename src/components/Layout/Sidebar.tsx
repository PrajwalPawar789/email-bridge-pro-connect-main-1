import React from 'react';
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
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const Sidebar = ({ activeTab, onTabChange, isCollapsed, toggleSidebar }: SidebarProps) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'campaigns', label: 'Campaigns', icon: Send },
    { id: 'automations', label: 'Automations', icon: RefreshCw },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'segments', label: 'Segments', icon: Sparkles, badge: 'Beta' },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'connect', label: 'Connect site', icon: Grid, hasSubmenu: true },
    { id: 'settings', label: 'Settings', icon: Settings, hasSubmenu: true },
  ];

  return (
    <aside className={cn(
      "bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("p-6 flex items-center gap-2", isCollapsed && "justify-center px-2")}>
        {/* Logo placeholder - matching the Hostinger style */}
        <div className="flex items-center gap-2 font-bold text-xl text-gray-900">
          <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-none whitespace-nowrap overflow-hidden">
              <span>EmailBridge Pro</span>
              <span className="text-[10px] font-normal text-gray-500 mt-1">by The CIO Vision</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:bg-gray-50 z-40"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <nav className="flex-1 overflow-y-auto py-4 px-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  activeTab === item.id
                    ? "bg-purple-50 text-purple-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  isCollapsed ? "justify-center" : "justify-between"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
                  <item.icon className={cn("h-5 w-5 shrink-0", activeTab === item.id ? "text-purple-700" : "text-gray-500")} />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>
                {!isCollapsed && item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-100 rounded border border-purple-200">
                    {item.badge}
                  </span>
                )}
                {!isCollapsed && item.hasSubmenu && (
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <a 
          href="#" 
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors",
            isCollapsed && "justify-center"
          )}
          title={isCollapsed ? "Go to Profile" : undefined}
        >
          {!isCollapsed && <span>Go to Profile</span>}
          <ExternalLink className={cn("h-4 w-4", !isCollapsed && "ml-auto")} />
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
