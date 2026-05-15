import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, RefreshCw, RotateCcw, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import clsx from "clsx";

interface Execution {
  trace_id: string;
  tenant_id?: string;
  skill?: string;
  status?: string;
  policy_decision?: string;
  policy_reason?: string;
  timestamp?: string;
}

interface PendingItem {
  0: string; // message id
  1: string; // consumer
  2: number; // idle ms
  3: number; // delivery count
}

export default function Executions() {
  const [tab, setTab] = useState<"recent" | "pending">("recent");
  const qc = useQueryClient();

  const { data: execData, isLoading: execLoading } = useQuery<{ data: Execution[]; total: number; source?: string }>({
    queryKey: ["/api/executions"],
    queryFn: () => fetch("/api/executions?limit=100").then(r => r.json()),
    enabled: tab === "recent",
  });

  const { data: pendingData, isLoading: pendingLoading } = useQuery<{ pending: PendingItem[]; count: number }>({
    queryKey: ["/api/pending"],
    queryFn: () => fetch("/api/pending").then(r => r.json()),
    enabled: tab === "pending",
  });

  const retryMutation = useMutation({
    mutationFn: (actionHash: string) =>
      fetch(`/api/retry/${actionHash}`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/metrics"] });
    },
  });

  const executions = execData?.data ?? [];
  const pending = Array.isArray(pendingData?.pending) ? pendingData.pending : [];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black">Executions</h1>
        <p className="text-sm text-gray-500 mt-1">Execution traces and stuck PEL messages</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("recent")}
          className={clsx("px-4 py-2 rounded-md text-sm font-semibold transition-colors",
            tab === "recent" ? "bg-brand-blue text-white" : "text-gray-400 hover:text-gray-200")}
        >
          Recent
        </button>
        <button
          onClick={() => setTab("pending")}
          className={clsx("px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2",
            tab === "pending" ? "bg-brand-blue text-white" : "text-gray-400 hover:text-gray-200")}
        >
          Stuck (PEL)
          {(pendingData?.count ?? 0) > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {pendingData?.count}
            </span>
          )}
        </button>
      </div>

      {/* Recent executions */}
      {tab === "recent" && (
        execLoading ? (
          <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading executions…
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-600">
            <Activity className="w-10 h-10" />
            <p className="text-sm">No executions tracked yet</p>
            {execData?.source === "redis" && (
              <p className="text-xs text-gray-600">ClickHouse unavailable — showing Redis state keys</p>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {execData?.source === "redis" && (
              <div className="px-5 py-3 bg-yellow-950 border-b border-yellow-900 text-xs text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" /> ClickHouse offline — showing Redis state keys
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Trace ID</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Skill</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Policy</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">When</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e, i) => (
                  <tr key={e.trace_id} className={clsx("border-b border-gray-800/60 hover:bg-gray-800/40", i % 2 === 0 && "bg-gray-900/50")}>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400 max-w-[140px] truncate">{e.trace_id}</td>
                    <td className="px-5 py-3">
                      {e.skill ? (
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-xs font-mono">{e.skill}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {e.status === "completed" && <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle className="w-3 h-3" />Completed</span>}
                      {e.status === "failed" && <span className="flex items-center gap-1 text-red-400 text-xs font-semibold"><XCircle className="w-3 h-3" />Failed</span>}
                      {e.status === "blocked" && <span className="flex items-center gap-1 text-yellow-400 text-xs font-semibold"><AlertTriangle className="w-3 h-3" />Blocked</span>}
                      {e.status && !["completed","failed","blocked"].includes(e.status) && (
                        <span className="text-gray-400 text-xs">{e.status}</span>
                      )}
                      {!e.status && "—"}
                    </td>
                    <td className="px-5 py-3">
                      {e.policy_reason ? (
                        <span className="text-xs text-gray-500 truncate max-w-[200px] block" title={e.policy_reason}>
                          {e.policy_reason}
                        </span>
                      ) : e.policy_decision ? (
                        <span className="text-xs text-green-500">{e.policy_decision}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {e.timestamp ? formatDistanceToNow(parseISO(e.timestamp), { addSuffix: true }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Pending PEL */}
      {tab === "pending" && (
        pendingLoading ? (
          <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading PEL…
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-600">
            <CheckCircle className="w-10 h-10 text-green-700" />
            <p className="text-sm text-green-600">No stuck messages — queue is healthy</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-300">
                {pending.length} message{pending.length !== 1 ? "s" : ""} stuck in PEL.
                These were consumed by a worker that crashed before ACKing.
                Click Retry to reset idempotency and allow re-execution.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Message ID</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Consumer</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Idle</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Deliveries</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item, i) => {
                    const msgId = item[0];
                    const consumer = item[1];
                    const idleMs = item[2];
                    const deliveries = item[3];
                    return (
                      <tr key={msgId} className={clsx("border-b border-gray-800/60", i % 2 === 0 && "bg-gray-900/50")}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{msgId}</td>
                        <td className="px-5 py-3 text-xs text-gray-300">{consumer}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1 text-yellow-400 text-xs">
                            <Clock className="w-3 h-3" />
                            {idleMs >= 60000 ? `${Math.round(idleMs / 60000)}m` : `${Math.round(idleMs / 1000)}s`}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={clsx("text-xs font-bold", deliveries > 3 ? "text-red-400" : "text-gray-400")}>
                            {deliveries}×
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => retryMutation.mutate(msgId)}
                            disabled={retryMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
