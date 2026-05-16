/**
 * Lead Sourcer — Proactive Construction Company Discovery
 *
 * Searches for construction companies that have NO website using:
 *   1. Google Places API (Nearby Search) — when GOOGLE_PLACES_API_KEY is set
 *   2. Demo mode — realistic fake construction companies for testing without paid APIs
 *
 * For each qualifying company (no website field), we push a lead_ingested event
 * to the Redis stream so the orchestrator picks it up and runs the pipeline.
 *
 * ZIP → Lat/Lng via OpenStreetMap Nominatim (free, no key needed).
 */

import axios from "axios";
import { pushToStream, STREAMS } from "../../infrastructure/redis";
import { pushActivity } from "../activity-feed";
import { markZipSearched, isZipAvailable } from "../territory";
import { AgentConfig } from "../agent-config";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DiscoveredLead {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  businessType: string;
  source: "google_places" | "demo";
  placeId?: string;
  notes?: string;
}

export interface SourcerResult {
  zip: string;
  leadsFound: number;
  leadsQueued: number;
  source: "google_places" | "demo";
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// OpenStreetMap Nominatim — ZIP → Lat/Lng (free, no key)
// ────────────────────────────────────────────────────────────────────────────

async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`;
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "SmartKlix-LeadSourcer/1.0 (contact@smartklix.com)" },
    });
    if (res.data && res.data.length > 0) {
      return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) };
    }
  } catch (err: any) {
    console.warn(`[LeadSourcer] Geocode failed for ZIP ${zip}:`, err.message);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Google Places API — Nearby Search + Place Details
// ────────────────────────────────────────────────────────────────────────────

interface PlaceResult {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_phone_number?: string;
  website?: string;
  formatted_address?: string;
}

async function googleNearbySearch(lat: number, lng: number, radius = 10000): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const types = ["general_contractor", "roofing_contractor", "painter", "electrician", "plumber"];
  const allResults: PlaceResult[] = [];

  for (const type of types) {
    try {
      const url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
      const res = await axios.get(url, {
        params: { location: `${lat},${lng}`, radius, type, key: apiKey },
        timeout: 10000,
      });
      if (res.data.results) {
        allResults.push(...res.data.results);
      }
    } catch (err: any) {
      console.warn(`[LeadSourcer] Google Places search failed (${type}):`, err.message);
    }
  }

  // Deduplicate by place_id
  const seen = new Set<string>();
  return allResults.filter(p => {
    if (seen.has(p.place_id)) return false;
    seen.add(p.place_id);
    return true;
  });
}

async function googlePlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const url = "https://maps.googleapis.com/maps/api/place/details/json";
    const res = await axios.get(url, {
      params: {
        place_id: placeId,
        fields: "name,formatted_address,formatted_phone_number,website,place_id",
        key: apiKey,
      },
      timeout: 10000,
    });
    return res.data.result ?? null;
  } catch (err: any) {
    console.warn(`[LeadSourcer] Place details failed (${placeId}):`, err.message);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Demo Mode — realistic fake construction companies (no API key required)
// ────────────────────────────────────────────────────────────────────────────

const COMPANY_PREFIXES = [
  "A1", "All-Pro", "Alpine", "Apex", "Arrow", "Atlas", "Blue Ridge", "Capital",
  "Cardinal", "Central", "Classic", "Colonial", "Commerce", "Crown", "Delta",
  "Diamond", "Eagle", "Elite", "Empire", "Excel", "First Choice", "Freedom",
  "Frontier", "Genesis", "Golden State", "Grand", "Great Plains", "Heritage",
  "Highland", "Horizon", "Icon", "Imperial", "Integrity", "Iron", "Junction",
  "Keystone", "Landmark", "Legacy", "Liberty", "Lincoln", "Lone Star",
  "Magnolia", "Metro", "Midwest", "Millennium", "Mountain", "National",
  "Noble", "North Star", "Oak", "Pacific", "Patriot", "Peak", "Piedmont",
  "Pioneer", "Premier", "Pride", "Pro-Build", "Quality", "Reliable", "Ridge",
  "River", "Rock Solid", "Rocky Mountain", "Royal", "Sentinel", "Sierra",
  "Silver", "Skyline", "Solid Ground", "Southern", "Sunbelt", "Superior",
  "Summit", "Sunrise", "Sunset", "Thunder", "Timber", "Titan", "Tri-State",
  "True", "United", "Universal", "Valley", "Veteran", "Victory", "Viper",
  "Vista", "Volunteer", "Westside", "Western", "Wilson", "Woodlands", "Zenith"
];

const COMPANY_SUFFIXES = [
  "Construction", "Builders", "Contractors", "Building Co.", "Construction LLC",
  "General Contractors", "Contracting", "Home Improvement", "Roofing & Construction",
  "Remodeling", "Renovation", "Building Services", "Construction Services",
  "Builders & Contractors", "Construction Group", "Building Group"
];

const FIRST_NAMES = [
  "Mike", "Dave", "Tom", "Bob", "Steve", "Jim", "Rick", "Joe", "Bill", "Gary",
  "Larry", "Kevin", "Scott", "Brian", "Mark", "Jeff", "Chris", "Dan", "Paul",
  "Greg", "Tim", "Terry", "Frank", "Ron", "Ray", "Dale", "Roy", "Todd", "Randy"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris",
  "Martin", "Thompson", "Martinez", "Robinson", "Clark", "Lewis", "Lee", "Walker",
  "Hall", "Allen", "Young", "King", "Wright", "Scott", "Torres", "Nguyen"
];

const STREET_NAMES = [
  "Main St", "Oak Ave", "Elm St", "Maple Dr", "Cedar Rd", "Pine St", "Washington Blvd",
  "Industrial Pkwy", "Commerce Dr", "Business Park Dr", "Highway 41", "Route 9",
  "County Rd 15", "State Hwy 30", "Old Mill Rd", "Railroad Ave", "Depot St"
];

const AREA_CODES_BY_STATE: Record<string, string[]> = {
  TX: ["214", "469", "972", "817", "682", "512", "737", "830"],
  FL: ["305", "786", "954", "561", "407", "321", "813", "727"],
  CA: ["213", "310", "323", "424", "714", "818", "626", "909"],
  NY: ["212", "718", "347", "646", "516", "914", "845", "315"],
  OH: ["614", "513", "216", "330", "440", "937", "419", "234"],
  GA: ["404", "678", "770", "470", "706", "762", "912", "478"],
  NC: ["704", "980", "919", "984", "910", "252", "336", "743"],
  PA: ["215", "267", "412", "878", "484", "610", "717", "570"],
  IL: ["312", "773", "847", "708", "630", "224", "331", "618"],
  AZ: ["480", "602", "623", "520", "928", "602"],
  DEFAULT: ["555", "444", "333", "222"],
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateDemoLeads(zip: string, city: string, state: string, count: number): DiscoveredLead[] {
  const leads: DiscoveredLead[] = [];
  const seed = zip.split("").reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
  const rng = seededRandom(seed);

  // how many to actually skip (simulate real filtering — ~35% have no website)
  const totalCandidates = Math.ceil(count / 0.35);

  for (let i = 0; i < totalCandidates && leads.length < count; i++) {
    const localRng = seededRandom(seed + i * 7919);
    const hasWebsite = localRng() > 0.35; // 35% have no website → those are our leads
    if (hasWebsite) continue;

    const prefix = pick(COMPANY_PREFIXES, rng);
    const suffix = pick(COMPANY_SUFFIXES, rng);
    const firstName = pick(FIRST_NAMES, rng);
    const lastName = pick(LAST_NAMES, rng);
    const streetNum = Math.floor(rng() * 9000) + 100;
    const street = pick(STREET_NAMES, rng);
    const areaCodes = AREA_CODES_BY_STATE[state] ?? AREA_CODES_BY_STATE.DEFAULT;
    const areaCode = pick(areaCodes, rng);
    const phoneNum = `${Math.floor(rng() * 900) + 100}-${Math.floor(rng() * 9000) + 1000}`;

    const useOwnerName = rng() > 0.6;
    const companyName = useOwnerName
      ? `${firstName} ${lastName} ${suffix}`
      : `${prefix} ${suffix}`;

    leads.push({
      name: companyName,
      phone: `(${areaCode}) ${phoneNum}`,
      email: undefined, // most don't have a discoverable email either
      address: `${streetNum} ${street}`,
      city,
      state,
      zip,
      businessType: "construction",
      source: "demo",
      notes: `No website found. Discovered via demo sourcer for ZIP ${zip}. Owner: ${firstName} ${lastName}.`,
    });
  }

  return leads;
}

// ────────────────────────────────────────────────────────────────────────────
// ZIP → City/State lookup (Nominatim already returns this)
// ────────────────────────────────────────────────────────────────────────────

async function getZipInfo(zip: string): Promise<{ city: string; state: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1&addressdetails=1`;
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "SmartKlix-LeadSourcer/1.0 (contact@smartklix.com)" },
    });
    if (res.data && res.data.length > 0) {
      const addr = res.data[0].address || {};
      const city = addr.city || addr.town || addr.village || addr.county || "Unknown City";
      const state = addr.state_code || addr.state || "XX";
      return { city, state };
    }
  } catch {}
  return { city: "Unknown City", state: "XX" };
}

// ────────────────────────────────────────────────────────────────────────────
// Core Sourcer — runs for one ZIP code
// ────────────────────────────────────────────────────────────────────────────

export async function sourceLeadsForZip(
  zip: string,
  agent: AgentConfig,
  options: { maxLeads?: number; demoLeadsPerZip?: number } = {}
): Promise<SourcerResult> {
  const maxLeads = options.maxLeads ?? 10;
  const demoCount = options.demoLeadsPerZip ?? 5;
  const hasGoogleKey = !!process.env.GOOGLE_PLACES_API_KEY;

  // Check territory cooldown
  const available = await isZipAvailable(zip);
  if (!available) {
    console.log(`[LeadSourcer] ZIP ${zip} is in cooldown — skipping`);
    return { zip, leadsFound: 0, leadsQueued: 0, source: hasGoogleKey ? "google_places" : "demo" };
  }

  console.log(`[LeadSourcer] Sourcing ZIP ${zip} (agent: ${agent.name}, mode: ${hasGoogleKey ? "Google Places" : "demo"})`);

  let discoveredLeads: DiscoveredLead[] = [];
  const sourceMode: "google_places" | "demo" = hasGoogleKey ? "google_places" : "demo";

  try {
    if (hasGoogleKey) {
      // --- Google Places path ---
      const geo = await geocodeZip(zip);
      if (!geo) {
        console.warn(`[LeadSourcer] Could not geocode ZIP ${zip}, skipping`);
        return { zip, leadsFound: 0, leadsQueued: 0, source: "google_places", error: "geocode_failed" };
      }

      const places = await googleNearbySearch(geo.lat, geo.lng);
      const zipInfo = await getZipInfo(zip);

      for (const place of places.slice(0, maxLeads * 3)) {
        if (discoveredLeads.length >= maxLeads) break;
        const details = await googlePlaceDetails(place.place_id);
        if (!details) continue;

        // KEY FILTER: only companies WITHOUT a website
        if (details.website) continue;

        discoveredLeads.push({
          name: details.name,
          phone: details.formatted_phone_number,
          address: details.formatted_address,
          city: zipInfo.city,
          state: zipInfo.state,
          zip,
          businessType: "construction",
          source: "google_places",
          placeId: details.place_id,
          notes: `No website found via Google Places. Search ZIP: ${zip}.`,
        });

        // Brief delay to respect Google rate limits
        await new Promise(r => setTimeout(r, 150));
      }
    } else {
      // --- Demo mode path ---
      const zipInfo = await getZipInfo(zip).catch(() => ({ city: "Demo City", state: "TX" }));
      discoveredLeads = generateDemoLeads(zip, zipInfo.city, zipInfo.state, demoCount);
    }
  } catch (err: any) {
    console.error(`[LeadSourcer] Error sourcing ZIP ${zip}:`, err.message);
    return { zip, leadsFound: 0, leadsQueued: 0, source: sourceMode, error: err.message };
  }

  // ── Push qualifying leads to Redis stream ──────────────────────────────
  let queued = 0;
  for (const lead of discoveredLeads) {
    try {
      await pushToStream(STREAMS.EVENTS, {
        event_type: "lead_ingested",
        source: `lead-sourcer-${sourceMode}`,
        agent_id: agent.id,
        agent_name: agent.name,
        timestamp: new Date().toISOString(),
        data: {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          business_type: lead.businessType,
          notes: lead.notes,
          place_id: lead.placeId,
          no_website: true,
          discovery_source: sourceMode,
        },
      });
      queued++;

      await pushActivity({
        level: "success",
        category: "prospect",
        message: `New lead discovered: ${lead.name}${lead.city ? ` — ${lead.city}, ${lead.state}` : ""}`,
        meta: {
          zip,
          name: lead.name,
          phone: lead.phone,
          source: sourceMode,
          agent: agent.name,
          no_website: true,
        },
      });

      // Small delay between stream pushes to avoid burst
      await new Promise(r => setTimeout(r, 50));
    } catch (err: any) {
      console.error(`[LeadSourcer] Failed to queue lead ${lead.name}:`, err.message);
    }
  }

  // ── Mark ZIP as searched in territory service ──────────────────────────
  await markZipSearched({
    zip,
    city: discoveredLeads[0]?.city,
    state: discoveredLeads[0]?.state,
    prospectsFound: queued,
    cooldownDays: agent.territory.cooldownDays ?? 90,
  }).catch(() => {});

  await pushActivity({
    level: "info",
    category: "territory",
    message: `ZIP ${zip} searched — ${queued} lead${queued !== 1 ? "s" : ""} queued (${sourceMode})`,
    meta: { zip, leadsFound: discoveredLeads.length, leadsQueued: queued, agent: agent.name, mode: sourceMode },
  });

  console.log(`[LeadSourcer] ZIP ${zip} complete — ${queued}/${discoveredLeads.length} leads queued`);

  return {
    zip,
    leadsFound: discoveredLeads.length,
    leadsQueued: queued,
    source: sourceMode,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Run a full sourcer pass for one agent (all its target ZIPs)
// ────────────────────────────────────────────────────────────────────────────

export async function runSourcerForAgent(agent: AgentConfig): Promise<{
  agentId: string;
  agentName: string;
  zipsProcessed: number;
  totalLeadsQueued: number;
  results: SourcerResult[];
}> {
  const zips = agent.territory.targetZips ?? [];
  if (zips.length === 0) {
    console.warn(`[LeadSourcer] Agent "${agent.name}" has no target ZIPs configured`);
    return { agentId: agent.id, agentName: agent.name, zipsProcessed: 0, totalLeadsQueued: 0, results: [] };
  }

  await pushActivity({
    level: "info",
    category: "system",
    message: `Lead sourcer started for agent "${agent.name}" — ${zips.length} ZIP${zips.length !== 1 ? "s" : ""} in territory`,
    meta: { agentId: agent.id, agentName: agent.name, zips },
  });

  const results: SourcerResult[] = [];

  for (const zip of zips) {
    const result = await sourceLeadsForZip(zip, agent);
    results.push(result);

    // 1-second gap between ZIPs to be nice to Nominatim
    await new Promise(r => setTimeout(r, 1000));
  }

  const totalLeadsQueued = results.reduce((sum, r) => sum + r.leadsQueued, 0);

  await pushActivity({
    level: totalLeadsQueued > 0 ? "success" : "info",
    category: "system",
    message: `Lead sourcer pass complete for "${agent.name}" — ${totalLeadsQueued} total lead${totalLeadsQueued !== 1 ? "s" : ""} queued across ${results.length} ZIP${results.length !== 1 ? "s" : ""}`,
    meta: { agentId: agent.id, agentName: agent.name, totalLeadsQueued, zipsProcessed: results.length },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
    zipsProcessed: results.length,
    totalLeadsQueued,
    results,
  };
}
