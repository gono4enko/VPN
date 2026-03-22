import React from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Users, Globe, Settings, LogOut, TerminalSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from './ui/cyber';

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/profiles", label: "Profiles", icon: Globe },
  { href: "/settings", label: "System", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-transparent text-foreground relative z-0">
      {/* Background Image */}
      <div className="fixed inset-0 z-[-1] pointer-events-none">
        <img 
          src={`${import.meta.env.BASE_URL}images/cyber-bg.png`} 
          className="w-full h-full object-cover opacity-15 mix-blend-screen" 
          alt="Cyber background" 
        />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-full md:w-64 md:h-screen border-r border-primary/20 bg-card/50 backdrop-blur-md flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-primary/20">
          <div className="w-10 h-10 bg-primary/20 border border-primary flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,212,170,0.4)]">
            <TerminalSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary font-display tracking-widest leading-none shadow-primary">XRAY</h1>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Control_Panel</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 font-display uppercase tracking-wider transition-all duration-300 border-l-2",
                  isActive 
                    ? "bg-primary/10 text-primary border-primary shadow-[inset_4px_0_0_rgba(0,212,170,1)]" 
                    : "text-muted-foreground border-transparent hover:bg-white/5 hover:text-foreground hover:border-primary/50"
                )}>
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-primary/20">
          <button 
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full font-display uppercase tracking-wider text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 border-l-2 border-transparent hover:border-destructive text-left"
          >
            <LogOut className="w-5 h-5" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto relative">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
