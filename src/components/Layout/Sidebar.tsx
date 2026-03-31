import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Home,
  Send,
  RefreshCw,
  Users,
  Sparkles,
  Mail,
  LayoutTemplate,
  Globe,
  Settings,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Kanban,
  Gift,
  ShieldCheck,
  Search,
  LifeBuoy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import Logo from '../Logo';
import SidebarNotifications from './SidebarNotifications';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  toggleSidebar: () => void;
  user: {
    id?: string;
  } | null;
}

type SidebarNavChild = {
  id: string;
  label: string;
};

type SidebarNavItem = {
  id: string;
  label: string;
  icon: typeof Home;
  badge?: string;
  submenuItems?: SidebarNavChild[];
};

const SIDEBAR_SCROLL_STORAGE_KEY = 'dashboard:sidebar-scroll-top';

const readSidebarScrollTop = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
};

const writeSidebarScrollTop = (scrollTop: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SIDEBAR_SCROLL_STORAGE_KEY,
      String(Math.max(0, Math.round(scrollTop)))
    );
  } catch {
    // Ignore storage failures.
  }
};

const Sidebar = ({ activeTab, onTabChange, isCollapsed, toggleSidebar, user }: SidebarProps) => {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const teamRolesEnabled = workspace ? workspace.planFeatures?.teamRoles !== false : true;
  const navRef = useRef<HTMLElement | null>(null);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    settings: activeTab === 'settings' || activeTab === 'integrations',
  });

  useEffect(() => {
    if (activeTab === 'settings' || activeTab === 'integrations') {
      setOpenSubmenus((prev) => ({ ...prev, settings: true }));
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    const navElement = navRef.current;
    if (!navElement || typeof window === 'undefined') return;

    const restoreScrollPosition = () => {
      navElement.scrollTop = readSidebarScrollTop();
    };

    restoreScrollPosition();
    const frameId = window.requestAnimationFrame(restoreScrollPosition);

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement) return;

    const persistScrollPosition = () => {
      writeSidebarScrollTop(navElement.scrollTop);
    };

    persistScrollPosition();
    navElement.addEventListener('scroll', persistScrollPosition, { passive: true });

    return () => {
      persistScrollPosition();
      navElement.removeEventListener('scroll', persistScrollPosition);
    };
  }, []);

  const handleNavigation = (itemId: string) => {
    if (itemId === 'referrals') {
      navigate('/referrals');
      return;
    }
    if (itemId === 'team') {
      navigate('/team');
      return;
    }
    onTabChange(itemId);
  };

  const navSections: Array<{ label: string; items: SidebarNavItem[] }> = [
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
        { id: 'find', label: 'Find', icon: Search },
        { id: 'pipeline', label: 'Pipeline', icon: Kanban },
        { id: 'referrals', label: 'Referrals', icon: Gift },
        { id: 'segments', label: 'Segments', icon: Sparkles, badge: 'Beta' }
      ]
    },
    {
      label: 'Assets',
      items: [
        { id: 'email-builder', label: 'Email Builder', icon: Mail },
        { id: 'landing-pages', label: 'Landing Pages', icon: LayoutTemplate },
        { id: 'site-connector', label: 'Site Connector', icon: Globe }
      ]
    },
    {
      label: 'System',
      items: [
        { id: 'team', label: 'Team', icon: ShieldCheck },
        { id: 'support', label: 'Support', icon: LifeBuoy },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          submenuItems: [
            { id: 'settings', label: 'Email settings' },
            { id: 'integrations', label: 'Integrations' },
          ],
        }
      ]
    }
  ]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !(item.id === 'team' && !teamRolesEnabled)),
    }))
    .filter((section) => section.items.length > 0);

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

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 pb-6">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4 last:mb-0">
            {!isCollapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const submenuItems = item.submenuItems || [];
                const hasSubmenu = submenuItems.length > 0;
                const submenuActive = submenuItems.some((child) => child.id === activeTab);
                const isActive = activeTab === item.id || submenuActive;
                const isSubmenuOpen = Boolean(openSubmenus[item.id]);

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasSubmenu) {
                          if (isCollapsed) {
                            toggleSidebar();
                          }
                          setOpenSubmenus((prev) => ({
                            ...prev,
                            [item.id]: isCollapsed ? true : !prev[item.id],
                          }));
                          return;
                        }
                        handleNavigation(item.id);
                      }}
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
                      {!isCollapsed && hasSubmenu && (
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-slate-400 transition-transform",
                            isSubmenuOpen && "rotate-90"
                          )}
                        />
                      )}
                    </button>
                    {!isCollapsed && hasSubmenu && isSubmenuOpen && (
                      <div className="mt-1 space-y-1 pl-11 pr-2">
                        {submenuItems.map((child) => {
                          const childIsActive = activeTab === child.id;

                          return (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => handleNavigation(child.id)}
                              className={cn(
                                "w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors",
                                childIsActive
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                              )}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[var(--shell-border)]">
        <div className={cn('flex flex-col gap-2', isCollapsed && 'items-center')}>
          <SidebarNotifications userId={user?.id || null} isCollapsed={isCollapsed} />

          <Link
            to="/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-white/80 transition-colors",
              isCollapsed ? "h-9 w-9 justify-center p-0" : "w-full"
            )}
            title={isCollapsed ? "Go to Profile" : undefined}
          >
            {!isCollapsed && <span>Go to Profile</span>}
            <ExternalLink className={cn("h-4 w-4 text-slate-400", !isCollapsed && "ml-auto")} />
          </Link>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
