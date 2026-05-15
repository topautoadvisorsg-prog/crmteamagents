import { useQuery } from "@tanstack/react-query";
import { Activity, Users, MapPin, AlertTriangle, CheckCircle, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";

interface Metrics {
  queue: { depth: number; pelCount: number; consumerCount: number };
  executions: { tracked: number };
  prospects: { total: number; new: number; outreached: number; responded: number; converted: number; do_not_outreach: number };
  territory: { totalTracked: number; exhausted: number; available: number; totalProspectsFound: number };
  timestamp: string;
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: number | string; sub?: string; color: string; icon: any;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <span className={clsx("p-2 rounded-lg", color)}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className="text-3xl font-black">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function ProspectBar({ data }: { data: Metrics["prospects"] }) {
  const total = data.total || 1;
  const segments = [
    { key: "new", label: "New", color: "bg-blue-500", count: data.new },
    { key: "outreached", label: "Outreached", color: "bg-yellow-500", count: data.outreached },
    { key: "responded", label: "Responded", color: "bg-purple-500", count: data.responded },
    { key: "converted", label: "Converted", color: "bg-green-500", count: data.converted },
    { key: "do_not_outreach", label: "DNO", color: "bg-red-500", count: data.do_not_outreach },
  ];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Prospect Pipeline</p>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
        {segments.map(s => (
          <div
            key={s.key}
            className={clsx(s.color, "transition-all")}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {segments.map(s => (
          <div key={s.key} className="text-center">
            <div className={clsx("w-2 h-2 rounded-full mx-auto mb-1", s.color)} />
            <p className="text-lg font-bold">{s.count}</p>
            <p className="text-[10px] text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading, error, dataUpdatedAt } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    queryFn: () => fetch("/api/metrics").then(r => r.json()),
  });

  if (isLoading) return (
    <div className="p-8 flex items-center gap-3 text-gray-500">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading metrics...
    </div>
  );

  if (error || !metrics) return (
    <div className="p-8">
      <div className="bg-red-950 border border-red-800 rounded-xl p-5 text-red-300 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        Cannot reach admin API. Is the agents platform running?
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">AI Lead Execution Control Plane — V1.7</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          Updated {dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : "—"}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Queue Depth"
          value={metrics.queue.depth}
          sub={`${metrics.queue.pelCount} stuck in PEL`}
          color={metrics.queue.pelCount > 0 ? "bg-yellow-900 text-yellow-400" : "bg-gray-800 text-gray-400"}
          icon={Activity}
        />
        <StatCard
          label="Total Prospects"
          value={metrics.prospects.total}
          sub={`${metrics.prospects.converted} converted`}
          color="bg-blue-900 text-blue-400"
          icon={Users}
        />
        <StatCard
          label="ZIPs Exhausted"
          value={metrics.territory.exhausted}
          sub={`${metrics.territory.totalTracked} total tracked`}
          color="bg-purple-900 text-purple-400"
          icon={MapPin}
        />
        <StatCard
          label="Active Workers"
          value={metrics.queue.consumerCount}
          sub={`${metrics.executions.tracked} executions tracked`}
          color={metrics.queue.consumerCount > 0 ? "bg-green-900 text-green-400" : "bg-gray-800 text-gray-400"}
          icon={CheckCircle}
        />
      </div>

      {/* Prospect pipeline bar */}
      <ProspectBar data={metrics.prospects} />

      {/* PEL warning */}
      {metrics.queue.pelCount > 0 && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-yellow-300">{metrics.queue.pelCount} messages stuck in PEL</p>
            <p className="text-sm text-yellow-500 mt-1">
              These executions started but were never acknowledged. Go to <strong>Executions</strong> to retry them.
            </p>
          </div>
        </div>
      )}

      {/* Territory coverage */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Territory Coverage</p>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-3xl font-black text-purple-400">{metrics.territory.exhausted}</p>
            <p className="text-xs text-gray-500 mt-1">ZIP codes exhausted</p>
          </div>
          <div>
            <p className="text-3xl font-black text-green-400">{metrics.territory.available}</p>
            <p className="text-xs text-gray-500 mt-1">back in rotation</p>
          </div>
          <div>
            <p className="text-3xl font-black text-brand-yellow">{metrics.territory.totalProspectsFound}</p>
            <p className="text-xs text-gray-500 mt-1">total prospects found via territory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
