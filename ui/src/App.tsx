import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Activity, Map, BarChart3, Settings, Bot, Zap, Menu, X } from "lucide-react";
import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Prospects from "./pages/Prospects";
import Executions from "./pages/Executions";
import Territory from "./pages/Territory";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/Settings";
import Agents from "./pages/Agents";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

const navItems = [
  { to: "/",            label: "Dashboard",    icon: LayoutDashboard, section: "main" },
  { to: "/agents",      label: "Agents",       icon: Bot,             section: "main" },
  { to: "/prospects",   label: "Prospects",    icon: Users,           section: "main" },
  { to: "/executions",  label: "Executions",   icon: Activity,        section: "main" },
  { to: "/territory",   label: "Territory",    icon: Map,             section: "main" },
  { to: "/analytics",   label: "Analytics",    icon: BarChart3,       section: "main" },
  { to: "/settings",    label: "Settings",     icon: Settings,        section: "bottom" },
];

interface Metrics {
  health: "healthy" | "degraded" | "offline";
  workers: { count: number; alive: boolean };
  queue: { pelCount: number };
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    queryFn: () => fetch("/api/metrics").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const health = metrics?.health ?? "offline";
  const healthColor = health === "healthy" ? "bg-green-500" : health === "degraded" ? "bg-yellow-500" : "bg-red-500";
  const healthLabel = health === "healthy" ? "Healthy" : health === "degraded" ? "Degraded" : "Offline";

  const mainItems = navItems.filter(n => n.section === "main");
  const bottomItems = navItems.filter(n => n.section === "bottom");

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white leading-none">SmartKlix</p>
              <p className="text-[10px] text-gray-500 leading-none mt-0.5">Agent Control</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 lg:hidden">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* System health */}
        <div className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold",
          health === "healthy" ? "bg-green-950 text-green-300" :
          health === "degraded" ? "bg-yellow-950 text-yellow-300" :
          "bg-red-950 text-red-300"
        )}>
          <span className={clsx("w-2 h-2 rounded-full animate-pulse shrink-0", healthColor)} />
          <span>{healthLabel}</span>
          {metrics?.workers.count !== undefined && (
            <span className="ml-auto text-[10px] opacity-70">{metrics.workers.count} worker{metrics.workers.count !== 1 ? "s" : ""}</span>
          )}
        </div>
        {/* PEL warning dot */}
        {(metrics?.queue?.pelCount ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            {metrics!.queue.pelCount} stuck message{metrics!.queue.pelCount !== 1 ? "s" : ""} in queue
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {mainItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-blue text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-3 border-t border-gray-800 pt-3 space-y-0.5">
        {bottomItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-blue text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600">
          <Zap className="w-3 h-3 text-brand-yellow" />
          Auto-refresh 15s
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-950">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex flex-col sticky top-0 h-screen">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="relative z-50">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 sticky top-0 z-30">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-200">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-brand-blue" />
              <span className="text-sm font-black text-white">SmartKlix Agents</span>
            </div>
          </div>

          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/"            element={<Dashboard />} />
              <Route path="/agents"      element={<Agents />} />
              <Route path="/prospects"   element={<Prospects />} />
              <Route path="/executions"  element={<Executions />} />
              <Route path="/territory"   element={<Territory />} />
              <Route path="/analytics"   element={<Analytics />} />
              <Route path="/settings"    element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
