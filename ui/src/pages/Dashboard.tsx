import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle, XCircle, Clock, Users, MapPin, Zap,
  TrendingUp, Mail, MessageSquare, RefreshCw, Send, ChevronRight,
  Activity, DollarSign, Phone, AtSign, Search, Play, Bot,
  Globe, PhoneCall, ArrowRight, Info
} from "lucide-react";
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

// ── Test Lead Panel ───────────────────────────────────────
function TestLeadPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "John Smith",
    phone: "+13055550001",
    email: "",
    company: "ABC Roofing",
    zip: "33101",
    city: "Miami",
    state: "FL",
  });
  const [result, setResult] = useState<{ trace_id?: string; status?: string; message?: string; error?: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (body: any) =>
      fetch("/api/test-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: (data) => setResult(data),
    onError: (err: any) => setResult({ error: err.message }),
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-brand-yellow" />
          <span className="text-sm font-bold text-gray-200">Fire Test Lead</span>
          <span className="text-xs text-gray-500">— push a synthetic lead through the full pipeline</span>
        </div>
        <ChevronRight className={clsx("w-4 h-4 text-gray-500 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "name",    label: "Name",    icon: Users,    placeholder: "John Smith" },
              { key: "company", label: "Company", icon: Users,    placeholder: "ABC Roofing" },
              { key: "phone",   label: "Phone",   icon: Phone,    placeholder: "+13055550001" },
              { key: "email",   label: "Email",   icon: AtSign,   placeholder: "john@example.com" },
              { key: "city",    label: "City",    icon: MapPin,   placeholder: "Miami" },
              { key: "zip",     label: "ZIP",     icon: MapPin,   placeholder: "33101" },
            ].map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <div className="relative">
                  <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                  <input
                    type="text"
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">Provide at least phone OR email. This bypasses ingestion auth and fires directly into the pipeline for testing.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setResult(null); mutation.mutate(form); }}
              disabled={mutation.isPending || (!form.phone && !form.email)}
              className="flex items-center gap-2 px-5 py-2 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {mutation.isPending ? "Firing…" : "Fire Lead"}
            </button>
            {result && (
              <button onClick={() => setResult(null)} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            )}
          </div>
          {result && (
            <div className={clsx("rounded-lg p-4 text-sm border", result.error || result.status === "error"
              ? "bg-red-950 border-red-800 text-red-300"
              : "bg-green-950 border-green-800 text-green-300"
            )}>
              {result.error ? (
                <p>Error: {result.error}</p>
              ) : (
                <>
                  <p className="font-bold">✓ Lead accepted</p>
                  <p className="text-xs mt-1 font-mono opacity-80">trace_id: {result.trace_id}</p>
                  <p className="text-xs mt-1 opacity-70">{result.message}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pipeline Flow Diagram ─────────────────────────────────
function PipelineFlow({ metrics }: { metrics: Metrics }) {
  const [open, setOpen] = useState(false);
  const p = metrics.prospects;
  const t = metrics.territory;

  const stages = [
    {
      icon: Bot,
      label: "Agent",
      sub: "Defines search",
      stat: null,
      hint: "Go to Agents tab → set Target ZIPs → set Status to Active",
      color: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-900",
    },
    {
      icon: Search,
      label: "ZIP Search",
      sub: "Every 30 min",
      stat: t.totalTracked > 0 ? `${t.totalTracked} ZIPs tracked` : null,
      hint: "Sourcer scans each ZIP for construction companies",
      color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-900",
    },
    {
      icon: Globe,
      label: "No Website",
      sub: "Qualifying filter",
      stat: t.totalProspectsFound > 0 ? `${t.totalProspectsFound} found` : null,
      hint: "Companies discoverable online but without a website = your target",
      color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-900",
    },
    {
      icon: Users,
      label: "Registered",
      sub: "Prospect pool",
      stat: p.total > 0 ? `${p.total} total` : null,
      hint: "Each company is registered and deduplicated",
      color: "text-indigo-400", bg: "bg-indigo-950/40", border: "border-indigo-900",
    },
    {
      icon: Send,
      label: "Outreach",
      sub: "Email / SMS",
      stat: p.outreached > 0 ? `${p.outreached} contacted` : null,
      hint: "Email or SMS sent per your agent template",
      color: "text-green-400", bg: "bg-green-950/40", border: "border-green-900",
    },
    {
      icon: PhoneCall,
      label: "Converted",
      sub: "Call booked",
      stat: p.converted > 0 ? `${p.converted} won` : null,
      hint: "Lead replied → call scheduled → client",
      color: "text-brand-yellow", bg: "bg-yellow-950/30", border: "border-yellow-800",
    },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-brand-blue" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pipeline Flow</span>
          <span className="text-[10px] text-gray-600 ml-1">— how leads move from search to client</span>
        </div>
        <ChevronRight className={clsx("w-4 h-4 text-gray-600 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start gap-2">
            {stages.map((s, i, arr) => (
              <div key={s.label} className="flex items-start gap-2">
                <div
                  className={clsx("flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border min-w-[88px] group relative cursor-default", s.bg, s.border)}
                  title={s.hint}
                >
                  <s.icon className={clsx("w-4 h-4", s.color)} />
                  <p className={clsx("text-xs font-bold", s.color)}>{s.label}</p>
                  <p className="text-[9px] text-gray-500 text-center leading-tight">{s.sub}</p>
                  {s.stat && (
                    <span className={clsx("text-[9px] font-black mt-0.5", s.color)}>{s.stat}</span>
                  )}
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-gray-700 shrink-0 mt-3" />}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-600">
            <span className="text-brand-blue font-semibold">Agents tab</span> → create agent → add target ZIPs → set Active.
            The sourcer runs automatically and fills the Prospects tab.
            Hover each stage to see what it does.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Lead Sourcer Status Panel ─────────────────────────────
interface SourcerStatus {
  running: boolean;
  lastRun: string | null;
  nextRunAt: string;
  intervalMinutes: number;
  mode: "google_places" | "demo";
  googlePlacesConfigured: boolean;
}

function SourcerPanel() {
  const [triggerResult, setTriggerResult] = useState<{ triggered?: boolean; error?: string; message?: string } | null>(null);

  const { data: status, refetch } = useQuery<SourcerStatus>({
    queryKey: ["/api/sourcer/status"],
    queryFn: () => fetch("/api/sourcer/status").then(r => r.json()),
    refetchInterval: 10_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      fetch("/api/sourcer/trigger", { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      setTriggerResult(data);
      setTimeout(() => refetch(), 1500);
    },
    onError: (err: any) => setTriggerResult({ error: err.message }),
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-purple-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Lead Sourcer</p>
          {status && (
            <span className={clsx(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              status.mode === "google_places"
                ? "bg-green-950 text-green-400"
                : "bg-yellow-950 text-yellow-400"
            )}>
              {status.mode === "google_places" ? "Google Places" : "Demo Mode"}
            </span>
          )}
        </div>
        <button
          onClick={() => { setTriggerResult(null); triggerMutation.mutate(); }}
          disabled={triggerMutation.isPending || status?.running}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {status?.running ? "Running…" : triggerMutation.isPending ? "Starting…" : "Run Now"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[11px] text-gray-500 mb-1">Status</p>
          <div className="flex items-center gap-2">
            {status?.running ? (
              <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="font-semibold text-green-400">Searching…</span></>
            ) : (
              <><span className="w-2 h-2 rounded-full bg-gray-600" /><span className="font-semibold text-gray-400">Idle</span></>
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1">Last Run</p>
          <p className="font-semibold text-gray-300 text-xs">
            {status?.lastRun ? formatDistanceToNow(new Date(status.lastRun), { addSuffix: true }) : "Never"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1">Next Run</p>
          <p className="font-semibold text-gray-300 text-xs">
            {status ? `Every ${status.intervalMinutes}min` : "—"}
          </p>
        </div>
      </div>

      {!status?.googlePlacesConfigured && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-yellow-400 bg-yellow-950/50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Running in <strong>demo mode</strong> — realistic fake construction leads.
            Add <code className="bg-black/30 px-1 rounded">GOOGLE_PLACES_API_KEY</code> in Settings to source real leads.
          </span>
        </div>
      )}

      {triggerResult && (
        <div className={clsx(
          "mt-3 rounded-lg px-3 py-2 text-xs border",
          triggerResult.error
            ? "bg-red-950 border-red-800 text-red-300"
            : "bg-green-950 border-green-800 text-green-300"
        )}>
          {triggerResult.error ? `Error: ${triggerResult.error}` : triggerResult.message}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading, dataUpdatedAt } = useQuery<Metrics>({
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
      <RefreshCw className="w-4 h-4 animate-spin" /> Connecting to control plane…
    </div>
  );

  if (!metrics) return (
    <div className="p-8 space-y-4">
      <div className="bg-red-950 border border-red-800 rounded-xl p-5 flex items-start gap-3 text-red-300">
        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Cannot reach the admin API</p>
          <p className="text-sm mt-1 opacity-80">Make sure the agents platform is running and Redis is connected. Check the Settings page for integration status.</p>
        </div>
      </div>
      <TestLeadPanel />
    </div>
  );

  const health = metrics.health;
  const today = metrics.today;
  const usage = metrics.usage;
  const successRate = (today.skill_success + today.skill_fail) > 0
    ? Math.round((today.skill_success / (today.skill_success + today.skill_fail)) * 100)
    : null;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Control Plane</h1>
          <p className="text-sm text-gray-500 mt-1">
            System status and live activity
            {dataUpdatedAt > 0 && <span className="ml-2 text-gray-600">· refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}</span>}
          </p>
        </div>
        <div className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border",
          health === "healthy" ? "bg-green-950 border-green-800 text-green-300" :
          health === "degraded" ? "bg-yellow-950 border-yellow-800 text-yellow-300" :
          "bg-red-950 border-red-800 text-red-300"
        )}>
          {health === "healthy" ? <CheckCircle className="w-4 h-4" /> :
           health === "degraded" ? <AlertTriangle className="w-4 h-4" /> :
           <XCircle className="w-4 h-4" />}
          {health === "healthy" ? "System Healthy" : health === "degraded" ? "System Degraded" : "System Offline"}
        </div>
      </div>

      {/* Pipeline flow — always visible so user knows how everything connects */}
      <PipelineFlow metrics={metrics} />

      {/* PEL warning — high priority alert */}
      {metrics.queue.pelCount > 0 && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-yellow-300 font-semibold">
              {metrics.queue.pelCount} message{metrics.queue.pelCount !== 1 ? "s" : ""} stuck in queue
            </p>
            <p className="text-xs text-yellow-400 opacity-70 mt-0.5">These were consumed by a worker that crashed. Go to Executions → Stuck (PEL) to retry them.</p>
          </div>
          <a href="/executions" className="flex items-center gap-1 text-xs font-bold text-yellow-300 hover:text-yellow-100 whitespace-nowrap">
            Fix now <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Worker status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Worker Pool</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Queue: {metrics.queue.depth} pending</span>
            <span className={clsx("text-xs font-semibold", metrics.workers.alive ? "text-green-400" : "text-red-400")}>
              {metrics.workers.alive ? `${metrics.workers.count} worker${metrics.workers.count !== 1 ? "s" : ""} online` : "No workers — queue paused"}
            </span>
          </div>
        </div>
        {workersData?.workers.length ? (
          <div className="flex gap-2 flex-wrap">
            {workersData.workers.map(w => (
              <div key={w.workerId} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-gray-300">{w.workerId}</span>
                <span className="text-gray-500">·</span>
                <Clock className="w-3 h-3 text-gray-500" />
                <span className="text-gray-500">{formatDistanceToNow(parseISO(w.lastSeen), { addSuffix: true })}</span>
                <span className="text-gray-700 text-[10px]">pid:{w.pid}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4" />
            No workers running — start the platform with <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">npm start</code>
          </div>
        )}
      </div>

      {/* Today's stats */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Today's Activity</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Executions"      value={today.executions}       sub={`${today.policy_blocked} blocked by policy`}  icon={Zap}         accent="text-blue-400" />
          <StatCard label="Prospects Found" value={today.prospects_found}  sub={`${metrics.prospects.total} total in pool`}   icon={Users}        accent="text-purple-400" />
          <StatCard label="Emails Sent"     value={today.emails_sent}      sub={`${today.sms_sent} SMS · ${today.calls_booked} calls`} icon={Mail} accent="text-indigo-400" />
          <StatCard
            label="Success Rate"
            value={successRate !== null ? `${successRate}%` : "—"}
            sub={successRate !== null ? `${today.skill_success} ok · ${today.skill_fail} failed` : "No executions yet"}
            icon={TrendingUp}
            accent={successRate === null ? "text-gray-500" : successRate >= 80 ? "text-green-400" : "text-yellow-400"}
          />
        </div>
      </div>

      {/* API usage */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">API Cost Today</p>
          </div>
          <span className="text-xs text-gray-500">{usage.calls} Claude API call{usage.calls !== 1 ? "s" : ""}</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-black text-brand-yellow">${usage.costUSD.toFixed(4)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">today's cost</p>
          </div>
          <div>
            <p className="text-xl font-black">{usage.totalTokens.toLocaleString()}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">tokens used</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-400">{usage.inputTokens.toLocaleString()} in</p>
            <p className="text-sm font-semibold text-gray-400">{usage.outputTokens.toLocaleString()} out</p>
            <p className="text-[11px] text-gray-600 mt-0.5">input / output</p>
          </div>
        </div>
        {usage.calls === 0 && (
          <p className="text-xs text-gray-600 mt-3">No API calls yet today. Fire a test lead to see tokens flow.</p>
        )}
      </div>

      {/* Test Lead Panel */}
      <TestLeadPanel />

      {/* Lead Sourcer Panel */}
      <SourcerPanel />

      {/* Bottom: Prospect funnel + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Prospect funnel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Prospect Funnel</p>
            <span className="text-xs text-gray-500">{metrics.prospects.total} total</span>
          </div>
          {metrics.prospects.total === 0 ? (
            <div className="py-8 text-center">
              <Users className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600">No prospects yet</p>
              <p className="text-xs text-gray-700 mt-1">Fire a test lead above to get started</p>
            </div>
          ) : (
            [
              { label: "New",              val: metrics.prospects.new,            color: "bg-blue-500" },
              { label: "Outreached",       val: metrics.prospects.outreached,     color: "bg-yellow-500" },
              { label: "Responded",        val: metrics.prospects.responded,      color: "bg-purple-500" },
              { label: "Converted",        val: metrics.prospects.converted,      color: "bg-green-500" },
              { label: "Do Not Outreach",  val: metrics.prospects.do_not_outreach, color: "bg-red-500" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-400 w-32 shrink-0">{row.label}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div
                    className={clsx("h-2 rounded-full transition-all", row.color)}
                    style={{ width: metrics.prospects.total > 0 ? `${(row.val / metrics.prospects.total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-300 w-6 text-right">{row.val}</span>
              </div>
            ))
          )}
          {metrics.prospects.total > 0 && (
            <a href="/prospects" className="mt-4 flex items-center gap-1 text-xs text-brand-blue hover:text-blue-400 font-semibold">
              Manage prospects <ChevronRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Live activity feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Live Activity</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600">updates every 5s</span>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {!activityData?.events.length ? (
              <div className="py-8 text-center">
                <Activity className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No activity yet</p>
                <p className="text-xs text-gray-700 mt-1">Activity appears here as agents process leads</p>
              </div>
            ) : activityData.events.map(e => {
              const s = LEVEL_STYLES[e.level] ?? LEVEL_STYLES.info;
              return (
                <div key={e.id} className="flex gap-2.5 items-start text-xs">
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0 mt-1.5", s.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx("font-medium truncate", s.text)}>{e.message}</p>
                    <p className="text-gray-600 text-[10px]">
                      {e.category} · {formatDistanceToNow(parseISO(e.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Territory summary */}
      {metrics.territory.totalTracked > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Territory Coverage</p>
            </div>
            <a href="/territory" className="text-xs text-brand-blue hover:text-blue-400 font-semibold flex items-center gap-1">
              Manage <ChevronRight className="w-3 h-3" />
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div>
              <p className="text-xl font-black">{metrics.territory.totalTracked}</p>
              <p className="text-[11px] text-gray-500">ZIPs tracked</p>
            </div>
            <div>
              <p className="text-xl font-black text-red-400">{metrics.territory.exhausted}</p>
              <p className="text-[11px] text-gray-500">locked (in cooldown)</p>
            </div>
            <div>
              <p className="text-xl font-black text-brand-yellow">{metrics.territory.totalProspectsFound}</p>
              <p className="text-[11px] text-gray-500">total prospects found</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
