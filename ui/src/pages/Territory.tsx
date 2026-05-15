import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Map, RefreshCw, RotateCcw, Plus, MapPin, CheckCircle, Clock } from "lucide-react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import clsx from "clsx";

interface ZipRecord {
  zip: string;
  city?: string;
  state?: string;
  lastSearched: string;
  searchCount: number;
  prospectsFound: number;
  cooldownDays: number;
  expiresAt: string;
  status: "exhausted" | "available";
}

interface TerritorySummary {
  totalTracked: number;
  exhausted: number;
  available: number;
  totalProspectsFound: number;
}

export default function Territory() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ zip: "", city: "", state: "", cooldownDays: "90" });
  const [filterStatus, setFilterStatus] = useState<"all" | "exhausted" | "available">("all");

  const { data, isLoading } = useQuery<{ data: ZipRecord[]; summary: TerritorySummary }>({
    queryKey: ["/api/territory"],
    queryFn: () => fetch("/api/territory").then(r => r.json()),
  });

  const resetMutation = useMutation({
    mutationFn: (zip: string) =>
      fetch(`/api/territory/zip/${zip}/reset`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/territory"] });
      qc.invalidateQueries({ queryKey: ["/api/metrics"] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (body: typeof addForm) =>
      fetch("/api/territory/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip: body.zip,
          city: body.city || undefined,
          state: body.state || undefined,
          cooldownDays: parseInt(body.cooldownDays) || 90,
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/territory"] });
      qc.invalidateQueries({ queryKey: ["/api/metrics"] });
      setShowAdd(false);
      setAddForm({ zip: "", city: "", state: "", cooldownDays: "90" });
    },
  });

  const summary = data?.summary;
  const zips = (data?.data ?? []).filter(z =>
    filterStatus === "all" ? true : z.status === filterStatus
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Territory</h1>
          <p className="text-sm text-gray-500 mt-1">
            ZIP code exhaustion tracking. Searched ZIPs are locked for 90 days before agents revisit.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Mark ZIP Searched
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Tracked", value: summary.totalTracked, color: "text-gray-300" },
            { label: "Exhausted (locked)", value: summary.exhausted, color: "text-red-400" },
            { label: "Back in Rotation", value: summary.available, color: "text-green-400" },
            { label: "Prospects Found", value: summary.totalProspectsFound, color: "text-brand-yellow" },
          ].map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{c.label}</p>
              <p className={clsx("text-3xl font-black", c.color)}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add ZIP form */}
      {showAdd && (
        <div className="bg-gray-900 border border-brand-blue rounded-xl p-5 space-y-4">
          <p className="text-sm font-bold text-brand-yellow">Mark ZIP as Searched</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ZIP Code *</label>
              <input
                type="text"
                placeholder="e.g. 90210"
                value={addForm.zip}
                onChange={e => setAddForm(f => ({ ...f, zip: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">City</label>
              <input
                type="text"
                placeholder="e.g. Beverly Hills"
                value={addForm.city}
                onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">State</label>
              <input
                type="text"
                placeholder="e.g. CA"
                value={addForm.state}
                onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cooldown (days)</label>
              <input
                type="number"
                value={addForm.cooldownDays}
                onChange={e => setAddForm(f => ({ ...f, cooldownDays: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => addMutation.mutate(addForm)}
              disabled={!addForm.zip || addMutation.isPending}
              className="px-4 py-2 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {addMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(["all", "exhausted", "available"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={clsx("px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors",
              filterStatus === f ? "bg-brand-blue text-white" : "text-gray-400 hover:text-gray-200")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ZIP table */}
      {isLoading ? (
        <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading territory data…
        </div>
      ) : zips.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-600">
          <Map className="w-10 h-10" />
          <p className="text-sm">No ZIP codes tracked yet</p>
          <p className="text-xs text-gray-700">Agents will log ZIPs here as they run outreach campaigns</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">ZIP</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Location</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Last Searched</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Unlocks</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Searches</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Prospects</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {zips.map((z, i) => (
                <tr key={z.zip} className={clsx("border-b border-gray-800/60 hover:bg-gray-800/40", i % 2 === 0 && "bg-gray-900/50")}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="font-mono font-bold text-gray-100">{z.zip}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {[z.city, z.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4">
                    {z.status === "exhausted" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-900 text-red-300">
                        <Clock className="w-3 h-3" /> Exhausted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                        <CheckCircle className="w-3 h-3" /> Available
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {formatDistanceToNow(parseISO(z.lastSearched), { addSuffix: true })}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {z.status === "exhausted" ? format(parseISO(z.expiresAt), "MMM d, yyyy") : "Now"}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-300 font-semibold">{z.searchCount}×</td>
                  <td className="px-5 py-4 text-xs text-brand-yellow font-bold">{z.prospectsFound}</td>
                  <td className="px-5 py-4">
                    {z.status === "exhausted" && (
                      <button
                        onClick={() => resetMutation.mutate(z.zip)}
                        disabled={resetMutation.isPending}
                        title="Reset cooldown — make this ZIP available immediately"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
