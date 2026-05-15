import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Activity, Map, BarChart3, Zap } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Prospects from "./pages/Prospects";
import Executions from "./pages/Executions";
import Territory from "./pages/Territory";
import Analytics from "./pages/Analytics";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

const navItems = [
  { to: "/", label: "Dashboard",    icon: LayoutDashboard },
  { to: "/prospects", label: "Prospect Pool", icon: Users },
  { to: "/executions", label: "Executions",   icon: Activity },
  { to: "/territory",  label: "Territory",    icon: Map },
  { to: "/analytics",  label: "Analytics",    icon: BarChart3 },
];

interface Metrics {
  health: "healthy" | "degraded" | "offline";
  workers: { count: number; alive: boolean };
}

function Sidebar() {
  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    queryFn: () => fetch("/api/metrics").then(r => r.json()),
  });

  const health = metrics?.health ?? "offline";
  const healthColor = health === "healthy" ? "bg-green-500" : health === "degraded" ? "bg-yellow-500" : "bg-red-500";
  const healthLabel = health === "healthy" ? "Healthy" : health === "degraded" ? "Degraded" : "Offline";

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🤖</span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#FFC107]">SmartKlix</p>
            <p className="text-[10px] text-gray-400 leading-none">Agent Control</p>
          </div>
        </div>
        {/* System health badge */}
        <div className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold",
          health === "healthy" ? "bg-green-950 text-green-300" :
          health === "degraded" ? "bg-yellow-950 text-yellow-300" :
          "bg-red-950 text-red-300"
        )}>
          <span className={clsx("w-2 h-2 rounded-full animate-pulse", healthColor)} />
          {healthLabel}
          {metrics?.workers.count !== undefined && (
            <span className="ml-auto text-[10px] opacity-70">{metrics.workers.count}w</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#1565C0] text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Live indicator */}
      <div className="px-5 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Zap className="w-3 h-3 text-[#FFC107]" />
          Auto-refresh every 15s
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/prospects"  element={<Prospects />} />
            <Route path="/executions" element={<Executions />} />
            <Route path="/territory"  element={<Territory />} />
            <Route path="/analytics"  element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
