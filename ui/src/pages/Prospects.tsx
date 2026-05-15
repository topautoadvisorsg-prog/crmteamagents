import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, RefreshCw, Phone, Mail, Building2, Ban, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import clsx from "clsx";

type ProspectStatus = "new" | "outreached" | "responded" | "converted" | "do_not_outreach";

interface Prospect {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string;
  agentId: string | null;
  status: ProspectStatus;
  notes: string | null;
  outreachedAt: string | null;
  respondedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<ProspectStatus, { label: string; color: string; dot: string }> = {
  new:             { label: "New",          color: "bg-blue-900 text-blue-300",   dot: "bg-blue-400" },
  outreached:      { label: "Outreached",   color: "bg-yellow-900 text-yellow-300", dot: "bg-yellow-400" },
  responded:       { label: "Responded",    color: "bg-purple-900 text-purple-300", dot: "bg-purple-400" },
  converted:       { label: "Converted",    color: "bg-green-900 text-green-300",  dot: "bg-green-400" },
  do_not_outreach: { label: "DNO",          color: "bg-red-900 text-red-300",     dot: "bg-red-400" },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "outreached", label: "Outreached" },
  { key: "responded", label: "Responded" },
  { key: "converted", label: "Converted" },
  { key: "do_not_outreach", label: "DNO" },
];

export default function Prospects() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ data: Prospect[]; total: number }>({
    queryKey: ["/api/prospects", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      return fetch(`/api/prospects?${params}`).then(r => r.json());
    },
  });

  const prospects = data?.data ?? [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black">Prospect Pool</h1>
        <p className="text-sm text-gray-500 mt-1">
          Leads found by agents — Redis dedup store. {data?.total ?? 0} total.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-blue"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                statusFilter === tab.key
                  ? "bg-brand-blue text-white"
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading prospects…
        </div>
      ) : prospects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-600">
          <Users className="w-10 h-10" />
          <p className="text-sm">No prospects found</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Name / Company</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Contact</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Source</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Found</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p, i) => {
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.new;
                return (
                  <tr
                    key={p.id}
                    className={clsx("border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors", i % 2 === 0 && "bg-gray-900/50")}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-100">{p.name ?? <span className="text-gray-600 italic">Unknown</span>}</p>
                      {p.company && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-400">{p.company}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <Phone className="w-3 h-3 text-gray-500 shrink-0" />
                          <span className="font-mono text-xs">{p.phone}</span>
                        </div>
                      )}
                      {p.email && (
                        <div className="flex items-center gap-1.5 text-gray-300 mt-0.5">
                          <Mail className="w-3 h-3 text-gray-500 shrink-0" />
                          <span className="text-xs truncate max-w-[160px]">{p.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-gray-400 font-mono">{p.source}</span>
                      {p.agentId && <p className="text-[10px] text-gray-600 mt-0.5">{p.agentId}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", cfg.color)}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                      {formatDistanceToNow(parseISO(p.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4 max-w-[180px]">
                      {p.notes ? (
                        <span className="text-xs text-gray-400 truncate block" title={p.notes}>{p.notes}</span>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
