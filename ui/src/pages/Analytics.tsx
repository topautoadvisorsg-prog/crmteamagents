import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, Cpu, CheckCircle, XCircle, RefreshCw, Download } from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";

interface UsageRecord {
  inputTokens: number; outputTokens: number; totalTokens: number; calls: number; costUSD: number;
}
interface UsageResponse {
  today: UsageRecord; month: UsageRecord; allTime: UsageRecord;
  history: Array<{ date: string } & UsageRecord>;
}
interface AnalyticsResponse {
  daily: {
    executions: number; policy_blocked: number; skill_success: number; skill_fail: number;
    prospects_found: number; emails_sent: number; sms_sent: number; calls_booked: number;
  };
  skills: Array<{ skill: string; calls: number; success: number; fail: number; successRate: number }>;
  successRate: number;
}

function UsageCard({ label, data, accent }: { label: string; data: UsageRecord; accent?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">{label}</p>
      <div className="space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-gray-500">Cost</span>
          <span className={clsx("text-xl font-black", accent ?? "text-[#FFC107]")}>${data.costUSD.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Total tokens</span>
          <span className="text-sm font-semibold">{data.totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Input / Output</span>
          <span className="text-xs text-gray-400">{data.inputTokens.toLocaleString()} / {data.outputTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">API calls</span>
          <span className="text-xs text-gray-400">{data.calls}</span>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: usage, isLoading: usageLoading } = useQuery<UsageResponse>({
    queryKey: ["/api/usage"],
    queryFn: () => fetch("/api/usage").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/analytics"],
    queryFn: () => fetch("/api/analytics").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const isLoading = usageLoading || analyticsLoading;

  // Max tokens in history for bar chart scaling
  const maxTokens = Math.max(...(usage?.history.map(h => h.totalTokens) ?? [1]), 1);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Token usage, cost, and skill performance</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading analytics…
        </div>
      ) : (
        <>
          {/* Token usage cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <UsageCard label="Today"    data={usage?.today    ?? { inputTokens:0,outputTokens:0,totalTokens:0,calls:0,costUSD:0 }} />
            <UsageCard label="This Month" data={usage?.month  ?? { inputTokens:0,outputTokens:0,totalTokens:0,calls:0,costUSD:0 }} accent="text-purple-400" />
            <UsageCard label="All Time"  data={usage?.allTime ?? { inputTokens:0,outputTokens:0,totalTokens:0,calls:0,costUSD:0 }} accent="text-blue-400" />
          </div>

          {/* 30-day token chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-5">Token Usage — Last 30 Days</p>
            <div className="flex items-end gap-1 h-32">
              {(usage?.history ?? []).map(day => {
                const height = maxTokens > 0 ? Math.max((day.totalTokens / maxTokens) * 100, day.totalTokens > 0 ? 4 : 0) : 0;
                const isToday = day.date === format(new Date(), "yyyy-MM-dd");
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className={clsx("w-full rounded-t transition-all", isToday ? "bg-[#FFC107]" : "bg-blue-700 group-hover:bg-blue-500")}
                      style={{ height: `${height}%`, minHeight: day.totalTokens > 0 ? "3px" : "0" }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs whitespace-nowrap z-10 pointer-events-none">
                      <p className="font-bold">{day.date}</p>
                      <p>{day.totalTokens.toLocaleString()} tokens</p>
                      <p>${day.costUSD.toFixed(4)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-600">
              <span>{usage?.history?.[0]?.date}</span>
              <span className="text-[#FFC107]">Today</span>
            </div>
          </div>

          {/* Today's throughput */}
          {analytics && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">Today's Throughput</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Executions",       val: analytics.daily.executions,       icon: Cpu,          color: "text-blue-400" },
                  { label: "Policy Blocked",   val: analytics.daily.policy_blocked,   icon: XCircle,      color: "text-red-400" },
                  { label: "Skills Success",   val: analytics.daily.skill_success,    icon: CheckCircle,  color: "text-green-400" },
                  { label: "Prospects Found",  val: analytics.daily.prospects_found,  icon: TrendingUp,   color: "text-purple-400" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <item.icon className={clsx("w-5 h-5 shrink-0", item.color)} />
                    <div>
                      <p className="text-lg font-black">{item.val}</p>
                      <p className="text-[11px] text-gray-500">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-all"
                    style={{ width: `${analytics.successRate}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-green-400">{analytics.successRate}% success rate</span>
              </div>
            </div>
          )}

          {/* Skill breakdown */}
          {analytics?.skills.length ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Skill Performance (All Time)</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Skill</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Calls</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Success</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Fail</th>
                    <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">Rate</th>
                    <th className="px-5 py-3 w-40" />
                  </tr>
                </thead>
                <tbody>
                  {analytics.skills.map((s, i) => (
                    <tr key={s.skill} className={clsx("border-b border-gray-800/60", i % 2 === 0 && "bg-gray-900/50")}>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs bg-gray-800 px-2 py-1 rounded text-gray-300">{s.skill}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold">{s.calls}</td>
                      <td className="px-5 py-3 text-green-400 font-semibold">{s.success}</td>
                      <td className="px-5 py-3 text-red-400 font-semibold">{s.fail}</td>
                      <td className="px-5 py-3">
                        <span className={clsx("font-bold", s.successRate >= 80 ? "text-green-400" : s.successRate >= 50 ? "text-yellow-400" : "text-red-400")}>
                          {s.successRate}%
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div
                            className={clsx("h-1.5 rounded-full", s.successRate >= 80 ? "bg-green-500" : s.successRate >= 50 ? "bg-yellow-500" : "bg-red-500")}
                            style={{ width: `${s.successRate}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-600">No skill runs recorded yet</p>
              <p className="text-xs text-gray-700 mt-1">Data appears here as agents execute skills</p>
            </div>
          )}

          {/* Pricing note */}
          <div className="text-[11px] text-gray-600 flex items-center gap-2">
            <DollarSign className="w-3 h-3" />
            Cost estimates based on claude-haiku-4-5 pricing: $0.80/M input · $4.00/M output.
            Override via <code className="bg-gray-800 px-1 rounded">TOKEN_COST_INPUT_PER_M</code> /
            <code className="bg-gray-800 px-1 rounded">TOKEN_COST_OUTPUT_PER_M</code> env vars.
          </div>
        </>
      )}
    </div>
  );
}
