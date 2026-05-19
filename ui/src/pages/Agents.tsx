import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, RefreshCw, Play, Pause, Edit3, Trash2, ChevronRight,
  ChevronDown, Mail, MessageSquare, Globe, Tag, MapPin, Target,
  CheckCircle, Clock, FileText, Save, X, AlertTriangle, ArrowRight,
  Search, Users, Send, PhoneCall, Info, Flame, TrendingUp, Building2,
  Sparkles, RotateCcw
} from "lucide-react";
import { MARKETS, STATES, getMarketsByState, INDUSTRIES, type Market } from "../data/markets";
import clsx from "clsx";

// ── SOP Template Library (mirrors services/outreach-sop/index.ts) ─────────────
const TEMPLATE_STYLES = [
  {
    id: "direct",
    label: "Direct & Professional",
    note: "Clear, business-focused, conversion-oriented",
    email: `Hi {name},

I came across {company} and noticed you don't have a full website set up yet.

A lot of construction companies in {city} are losing potential jobs simply because homeowners search Google before calling anyone — if your business isn't showing up with a professional site, those calls go to a competitor who is.

We help contractors like you build more than just a website. We set up a complete lead generation system that includes:

- A modern, mobile-first website designed to convert visitors into quote requests
- A CRM to organize and track every lead
- Automated follow-up so no lead falls through the cracks
- AI intake to handle after-hours inquiries

The goal isn't just "having a website" — it's turning your online presence into a system that books more jobs.

If you'd like, I can put together a few ideas specific to {company} and show you what this could look like for your business.

Best,
{sender_name}
Smart Click Agency
smartclickagency.com`,
    sms: `Hi {name}, noticed {company} doesn't have a website yet. We build lead generation systems for contractors — website, CRM, automation. Most clients get inbound calls within 30 days. Worth a quick chat? Reply YES.`,
  },
  {
    id: "casual",
    label: "Casual & Conversational",
    note: "Friendly, low-pressure, relatable tone",
    email: `Hey {name},

I was looking up {company} and noticed you don't have a website set up yet.

Honestly, a lot of contractors are getting more inbound leads right now just by making it easier for customers to find them and request quotes online. Without a website, you're relying entirely on referrals — which works, until it doesn't.

What we do is build the whole system:

- A clean, fast website that works great on phones
- Quote/estimate request forms so customers can reach you 24/7
- Automated text and email follow-ups
- A simple CRM to track jobs and leads
- AI chat for after-hours inquiries

You'd be surprised how quickly this pays for itself in booked jobs.

Want me to put together a few ideas for {company}? No pressure — just sharing what's been working for other contractors in {city}.

Best,
{sender_name}
Smart Click Agency`,
    sms: `Hey {name}, saw {company} doesn't have a website yet. Quick question — are you getting as many inbound calls as you want? We help contractors get more. 10-min chat? Reply YES.`,
  },
  {
    id: "value",
    label: "ROI-Focused",
    note: "Leads with outcomes, numbers, business case",
    email: `Hi {name},

Quick question: how do most of your new customers find you?

If the answer is mostly referrals, that's great — but it also means you're invisible to everyone in {city} who's searching Google right now for a {industry}.

We work with construction companies to close that gap. We build a full lead generation system — not just a website — that includes:

→ A professional site designed to convert visitors into booked jobs
→ Online quote/estimate request capability
→ CRM to manage your lead pipeline
→ Automated follow-up via email and text
→ AI intake for calls and messages you can't answer immediately

Most of our clients see new inbound inquiries within the first 30 days.

I'd love to put together a few ideas specific to {company}. Would a quick 10-minute call this week work?

Best,
{sender_name}
Smart Click Agency
smartclickagency.com`,
    sms: `Hi {name}, noticed {company} doesn't have a website yet. Homeowners search Google first — if you're not there, that job goes to someone else. We fix that. 10-min call? Reply YES.`,
  },
] as const;

type TemplateStyleId = typeof TEMPLATE_STYLES[number]["id"];

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

// ── Market Selector ───────────────────────────────────────
const TIER_ICON: Record<string, any> = {
  "🔥 Hot": Flame,
  "📈 Growing": TrendingUp,
  "✅ Solid": Building2,
};

function MarketSelector({ selectedZips, selectedCities, selectedStates, onUpdate }: {
  selectedZips: string[];
  selectedCities: string[];
  selectedStates: string[];
  onUpdate: (zips: string[], cities: string[], states: string[]) => void;
}) {
  const [selectedState, setSelectedState] = useState(selectedStates[0] ?? "CO");
  const marketsInState = getMarketsByState(selectedState);

  // Track which markets are currently "selected" (all their ZIPs are in the list)
  const addedMarkets = MARKETS.filter(m =>
    m.zips.every(z => selectedZips.includes(z))
  );
  const addedMarketIds = new Set(addedMarkets.map(m => m.id));

  const addMarket = (market: Market) => {
    const newZips = [...new Set([...selectedZips, ...market.zips])];
    const newCities = [...new Set([...selectedCities, market.city])];
    const newStates = [...new Set([...selectedStates, market.stateCode])];
    onUpdate(newZips, newCities, newStates);
  };

  const removeMarket = (market: Market) => {
    const newZips = selectedZips.filter(z => !market.zips.includes(z));
    const stillHasCities = addedMarkets.filter(m => m.id !== market.id && m.city === market.city);
    const newCities = stillHasCities.length > 0 ? selectedCities : selectedCities.filter(c => c !== market.city);
    const stillHasState = addedMarkets.filter(m => m.id !== market.id && m.stateCode === market.stateCode);
    const newStates = stillHasState.length > 0 ? selectedStates : selectedStates.filter(s => s !== market.stateCode);
    onUpdate(newZips, newCities, newStates);
  };

  return (
    <div className="space-y-4">
      {/* Added markets */}
      {addedMarkets.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 mb-2">
            Active Markets — {selectedZips.length} ZIP codes loaded
          </label>
          <div className="flex flex-wrap gap-2">
            {addedMarkets.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-brand-blue/20 border border-brand-blue/40 text-blue-300 text-xs px-3 py-1.5 rounded-lg">
                <MapPin className="w-3 h-3" />
                <span className="font-semibold">{m.city}, {m.stateCode}</span>
                <span className="text-blue-400/70">({m.zips.length} ZIPs)</span>
                <button onClick={() => removeMarket(m)} className="text-blue-400/60 hover:text-red-400 ml-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State picker */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">Add a Market — Select State</label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {STATES.map(sc => {
            const hasActive = addedMarkets.some(m => m.stateCode === sc);
            return (
              <button
                key={sc}
                onClick={() => setSelectedState(sc)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  selectedState === sc
                    ? "bg-brand-blue border-brand-blue text-white"
                    : hasActive
                    ? "bg-blue-950/40 border-blue-800 text-blue-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                )}
              >
                {sc}
                {hasActive && <span className="ml-1 text-[9px]">●</span>}
              </button>
            );
          })}
        </div>

        {/* Cities in selected state */}
        <div className="space-y-2">
          {marketsInState.map(market => {
            const isAdded = addedMarketIds.has(market.id);
            const TierIcon = TIER_ICON[market.tier] ?? Building2;
            return (
              <div
                key={market.id}
                className={clsx(
                  "flex items-center justify-between px-4 py-3 rounded-xl border transition-colors",
                  isAdded
                    ? "bg-brand-blue/10 border-brand-blue/40"
                    : "bg-gray-900 border-gray-800 hover:border-gray-700"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TierIcon className={clsx("w-4 h-4 shrink-0",
                    market.tier === "🔥 Hot" ? "text-orange-400" :
                    market.tier === "📈 Growing" ? "text-green-400" : "text-gray-400"
                  )} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-200">{market.city}</span>
                      <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded",
                        market.tier === "🔥 Hot" ? "bg-orange-950 text-orange-400" :
                        market.tier === "📈 Growing" ? "bg-green-950 text-green-400" :
                        "bg-gray-800 text-gray-400"
                      )}>{market.tier}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{market.note}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-[10px] text-gray-600">{market.zips.length} ZIPs</span>
                  {isAdded ? (
                    <button
                      onClick={() => removeMarket(market)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 text-xs rounded-lg transition-colors"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => addMarket(market)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-brand-blue hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedZips.length === 0 && (
        <div className="flex items-center gap-2 text-[11px] text-yellow-500 bg-yellow-950/30 border border-yellow-900 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          No markets selected — add at least one city above to start sourcing leads
        </div>
      )}
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
  const defaultStyle = TEMPLATE_STYLES[0]; // "direct" by default

  const [templateStyle, setTemplateStyle] = useState<TemplateStyleId>(
    // Try to detect which style was saved previously (rough heuristic)
    initial.outreach?.emailTemplate?.includes("Quick question:") ? "value"
    : initial.outreach?.emailTemplate?.includes("Hey {name}") ? "casual"
    : "direct"
  );

  const [form, setForm] = useState<any>({
    name: initial.name || "New Agent",
    description: initial.description || "",
    status: initial.status || "active",
    icp: {
      industries: initial.icp?.industries || [],
      keywords: initial.icp?.keywords || [],
      negativeKeywords: initial.icp?.negativeKeywords || ["franchise", "chain", "national"],
      businessType: initial.icp?.businessType || "residential",
    },
    territory: {
      targetZips: initial.territory?.targetZips || [],
      targetCities: initial.territory?.targetCities || [],
      targetStates: initial.territory?.targetStates || [],
      cooldownDays: initial.territory?.cooldownDays || 90,
    },
    outreach: {
      channel: initial.outreach?.channel || "email",
      emailTemplate: initial.outreach?.emailTemplate || defaultStyle.email,
      smsTemplate: initial.outreach?.smsTemplate || defaultStyle.sms,
      maxOutreachPerDay: initial.outreach?.maxOutreachPerDay || 30,
      followUpDays: initial.outreach?.followUpDays || 3,
      requireWarmLead: initial.outreach?.requireWarmLead || false,
    },
    qualification: {
      minConfidenceScore: initial.qualification?.minConfidenceScore || 0.7,
      autoRegister: initial.qualification?.autoRegister ?? true,
      autoOutreach: initial.qualification?.autoOutreach || false,
    },
  });

  const loadTemplateStyle = (styleId: TemplateStyleId) => {
    const style = TEMPLATE_STYLES.find(s => s.id === styleId)!;
    setTemplateStyle(styleId);
    set("outreach.emailTemplate", style.email);
    set("outreach.smsTemplate", style.sms);
  };

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

      {/* ICP — Industry checkboxes */}
      <Section id="icp" title="Who Are You Looking For?" icon={Target}>
        <div>
          <label className="block text-xs text-gray-500 mb-2">
            Industry Types <span className="text-gray-600">(check all that apply)</span>
          </label>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {INDUSTRIES.map(industry => {
              const checked = form.icp.industries.includes(industry);
              return (
                <label
                  key={industry}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-xs",
                    checked
                      ? "bg-brand-blue/20 border-brand-blue text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? form.icp.industries.filter((i: string) => i !== industry)
                        : [...form.icp.industries, industry];
                      set("icp.industries", next);
                    }}
                    className="hidden"
                  />
                  <CheckCircle className={clsx("w-3.5 h-3.5 shrink-0", checked ? "text-brand-blue" : "text-gray-700")} />
                  {industry}
                </label>
              );
            })}
          </div>
          {form.icp.industries.length === 0 && (
            <p className="text-[11px] text-yellow-500 mt-2">⚠ Select at least one industry type</p>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Customer Type</label>
            <select value={form.icp.businessType} onChange={e => set("icp.businessType", e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue">
              <option value="">All types</option>
              <option value="residential">Residential only</option>
              <option value="commercial">Commercial only</option>
              <option value="both">Residential + Commercial</option>
            </select>
            <p className="text-[10px] text-gray-600 mt-1">Residential contractors are most likely to lack a website</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Exclude (Negative Keywords)</label>
            <TagInput label="" values={form.icp.negativeKeywords} onChange={v => set("icp.negativeKeywords", v)} placeholder="franchise, chain, national…" />
          </div>
        </div>
      </Section>

      {/* Territory — Market selector */}
      <Section id="territory" title="Where to Search" icon={MapPin}>
        <MarketSelector
          selectedZips={form.territory.targetZips}
          selectedCities={form.territory.targetCities}
          selectedStates={form.territory.targetStates}
          onUpdate={(zips, cities, states) => {
            set("territory.targetZips", zips);
            set("territory.targetCities", cities);
            set("territory.targetStates", states);
          }}
        />
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Cooldown Period</label>
            <select value={form.territory.cooldownDays} onChange={e => set("territory.cooldownDays", parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue">
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days (recommended)</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
            <p className="text-[10px] text-gray-600 mt-1">How long before re-searching a ZIP code</p>
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
            <select value={form.outreach.maxOutreachPerDay} onChange={e => set("outreach.maxOutreachPerDay", parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue">
              <option value={10}>10/day — very conservative</option>
              <option value={20}>20/day — conservative</option>
              <option value={30}>30/day — recommended</option>
              <option value={50}>50/day — aggressive</option>
              <option value={100}>100/day — maximum</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Follow-up After</label>
            <select value={form.outreach.followUpDays} onChange={e => set("outreach.followUpDays", parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue">
              <option value={1}>1 day</option>
              <option value={3}>3 days (recommended)</option>
              <option value={5}>5 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
            </select>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={form.outreach.requireWarmLead} onChange={e => set("outreach.requireWarmLead", e.target.checked)}
              className="rounded border-gray-600 bg-gray-800" />
            Only outreach warm leads (responded to initial contact)
          </label>
        </div>
        {/* Template Style Picker */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
            <label className="text-xs text-gray-400 font-semibold">Outreach Style</label>
            <span className="text-[10px] text-gray-600">— Smart Click SOP templates · variables auto-fill at send time</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-3">
            {TEMPLATE_STYLES.map(style => (
              <button
                key={style.id}
                type="button"
                onClick={() => loadTemplateStyle(style.id)}
                className={clsx(
                  "text-left px-3 py-2.5 rounded-xl border transition-colors",
                  templateStyle === style.id
                    ? "bg-brand-blue/20 border-brand-blue text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                )}
              >
                <p className="text-xs font-bold">{style.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{style.note}</p>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">
            Variables: <code className="bg-gray-800 px-1 rounded">{"{name}"}</code>{" "}
            <code className="bg-gray-800 px-1 rounded">{"{company}"}</code>{" "}
            <code className="bg-gray-800 px-1 rounded">{"{city}"}</code>{" "}
            <code className="bg-gray-800 px-1 rounded">{"{industry}"}</code>{" "}
            — filled automatically from lead data at send time.
          </p>
        </div>

        {(form.outreach.channel === "email" || form.outreach.channel === "both") && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Email Body</label>
              <button
                type="button"
                onClick={() => loadTemplateStyle(templateStyle)}
                className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400"
              >
                <RotateCcw className="w-3 h-3" /> Reset to {TEMPLATE_STYLES.find(s => s.id === templateStyle)?.label}
              </button>
            </div>
            <textarea
              value={form.outreach.emailTemplate}
              onChange={e => set("outreach.emailTemplate", e.target.value)}
              rows={10}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue font-mono resize-none"
            />
          </div>
        )}

        {(form.outreach.channel === "sms" || form.outreach.channel === "both") && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">
                SMS Message <span className="text-gray-600">(keep under 160 chars)</span>
              </label>
              <button
                type="button"
                onClick={() => loadTemplateStyle(templateStyle)}
                className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
            <textarea
              value={form.outreach.smsTemplate}
              onChange={e => set("outreach.smsTemplate", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-brand-blue font-mono resize-none"
            />
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
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          onClick={() => onSave({ ...form, status: "active" })}
          disabled={!form.name || form.territory.targetZips.length === 0 || isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {isSaving ? "Saving…" : "Save & Activate"}
        </button>
        <button
          onClick={() => onSave({ ...form, status: "draft" })}
          disabled={!form.name || isSaving}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Save as Draft
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 text-gray-500 text-sm rounded-lg hover:text-gray-300">
          Cancel
        </button>
        {form.territory.targetZips.length === 0 && (
          <p className="text-[11px] text-yellow-500 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Add at least one market to activate
          </p>
        )}
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
