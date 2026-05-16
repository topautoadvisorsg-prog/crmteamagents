import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, RefreshCw, Phone, Mail, Building2, Download, ChevronDown, Trash2, Edit3, X, Check } from "lucide-react";
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
  new:             { label: "New",          color: "bg-blue-900 text-blue-300",    dot: "bg-blue-400" },
  outreached:      { label: "Outreached",   color: "bg-yellow-900 text-yellow-300", dot: "bg-yellow-400" },
  responded:       { label: "Responded",    color: "bg-purple-900 text-purple-300", dot: "bg-purple-400" },
  converted:       { label: "Converted",    color: "bg-green-900 text-green-300",  dot: "bg-green-400" },
  do_not_outreach: { label: "DNO",          color: "bg-red-900 text-red-300",      dot: "bg-red-400" },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "outreached", label: "Outreached" },
  { key: "responded", label: "Responded" },
  { key: "converted", label: "Converted" },
  { key: "do_not_outreach", label: "DNO" },
];

const ALL_STATUSES: ProspectStatus[] = ["new", "outreached", "responded", "converted", "do_not_outreach"];

// Inline status + notes editor
function ProspectRow({ p, i, onUpdateStatus, onDelete }: {
  p: Prospect;
  i: number;
  onUpdateStatus: (id: string, status: ProspectStatus, notes?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(p.notes || "");
  const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.new;

  return (
    <tr className={clsx("border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors", i % 2 === 0 && "bg-gray-900/50")}>
      {/* Name / Company */}
      <td className="px-5 py-4">
        <p className="font-semibold text-gray-100">{p.name ?? <span className="text-gray-600 italic">Unknown</span>}</p>
        {p.company && (
          <div className="flex items-center gap-1 mt-0.5">
            <Building2 className="w-3 h-3 text-gray-500" />
            <span className="text-xs text-gray-400">{p.company}</span>
          </div>
        )}
      </td>

      {/* Contact */}
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

      {/* Source */}
      <td className="px-5 py-4">
        <span className="text-xs text-gray-400 font-mono">{p.source}</span>
        {p.agentId && <p className="text-[10px] text-gray-600 mt-0.5">{p.agentId}</p>}
      </td>

      {/* Status — clickable dropdown */}
      <td className="px-5 py-4 relative">
        <button
          onClick={() => setShowMenu(v => !v)}
          className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity", cfg.color)}
        >
          <span className={clsx("w-1.5 h-1.5 rounded-full", cfg.dot)} />
          {cfg.label}
          <ChevronDown className="w-3 h-3" />
        </button>
        {showMenu && (
          <div className="absolute z-20 left-4 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[160px]">
            {ALL_STATUSES.map(s => {
              const c = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  onClick={() => { onUpdateStatus(p.id, s); setShowMenu(false); }}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-700 transition-colors",
                    p.status === s ? "font-bold text-white" : "text-gray-300"
                  )}
                >
                  <span className={clsx("w-2 h-2 rounded-full shrink-0", c.dot)} />
                  {c.label}
                  {p.status === s && <Check className="w-3 h-3 ml-auto text-green-400" />}
                </button>
              );
            })}
          </div>
        )}
        {showMenu && <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />}
      </td>

      {/* Found */}
      <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
        {formatDistanceToNow(parseISO(p.createdAt), { addSuffix: true })}
      </td>

      {/* Notes — inline edit */}
      <td className="px-5 py-4 max-w-[180px]">
        {editingNotes ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { onUpdateStatus(p.id, p.status, notes); setEditingNotes(false); }
                if (e.key === "Escape") { setNotes(p.notes || ""); setEditingNotes(false); }
              }}
              autoFocus
              className="flex-1 px-2 py-1 bg-gray-800 border border-brand-blue rounded text-xs text-gray-100 focus:outline-none"
            />
            <button onClick={() => { onUpdateStatus(p.id, p.status, notes); setEditingNotes(false); }} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
            <button onClick={() => { setNotes(p.notes || ""); setEditingNotes(false); }} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={() => setEditingNotes(true)} className="text-left w-full group">
            {p.notes ? (
              <span className="text-xs text-gray-400 truncate block group-hover:text-gray-200" title={p.notes}>{p.notes}</span>
            ) : (
              <span className="text-xs text-gray-700 group-hover:text-gray-500 italic">Add note…</span>
            )}
          </button>
        )}
      </td>

      {/* Delete */}
      <td className="px-3 py-4">
        <button
          onClick={() => { if (confirm(`Delete ${p.name || "this prospect"}?`)) onDelete(p.id); }}
          className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-950 rounded transition-colors"
          title="Delete prospect"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function Prospects() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: Prospect[]; total: number }>({
    queryKey: ["/api/prospects", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      return fetch(`/api/prospects?${params}`).then(r => r.json());
    },
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: ProspectStatus; notes?: string }) =>
      fetch(`/api/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/prospects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/prospects/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
      qc.invalidateQueries({ queryKey: ["/api/metrics"] });
    },
  });

  const prospects = data?.data ?? [];

  // Count by status for badge numbers
  const allData = useQuery<{ data: Prospect[] }>({
    queryKey: ["/api/prospects", "all", ""],
    queryFn: () => fetch("/api/prospects").then(r => r.json()),
  });
  const counts: Record<string, number> = {};
  (allData.data?.data ?? []).forEach(p => {
    counts[p.status] = (counts[p.status] || 0) + 1;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Prospect Pool</h1>
          <p className="text-sm text-gray-500 mt-1">
            Leads found and deduplicated by agents. Click a status badge to change it. Click a note to edit.
            {data?.total != null && <span className="font-semibold text-gray-300 ml-2">{data.total} {statusFilter !== "all" ? statusFilter : ""} prospects</span>}
          </p>
        </div>
        <a
          href="/api/prospects/export.csv"
          download
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search name, phone, email, company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-blue"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                statusFilter === tab.key ? "bg-brand-blue text-white" : "text-gray-400 hover:text-gray-200"
              )}
            >
              {tab.label}
              {tab.key !== "all" && counts[tab.key] > 0 && (
                <span className={clsx("text-[10px] rounded-full px-1.5 py-0.5 font-bold",
                  statusFilter === tab.key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"
                )}>{counts[tab.key]}</span>
              )}
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
        <div className="flex flex-col items-center gap-4 py-24 text-center text-gray-600">
          <Users className="w-12 h-12 text-gray-700" />
          <div>
            <p className="font-semibold text-gray-500">
              {search || statusFilter !== "all" ? "No prospects match your filter" : "No prospects yet"}
            </p>
            <p className="text-sm mt-1 text-gray-700">
              {search || statusFilter !== "all"
                ? "Try a different filter or search term"
                : "Fire a test lead from the Dashboard → Test Lead panel, or connect the ingestion endpoint to your CRM."}
            </p>
          </div>
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
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {prospects.map((p, i) => (
                <ProspectRow
                  key={p.id}
                  p={p}
                  i={i}
                  onUpdateStatus={(id, status, notes) => updateMutation.mutate({ id, status, notes })}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
            {prospects.length} {statusFilter !== "all" ? statusFilter : ""} prospects shown
            {(updateMutation.isPending || deleteMutation.isPending) && (
              <span className="ml-3 text-brand-yellow">Saving…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
