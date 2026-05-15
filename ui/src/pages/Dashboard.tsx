import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, XCircle, Clock, Users, MapPin, Zap, TrendingUp, Mail, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import clsx from "clsx";

interface Metrics {
  health: "healthy" | "degraded" | "offline";
  queue: { depth: number; pelCount: number; consumerCount: number };
  workers: { count: number; alive: boolean };
  executions: { tracked: number };
  today: {
    executions: number; policy_blocked: number; skill_success: number; skill_fail: number;
    prospects_found: number; emails_sent: number; sms_sent: number; calls_booked: number;
  };
  prospects: { total: number; new: number; outreached: number; responded: number; converted: number; do_not_outreach: number };
  territory: { totalTracked: number; exhausted: number; available: number; totalProspectsFound: number };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; calls: number; costUSD: number };
  timestamp: string;
}

interface Worker { workerId: string; lastSeen: string; pid: number }
interface ActivityEvent {
  id: string; timestamp: string;
  level: "info" | "success" | "warn" | "error";
  category: string; message: string;
}

const LEVEL_STYLES = {
  info:    { bar: "bg-blue-500",   text: "text-blue-400",   dot: "bg-blue-400" },
  success: { bar: "bg-green-500",  text: "text-green-400",  dot: "bg-green-400" },
  warn:    { bar: "bg-yellow-500", text: "text-yellow-400", dot: "bg-yellow-400" },
  error:   { bar: "bg-red-500",    text: "text-red-400",    dot: "bg-red-400" },
};

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon: any; accent?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
        <Icon className={clsx("w-4 h-4", accent ?? "text-gray-500")} />
      </div>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    queryFn: () => fetch("/api/metrics").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: workersData } = useQuery<{ workers: Worker[]; count: number; healthy: boolean }>({
    queryKey: ["/api/workers"],
    queryFn: () => fetch("/api/workers").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: activityData } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["/api/activity"],
    queryFn: () => fetch("/api/activity?limit=30").then(r => r.json()),
    refetchInterval: 5_000,
  });

  if (isLoading) return (
    <div className="p-8 flex items-center gap-3 text-gray-500">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );

  if (!metrics) return (
    <div className="p-8">
      <div className="bg-red-950 border border-red-800 rounded-xl p-5 flex items-center gap-3 text-red-300">
        <XCircle className="w-5 h-5 shrink-0" />
        Cannot reach admin API. Start the agents platform first.
      </div>
    </div>
  );

  const health = metrics.health;
  const today = metrics.today;
  const usage = metrics.usage;
  const successRate = (today.skill_success + today.skill_fail) > 0
    ? Math.round((today.skill_success / (today.skill_success + today.skill_fail)) * 100)
    : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">AI Lead Execution Control Plane — V1.7</p>
        </div>
        <div className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold",
          health === "healthy" ? "bg-green-950 border border-green-800 text-green-300" :
          health === "degraded" ? "bg-yellow-950 border border-yellow-800 text-yellow-300" :
          "bg-red-950 border border-red-800 text-red-300"
        )}>
          {health === "healthy" ? <CheckCircle className="w-4 h-4" /> :
           health === "degraded" ? <AlertTriangle className="w-4 h-4" /> :
           <XCircle className="w-4 h-4" />}
          System {health.charAt(0).toUpperCase() + health.slice(1)}
        </div>
      </div>

      {/* Worker status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Worker Status</p>
          <span className={clsx("text-xs font-semibold", metrics.workers.alive ? "text-green-400" : "text-red-400")}>
            {metrics.workers.alive ? `${metrics.workers.count} Online` : "OFFLINE"}
          </span>
        </div>
        {workersData?.workers.length ? (
          <div className="flex gap-3 flex-wrap">
            {workersData.workers.map(w => (
              <div key={w.workerId} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-gray-300">{w.workerId}</span>
                <span className="text-gray-500">·</span>
                <Clock className="w-3 h-3 text-gray-500" />
                <span className="text-gray-500">{formatDistanceToNow(parseISO(w.lastSeen), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4" />
            No workers running — queue is not being processed
          </div>
        )}
      </div>

      {/* Today's stats */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Today</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Executions"     value={today.executions}      sub={`${today.policy_blocked} blocked`}   icon={Zap}            accent="text-blue-400" />
          <StatCard label="Prospects Found" value={today.prospects_found} sub={`${metrics.prospects.total} total`} icon={Users}           accent="text-purple-400" />
          <StatCard label="Emails Sent"    value={today.emails_sent}     sub={`${today.sms_sent} SMS`}             icon={Mail}            accent="text-indigo-400" />
          <StatCard label="Success Rate"   value={`${successRate}%`}     sub={`${today.skill_success} ok · ${today.skill_fail} fail`} icon={TrendingUp} accent={successRate >= 80 ? "text-green-400" : "text-yellow-400"} />
        </div>
      </div>

      {/* API Token usage today */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">API Usage Today</p>
          <span className="text-xs text-gray-500">{usage.calls} calls</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xl font-black">{usage.totalTokens.toLocaleString()}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">tokens used</p>
          </div>
          <div>
            <p className="text-xl font-black text-[#FFC107]">${usage.costUSD.toFixed(4)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">cost today</p>
          </div>
          <div>
            <p className="text-xl font-black">{usage.inputTokens.toLocaleString()}<span className="text-sm font-normal text-gray-500"> in</span></p>
            <p className="text-[11px] text-gray-500 mt-0.5">{usage.outputTokens.toLocaleString()} out</p>
          </div>
        </div>
      </div>

      {/* Bottom: Prospect funnel + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Prospect funnel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">Prospect Funnel</p>
          {[
            { label: "New",          val: metrics.prospects.new,           color: "bg-blue-500",   pct: metrics.prospects.total },
            { label: "Outreached",   val: metrics.prospects.outreached,    color: "bg-yellow-500", pct: metrics.prospects.total },
            { label: "Responded",    val: metrics.prospects.responded,     color: "bg-purple-500", pct: metrics.prospects.total },
            { label: "Converted",    val: metrics.prospects.converted,     color: "bg-green-500",  pct: metrics.prospects.total },
            { label: "Do Not Outreach", val: metrics.prospects.do_not_outreach, color: "bg-red-500", pct: metrics.prospects.total },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3 mb-2">
              <span className="text-xs text-gray-400 w-28 shrink-0">{row.label}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div
                  className={clsx("h-2 rounded-full transition-all", row.color)}
                  style={{ width: row.pct > 0 ? `${(row.val / row.pct) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-xs font-bold text-gray-300 w-6 text-right">{row.val}</span>
            </div>
          ))}
        </div>

        {/* Live activity feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Live Activity</p>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {!activityData?.events.length ? (
              <p className="text-sm text-gray-600 py-4 text-center">No activity yet</p>
            ) : activityData.events.map(e => {
              const s = LEVEL_STYLES[e.level] ?? LEVEL_STYLES.info;
              return (
                <div key={e.id} className="flex gap-2 items-start text-xs">
                  <div className={clsx("w-1 rounded-full shrink-0 mt-1", s.bar)} style={{ height: "12px" }} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx("font-medium truncate", s.text)}>{e.message}</p>
                    <p className="text-gray-600 text-[10px]">{formatDistanceToNow(parseISO(e.timestamp), { addSuffix: true })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PEL warning */}
      {metrics.queue.pelCount > 0 && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-300">
            <strong>{metrics.queue.pelCount}</strong> messages stuck in PEL.
            Go to <strong>Executions → Stuck (PEL)</strong> to retry them.
          </p>
        </div>
      )}
    </div>
  );
}
