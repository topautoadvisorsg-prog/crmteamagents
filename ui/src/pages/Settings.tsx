import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Shield, Zap, Mail, MessageSquare, Globe, Database, DollarSign, Calendar, Lock } from "lucide-react";
import clsx from "clsx";

interface Integration {
  configured: boolean;
  status: string;
  url?: string | null;
}

interface SettingsResponse {
  integrations: {
    redis: Integration;
    anthropic: Integration;
    resend: Integration;
    twilio: Integration;
    firecrawl: Integration;
    calendly: Integration;
    clickhouse: Integration;
    crm: Integration;
  };
  policies: {
    weekendOutreachDisabled: boolean;
    maxLoopDepth: number;
    llmCallsPerTrace: number;
    prospectTTLDays: number;
    tokenCostInputPerM: number;
    tokenCostOutputPerM: number;
    resendFromEmail: string;
    adminAuthEnabled: boolean;
  };
  timestamp: string;
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  connected:        { icon: CheckCircle,   color: "text-green-400",  label: "Connected" },
  configured:       { icon: CheckCircle,   color: "text-green-400",  label: "Configured" },
  simulation_mode:  { icon: AlertTriangle, color: "text-yellow-400", label: "Simulation Mode" },
  not_configured:   { icon: XCircle,       color: "text-gray-500",   label: "Not Configured" },
  missing:          { icon: XCircle,       color: "text-red-400",    label: "Missing — Required" },
  disconnected:     { icon: XCircle,       color: "text-red-400",    label: "Disconnected" },
  error:            { icon: AlertTriangle, color: "text-red-400",    label: "Error" },
};

const ENV_VARS: Record<string, { vars: string[]; docs?: string; impact: string }> = {
  redis:      { vars: ["REDIS_URL"], impact: "Required — nothing works without Redis" },
  anthropic:  { vars: ["ANTHROPIC_API_KEY"], impact: "Required — LLM classification disabled without this" },
  resend:     { vars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"], impact: "Optional — email sends will be simulated" },
  twilio:     { vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"], impact: "Optional — SMS will be simulated" },
  firecrawl:  { vars: ["FIRECRAWL_API_KEY"], impact: "Optional — web scraping will be simulated" },
  calendly:   { vars: ["CALENDLY_API_KEY"], impact: "Optional — booking will be simulated" },
  clickhouse: { vars: ["CLICKHOUSE_HOST", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"], impact: "Optional — execution logs stored in Redis only" },
  crm:        { vars: ["CRM_BASE_URL", "AGENT_INTERNAL_TOKEN", "CRM_CALLBACK_URL"], impact: "Optional — prospects won't sync to CRM" },
};

const INTEGRATION_META: Record<string, { label: string; icon: any; description: string }> = {
  redis:      { label: "Redis",           icon: Database,     description: "Streams, prospect store, territory, stats — the core of the platform" },
  anthropic:  { label: "Anthropic (LLM)", icon: Zap,          description: "Claude classifies every lead intent and determines the next action" },
  resend:     { label: "Resend (Email)",  icon: Mail,         description: "Sends outreach emails. Without this key, emails are logged but not sent" },
  twilio:     { label: "Twilio (SMS)",    icon: MessageSquare,description: "Sends outreach SMS. Without this, SMS is logged but not sent" },
  firecrawl:  { label: "Firecrawl",       icon: Globe,        description: "Scrapes lead websites for enrichment data" },
  calendly:   { label: "Calendly",        icon: Calendar,     description: "Books meetings with warm leads automatically" },
  clickhouse: { label: "ClickHouse",      icon: Database,     description: "Long-term analytics storage. Redis is used as fallback" },
  crm:        { label: "SmartKlix CRM",   icon: Globe,        description: "Syncs discovered prospects back to the CRM database" },
};

function IntegrationRow({ id, integration }: { id: string; integration: Integration }) {
  const meta = INTEGRATION_META[id];
  const envInfo = ENV_VARS[id];
  const statusKey = integration.status in STATUS_CONFIG ? integration.status : "not_configured";
  const { icon: StatusIcon, color, label } = STATUS_CONFIG[statusKey];
  const { icon: IntegIcon } = meta;

  return (
    <div className="border-b border-gray-800 last:border-0 py-4 px-5">
      <div className="flex items-start gap-4">
        <IntegIcon className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-semibold text-sm text-gray-100">{meta.label}</span>
            <span className={clsx("flex items-center gap-1 text-xs font-semibold", color)}>
              <StatusIcon className="w-3 h-3" />
              {label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{meta.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {envInfo.vars.map(v => (
              <code key={v} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono border border-gray-700">
                {v}
              </code>
            ))}
          </div>
          {integration.url && (
            <p className="text-[11px] text-gray-500 mt-1 font-mono truncate">{integration.url}</p>
          )}
          <p className="text-[11px] text-gray-600 mt-1.5">{envInfo.impact}</p>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data, isLoading, refetch } = useQuery<SettingsResponse>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then(r => r.json()),
    refetchInterval: 60_000,
  });

  const integrationOrder = ["redis", "anthropic", "resend", "twilio", "firecrawl", "calendly", "crm", "clickhouse"] as const;

  const configured = data ? integrationOrder.filter(k => data.integrations[k].configured).length : 0;
  const total = integrationOrder.length;
  const required = ["redis", "anthropic"];
  const allRequiredOk = data ? required.every(k => data.integrations[k as keyof typeof data.integrations].configured) : false;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Integration status and platform configuration</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-semibold rounded-lg"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-gray-500 py-12">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      ) : !data ? (
        <div className="bg-red-950 border border-red-800 rounded-xl p-5 text-red-300">
          Failed to load settings. Is the admin server running?
        </div>
      ) : (
        <>
          {/* System readiness banner */}
          <div className={clsx(
            "rounded-xl p-4 flex items-center gap-3 border",
            allRequiredOk
              ? "bg-green-950 border-green-800 text-green-300"
              : "bg-red-950 border-red-800 text-red-300"
          )}>
            {allRequiredOk ? <CheckCircle className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
            <div>
              <p className="font-bold text-sm">
                {allRequiredOk
                  ? `Platform ready — ${configured}/${total} integrations configured`
                  : "Platform not ready — Redis and Anthropic API key are required"}
              </p>
              {!allRequiredOk && (
                <p className="text-xs mt-0.5 opacity-80">Set the missing env vars in your Railway Variables tab and redeploy.</p>
              )}
            </div>
          </div>

          {/* Integrations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Integrations</p>
            </div>
            {integrationOrder.map(id => (
              <IntegrationRow key={id} id={id} integration={data.integrations[id]} />
            ))}
          </div>

          {/* Policy settings */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Automation Policies</p>
            </div>
            <div className="divide-y divide-gray-800">
              {[
                {
                  label: "Weekend Outreach",
                  value: data.policies.weekendOutreachDisabled ? "Blocked on Sat/Sun" : "Allowed (override active)",
                  status: data.policies.weekendOutreachDisabled ? "warn" : "ok",
                  env: "DISABLE_WEEKEND_POLICY",
                  note: "Set DISABLE_WEEKEND_POLICY=true to allow outreach on weekends",
                },
                {
                  label: "Max Loop Depth",
                  value: `${data.policies.maxLoopDepth} steps per trace`,
                  status: "neutral",
                  env: null,
                  note: "Hard limit on how many actions can chain per lead",
                },
                {
                  label: "LLM Calls per Trace",
                  value: `${data.policies.llmCallsPerTrace} call`,
                  status: "neutral",
                  env: null,
                  note: "Claude is called once per lead — cost control guard",
                },
                {
                  label: "Prospect TTL",
                  value: `${data.policies.prospectTTLDays} days`,
                  status: "neutral",
                  env: null,
                  note: "How long prospect records stay in Redis",
                },
                {
                  label: "Email From Address",
                  value: data.policies.resendFromEmail,
                  status: data.policies.resendFromEmail.includes("default") ? "warn" : "ok",
                  env: "RESEND_FROM_EMAIL",
                  note: "The sender address for all outreach emails",
                },
                {
                  label: "Token Cost (Input)",
                  value: `$${data.policies.tokenCostInputPerM}/M tokens`,
                  status: "neutral",
                  env: "TOKEN_COST_INPUT_PER_M",
                  note: "Used for cost estimation in Analytics",
                },
                {
                  label: "Token Cost (Output)",
                  value: `$${data.policies.tokenCostOutputPerM}/M tokens`,
                  status: "neutral",
                  env: "TOKEN_COST_OUTPUT_PER_M",
                  note: "Used for cost estimation in Analytics",
                },
                {
                  label: "Admin API Auth",
                  value: data.policies.adminAuthEnabled ? "Enabled (x-admin-token required)" : "Disabled (open access)",
                  status: data.policies.adminAuthEnabled ? "ok" : "warn",
                  env: "ADMIN_TOKEN",
                  note: "Protect the admin API with a static token in production",
                },
              ].map(row => (
                <div key={row.label} className="px-5 py-3 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 font-medium">{row.label}</span>
                      <span className={clsx("text-xs font-semibold",
                        row.status === "ok" ? "text-green-400" :
                        row.status === "warn" ? "text-yellow-400" : "text-gray-400"
                      )}>{row.value}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">{row.note}</p>
                  </div>
                  {row.env && (
                    <code className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono border border-gray-700 shrink-0 self-center">
                      {row.env}
                    </code>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Security panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-gray-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Security Notes</p>
            </div>
            <ul className="space-y-2 text-xs text-gray-500">
              <li className="flex items-start gap-2">
                <span className={clsx("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", data.policies.adminAuthEnabled ? "bg-green-500" : "bg-yellow-500")} />
                Admin API is {data.policies.adminAuthEnabled ? "protected with ADMIN_TOKEN" : "open — set ADMIN_TOKEN in production"}
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-green-500" />
                Ingestion endpoint requires JWT or x-internal-token auth
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-green-500" />
                Execute endpoint requires x-webhook-secret auth
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-blue-500" />
                All prospect data stored in Redis with 90-day TTL and synced to CRM
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-gray-700">
            Last checked: {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}
