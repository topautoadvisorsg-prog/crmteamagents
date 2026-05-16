import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, RefreshCw, Play, Pause, Edit3, Trash2, ChevronRight,
  ChevronDown, Mail, MessageSquare, Globe, Tag, MapPin, Target,
  CheckCircle, Clock, FileText, Save, X, AlertTriangle, ArrowRight,
  Search, Users, Send, PhoneCall, Info
} from "lucide-react";
import clsx from "clsx";

type AgentStatus = "active" | "paused" | "draft";
type OutreachChannel = "email" | "sms" | "both";

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  icp: {
    industries: string[];
    keywords: string[];
    negativeKeywords: string[];
    minEmployees?: number;
    maxEmployees?: number;
    businessType?: string;
  };
  territory: {
    targetZips: string[];
    targetCities: string[];
    targetStates: string[];
    cooldownDays: number;
    radiusMiles?: number;
  };
  outreach: {
    channel: OutreachChannel;
    emailTemplate: string;
    smsTemplate: string;
    maxOutreachPerDay: number;
    followUpDays: number;
    requireWarmLead: boolean;
  };
  qualification: {
    minConfidenceScore: number;
    autoRegister: boolean;
    autoOutreach: boolean;
  };
  createdAt: string;
  updatedAt: string;
  totalLeadsFound: number;
  totalOutreachSent: number;
}

const STATUS_CONFIG: Record<AgentStatus, { color: string; dot: string; label: string; icon: any }> = {
  active:  { color: "bg-green-900 text-green-300",  dot: "bg-green-400",  label: "Active",  icon: Play },
  paused:  { color: "bg-yellow-900 text-yellow-300", dot: "bg-yellow-400", label: "Paused",  icon: Pause },
  draft:   { color: "bg-gray-800 text-gray-400",    dot: "bg-gray-500",   label: "Draft",   icon: FileText },
};

// ── Tag input helper ──────────────────────────────────────
function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !values.includes(val)) onChange([...values, val]);
    setInput("");
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} className="text-gray-500 hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder || "Type and press Enter"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
        />
        <button onClick={add} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg">Add</button>
      </div>
    </div>
  );
}

// ── Agent Form ────────────────────────────────────────────
function AgentForm({ initial, onSave, onCancel, isSaving }: {
  initial: Partial<AgentConfig>;
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<any>({
    name: initial.name || "New Agent",
    description: initial.description || "",
    status: initial.status || "draft",
    icp: {
      industries: initial.icp?.industries || [],
      keywords: initial.icp?.keywords || [],
      negativeKeywords: initial.icp?.negativeKeywords || [],
      businessType: initial.icp?.businessType || "",
      minEmployees: initial.icp?.minEmployees || "",
      maxEmployees: initial.icp?.maxEmployees || "",
    },
    territory: {
      targetZips: initial.territory?.targetZips || [],
      targetCities: initial.territory?.targetCities || [],
      targetStates: initial.territory?.targetStates || [],
      cooldownDays: initial.territory?.cooldownDays || 90,
    },
    outreach: {
      channel: initial.outreach?.channel || "email",
      emailTemplate: initial.outreach?.emailTemplate || "Hi {name},\n\nI noticed your business {company}...\n\nBest,\nSmartKlix Team",
      smsTemplate: initial.outreach?.smsTemplate || "Hi {name}, this is SmartKlix. Reply YES to learn more.",
      maxOutreachPerDay: initial.outreach?.maxOutreachPerDay || 50,
      followUpDays: initial.outreach?.followUpDays || 3,
      requireWarmLead: initial.outreach?.requireWarmLead || false,
    },
    qualification: {
      minConfidenceScore: initial.qualification?.minConfidenceScore || 0.7,
      autoRegister: initial.qualification?.autoRegister ?? true,
      autoOutreach: initial.qualification?.autoOutreach || false,
    },
  });

  const set = (path: string, value: any) => {
    const keys = path.split(".");
    setForm((prev: any) => {
      const next = { ...prev };
      let cur: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const [openSection, setOpenSection] = useState<string>("icp");
  const toggleSection = (s: string) => setOpenSection(openSection === s ? "" : s);

  const Section = ({ id, title, icon: Icon, children }: any) => (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Icon className="w-4 h-4 text-gray-400" />
          {title}
        </div>
        {openSection === id ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      {openSection === id && <div className="p-5 bg-gray-950 space-y-4">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Agent Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set("name", e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-brand-blue"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="What does this agent do?"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
          />
        </div>
      </div>

      {/* ICP */}
      <Section id="icp" title="Ideal Customer Profile (ICP)" icon={Target}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Business Type</label>
            <input
              type="text"
              value={form.icp.businessType}
              onChange={e => set("icp.businessType", e.target.value)}
              placeholder="e.g. residential roofing contractor"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand-blue"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Min Employees</label>
              <input type="number" value={form.icp.minEmployees} onChange={e => set("icp.minEmployees", e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Max Employees</label>
              <input type="number" value={form.icp.maxEmployees} onChange={e => set("icp.maxEmployees", e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue" />
            </div>
          </div>
        </div>
        <TagInput label="Target Industries" values={form.icp.industries} onChange={v => set("icp.industries", v)} placeholder="e.g. roofing, hvac, plumbing" />
        <TagInput label="Keywords to Match" values={form.icp.keywords} onChange={v => set("icp.keywords", v)} placeholder="e.g. storm damage, roof repair" />
        <TagInput label="Negative Keywords (Exclude)" values={form.icp.negativeKeywords} onChange={v => set("icp.negativeKeywords", v)} placeholder="e.g. commercial, new construction" />
      </Section>

      {/* Territory */}
      <Section id="territory" title="Geographic Territory" icon={MapPin}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TagInput label="Target States" values={form.territory.targetStates} onChange={v => set("territory.targetStates", v)} placeholder="e.g. FL, TX, GA" />
          <TagInput label="Target Cities" values={form.territory.targetCities} onChange={v => set("territory.targetCities", v)} placeholder="e.g. Miami, Tampa" />
        </div>
        <TagInput label="Target ZIP Codes" values={form.territory.targetZips} onChange={v => set("territory.targetZips", v)} placeholder="e.g. 33101, 33102" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Cooldown Period (days)</label>
            <input type="number" value={form.territory.cooldownDays} onChange={e => set("territory.cooldownDays", parseInt(e.target.value) || 90)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue" />
            <p className="text-[10px] text-gray-600 mt-1">Days before re-searching a ZIP code</p>
          </div>
        </div>
      </Section>

      {/* Outreach */}
      <Section id="outreach" title="Outreach Settings" icon={Mail}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Outreach Channel</label>
            <select value={form.outreach.channel} onChange={e => set("outreach.channel", e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue">
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
              <option value="both">Email + SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Max Outreach / Day</label>
            <input type="number" value={form.outreach.maxOutreachPerDay} onChange={e => set("outreach.maxOutreachPerDay", parseInt(e.target.value) || 50)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Follow-up After (days)</label>
            <input type="number" value={form.outreach.followUpDays} onChange={e => set("outreach.followUpDays", parseInt(e.target.value) || 3)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue" />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={form.outreach.requireWarmLead} onChange={e => set("outreach.requireWarmLead", e.target.checked)}
              className="rounded border-gray-600 bg-gray-800" />
            Only outreach warm leads (responded to initial contact)
          </label>
        </div>
        {(form.outreach.channel === "email" || form.outreach.channel === "both") && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email Template</label>
            <p className="text-[10px] text-gray-600 mb-2">Variables: {"{name}"}, {"{company}"}, {"{city}"}, {"{industry}"}</p>
            <textarea value={form.outreach.emailTemplate} onChange={e => set("outreach.emailTemplate", e.target.value)}
              rows={6}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue font-mono resize-none" />
          </div>
        )}
        {(form.outreach.channel === "sms" || form.outreach.channel === "both") && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">SMS Template <span className="text-gray-600">(keep under 160 chars)</span></label>
            <textarea value={form.outreach.smsTemplate} onChange={e => set("outreach.smsTemplate", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue font-mono resize-none" />
            <p className={clsx("text-[10px] mt-1", form.outreach.smsTemplate.length > 160 ? "text-red-400" : "text-gray-600")}>
              {form.outreach.smsTemplate.length}/160 characters
            </p>
          </div>
        )}
      </Section>

      {/* Qualification */}
      <Section id="qualification" title="Lead Qualification Rules" icon={CheckCircle}>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Min Confidence Score: <span className="text-brand-yellow font-bold">{Math.round(form.qualification.minConfidenceScore * 100)}%</span>
          </label>
          <input type="range" min="0" max="1" step="0.05" value={form.qualification.minConfidenceScore}
            onChange={e => set("qualification.minConfidenceScore", parseFloat(e.target.value))}
            className="w-full accent-brand-blue" />
          <div className="flex justify-between text-[10px] text-gray-600 mt-1">
            <span>0% — accept all</span>
            <span>70% recommended</span>
            <span>100% — very strict</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={form.qualification.autoRegister} onChange={e => set("qualification.autoRegister", e.target.checked)}
              className="rounded border-gray-600 bg-gray-800" />
            Auto-register new leads to prospect pool
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={form.qualification.autoOutreach} onChange={e => set("qualification.autoOutreach", e.target.checked)}
              className="rounded border-gray-600 bg-gray-800" />
            Auto-send outreach immediately after registration
          </label>
        </div>
        {form.qualification.autoOutreach && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">Auto-outreach sends messages without manual review. Make sure your templates are ready and Resend/Twilio are configured.</p>
          </div>
        )}
      </Section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={!form.name || isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving…" : "Save Agent"}
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 bg-gray-800 text-gray-400 text-sm rounded-lg hover:bg-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Agent Card ────────────────────────────────────────────
function AgentCard({ agent, onEdit, onDelete, onToggleStatus }: {
  agent: AgentConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: (status: AgentStatus) => void;
}) {
  const { color, dot, label, icon: StatusIcon } = STATUS_CONFIG[agent.status];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-bold text-gray-100">{agent.name}</h3>
            {agent.description && <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>}
          </div>
        </div>
        <span className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0", color)}>
          <span className={clsx("w-1.5 h-1.5 rounded-full", dot)} />
          {label}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-lg font-black text-brand-yellow">{agent.totalLeadsFound}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Leads Found</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-lg font-black text-blue-400">{agent.totalOutreachSent}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Outreach Sent</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-lg font-black text-gray-300">{agent.territory.targetZips.length + agent.territory.targetCities.length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Territories</p>
        </div>
      </div>

      {/* Config summary */}
      <div className="space-y-1.5 text-xs text-gray-500">
        {agent.icp.industries.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="w-3 h-3 shrink-0" />
            <span className="truncate">{agent.icp.industries.join(", ")}</span>
          </div>
        )}
        {(agent.territory.targetCities.length > 0 || agent.territory.targetStates.length > 0) && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {[...agent.territory.targetCities, ...agent.territory.targetStates.map(s => s.toUpperCase())].join(", ")}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {agent.outreach.channel === "email" ? <Mail className="w-3 h-3 shrink-0" /> :
           agent.outreach.channel === "sms" ? <MessageSquare className="w-3 h-3 shrink-0" /> :
           <Globe className="w-3 h-3 shrink-0" />}
          <span>{agent.outreach.channel === "email" ? "Email outreach" : agent.outreach.channel === "sms" ? "SMS outreach" : "Email + SMS"} · max {agent.outreach.maxOutreachPerDay}/day</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {agent.status === "active" ? (
          <button onClick={() => onToggleStatus("paused")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-950 hover:bg-yellow-900 border border-yellow-800 text-yellow-300 text-xs font-semibold rounded-lg">
            <Pause className="w-3 h-3" /> Pause
          </button>
        ) : (
          <button onClick={() => onToggleStatus("active")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-950 hover:bg-green-900 border border-green-800 text-green-300 text-xs font-semibold rounded-lg">
            <Play className="w-3 h-3" /> Activate
          </button>
        )}
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg">
          <Edit3 className="w-3 h-3" /> Edit
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 text-xs font-semibold rounded-lg ml-auto">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function Agents() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: AgentConfig[]; total: number }>({
    queryKey: ["/api/agents"],
    queryFn: () => fetch("/api/agents").then(r => r.json()),
  });

  const { data: editData } = useQuery<AgentConfig>({
    queryKey: ["/api/agents", editingId],
    queryFn: () => fetch(`/api/agents/${editingId}`).then(r => r.json()),
    enabled: !!editingId,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); setMode("list"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: any) => fetch(`/api/agents/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); setMode("list"); setEditingId(null); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: any) => fetch(`/api/agents/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/agents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/agents/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/agents"] }),
  });

  const agents = data?.data ?? [];
  const active = agents.filter(a => a.status === "active").length;

  if (mode === "create" || mode === "edit") {
    const initial = mode === "edit" && editData ? editData : {};
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setMode("list"); setEditingId(null); }} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-black">{mode === "create" ? "New Agent" : `Edit: ${editData?.name}`}</h1>
        </div>
        <AgentForm
          initial={initial}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onCancel={() => { setMode("list"); setEditingId(null); }}
          onSave={body => {
            if (mode === "create") createMutation.mutate(body);
            else updateMutation.mutate({ id: editingId, body });
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Agents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure what your AI agents search for and how they outreach leads.
            {active > 0 && <span className="text-green-400 ml-2 font-semibold">{active} active</span>}
          </p>
        </div>
        <button
          onClick={() => setMode("create")}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Agent
        </button>
      </div>

      {/* How it works — pipeline flow */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-brand-blue" />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">How the Pipeline Works</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { icon: Bot,       label: "Agent",       sub: "You define what\nto search",         color: "text-blue-400",   bg: "bg-blue-950/50",   border: "border-blue-800" },
            { icon: Search,    label: "ZIP Search",  sub: "Sourcer runs every\n30 min per agent", color: "text-purple-400", bg: "bg-purple-950/50", border: "border-purple-800" },
            { icon: Globe,     label: "No Website?", sub: "Filter: only companies\nwithout a site", color: "text-yellow-400", bg: "bg-yellow-950/50", border: "border-yellow-800" },
            { icon: Users,     label: "Registered",  sub: "Added to\nProspect Pool",             color: "text-indigo-400", bg: "bg-indigo-950/50", border: "border-indigo-800" },
            { icon: Send,      label: "Outreach",    sub: "Email or SMS\nper your template",     color: "text-green-400",  bg: "bg-green-950/50",  border: "border-green-800" },
            { icon: PhoneCall, label: "Booking",     sub: "Lead replies →\ncall booked",         color: "text-brand-yellow", bg: "bg-yellow-950/30", border: "border-yellow-700" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className={clsx("flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border min-w-[90px]", step.bg, step.border)}>
                <step.icon className={clsx("w-4 h-4", step.color)} />
                <p className={clsx("text-xs font-bold", step.color)}>{step.label}</p>
                <p className="text-[9px] text-gray-500 text-center whitespace-pre-line leading-tight">{step.sub}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-gray-700 shrink-0" />}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-600">
          <span className="text-brand-blue font-semibold">Set an agent to Active</span> → the sourcer picks it up on the next tick → leads flow into Prospects automatically.
          The AI decides each action. You review and adjust in the Prospects tab.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading agents…
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <Bot className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="text-gray-300 font-semibold">No agents configured yet</p>
            <p className="text-sm text-gray-600 mt-1 max-w-xs">Create your first agent to define what leads to find, where to search, and how to outreach.</p>
          </div>
          <button
            onClick={() => setMode("create")}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Create First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={() => { setEditingId(agent.id); setMode("edit"); }}
              onDelete={() => deleteMutation.mutate(agent.id)}
              onToggleStatus={status => statusMutation.mutate({ id: agent.id, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
