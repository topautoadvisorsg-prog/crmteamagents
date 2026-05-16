/**
 * Pre-loaded construction markets — top growing metros in the US
 * Curated for construction companies most likely to lack a website.
 *
 * Selection criteria:
 * - High construction activity (permits, population growth)
 * - High density of small/family-owned contractors (more likely no website)
 * - Markets where digital presence gap is widest
 */

export interface Market {
  id: string;
  city: string;
  state: string;
  stateCode: string;
  tier: "🔥 Hot" | "📈 Growing" | "✅ Solid";
  note: string;
  zips: string[];
}

export const MARKETS: Market[] = [
  // ── Colorado ────────────────────────────────────────────────────────────────
  {
    id: "denver-co",
    city: "Denver",
    state: "Colorado",
    stateCode: "CO",
    tier: "🔥 Hot",
    note: "Massive housing boom, tons of small contractors with no online presence",
    zips: ["80202","80203","80204","80205","80206","80207","80209","80210",
           "80211","80212","80214","80216","80218","80219","80220","80221",
           "80222","80223","80224","80226","80227","80228","80229","80230"],
  },
  {
    id: "colorado-springs-co",
    city: "Colorado Springs",
    state: "Colorado",
    stateCode: "CO",
    tier: "📈 Growing",
    note: "Rapidly expanding suburbs, high demand for residential contractors",
    zips: ["80901","80903","80904","80905","80906","80907","80908","80909",
           "80910","80911","80915","80916","80917","80918","80919","80920",
           "80921","80922","80923","80924","80925","80927","80929"],
  },
  {
    id: "aurora-co",
    city: "Aurora",
    state: "Colorado",
    stateCode: "CO",
    tier: "📈 Growing",
    note: "Fastest-growing Denver suburb, new construction + remodels",
    zips: ["80010","80011","80012","80013","80014","80015","80016","80017","80018","80019"],
  },
  {
    id: "fort-collins-co",
    city: "Fort Collins",
    state: "Colorado",
    stateCode: "CO",
    tier: "✅ Solid",
    note: "University city, steady residential remodeling market",
    zips: ["80521","80522","80523","80524","80525","80526","80527","80528"],
  },
  {
    id: "pueblo-co",
    city: "Pueblo",
    state: "Colorado",
    stateCode: "CO",
    tier: "✅ Solid",
    note: "Smaller market, very few contractors have websites — high conversion potential",
    zips: ["81001","81002","81003","81004","81005","81006","81007","81008"],
  },

  // ── Texas ────────────────────────────────────────────────────────────────────
  {
    id: "houston-tx",
    city: "Houston",
    state: "Texas",
    stateCode: "TX",
    tier: "🔥 Hot",
    note: "#1 construction market in the US — massive contractor density",
    zips: ["77001","77002","77003","77004","77005","77006","77007","77008",
           "77009","77010","77011","77012","77018","77019","77020","77021",
           "77022","77024","77025","77027","77030","77036","77040","77041",
           "77042","77055","77056","77057","77063","77071","77080","77081",
           "77082","77083","77084","77085","77086","77087","77088","77089",
           "77090","77091","77092","77093","77094","77095","77096","77098"],
  },
  {
    id: "dallas-tx",
    city: "Dallas",
    state: "Texas",
    stateCode: "TX",
    tier: "🔥 Hot",
    note: "DFW metro is one of the fastest growing in the country",
    zips: ["75201","75202","75203","75204","75205","75206","75207","75208",
           "75209","75210","75211","75212","75214","75215","75216","75217",
           "75218","75219","75220","75223","75224","75225","75226","75227",
           "75228","75229","75230","75231","75232","75233","75234","75235",
           "75236","75237","75238","75240","75241","75243","75244","75246",
           "75247","75248","75249","75251","75252","75253"],
  },
  {
    id: "san-antonio-tx",
    city: "San Antonio",
    state: "Texas",
    stateCode: "TX",
    tier: "📈 Growing",
    note: "Major military + residential growth, underserved contractor market",
    zips: ["78201","78202","78203","78204","78205","78206","78207","78208",
           "78209","78210","78211","78212","78213","78214","78215","78216",
           "78217","78218","78219","78220","78221","78222","78223","78224",
           "78225","78226","78227","78228","78229","78230","78231","78232",
           "78233","78234","78235","78237","78238","78239","78240","78242"],
  },
  {
    id: "austin-tx",
    city: "Austin",
    state: "Texas",
    stateCode: "TX",
    tier: "🔥 Hot",
    note: "Tech boom driving massive residential construction demand",
    zips: ["78701","78702","78703","78704","78705","78712","78717","78718",
           "78719","78721","78722","78723","78724","78725","78726","78727",
           "78728","78729","78730","78731","78732","78733","78734","78735",
           "78736","78737","78738","78739","78741","78742","78744","78745",
           "78746","78747","78748","78749","78750","78751","78752","78753",
           "78754","78756","78757","78758","78759"],
  },

  // ── Florida ──────────────────────────────────────────────────────────────────
  {
    id: "miami-fl",
    city: "Miami",
    state: "Florida",
    stateCode: "FL",
    tier: "🔥 Hot",
    note: "Hurricane repair + new builds — enormous contractor base, most unlisted online",
    zips: ["33101","33109","33125","33126","33127","33128","33129","33130",
           "33131","33132","33133","33134","33135","33136","33137","33138",
           "33139","33140","33141","33142","33143","33144","33145","33146",
           "33147","33150","33155","33156","33157","33160","33161","33162",
           "33165","33166","33167","33168","33169","33172","33173","33174",
           "33175","33176","33177","33178","33179","33180","33183","33184",
           "33185","33186","33189","33190","33193","33196"],
  },
  {
    id: "fort-lauderdale-fl",
    city: "Fort Lauderdale",
    state: "Florida",
    stateCode: "FL",
    tier: "📈 Growing",
    note: "Broward County — huge roofing + remodeling demand post-hurricanes",
    zips: ["33301","33304","33305","33306","33308","33309","33310","33311",
           "33312","33313","33314","33315","33316","33317","33319","33321",
           "33322","33323","33324","33325","33326","33328","33330","33331",
           "33334","33351"],
  },
  {
    id: "orlando-fl",
    city: "Orlando",
    state: "Florida",
    stateCode: "FL",
    tier: "📈 Growing",
    note: "Tourism + residential boom, large small-contractor base",
    zips: ["32801","32803","32804","32805","32806","32807","32808","32809",
           "32810","32811","32812","32814","32817","32818","32819","32820",
           "32821","32822","32824","32825","32826","32827","32828","32829",
           "32832","32833","32835","32836","32837","32839"],
  },
  {
    id: "tampa-fl",
    city: "Tampa",
    state: "Florida",
    stateCode: "FL",
    tier: "📈 Growing",
    note: "One of fastest growing metros, high remodeling + storm repair volume",
    zips: ["33601","33602","33603","33604","33605","33606","33607","33608",
           "33609","33610","33611","33612","33613","33614","33615","33616",
           "33617","33618","33619","33620","33621","33622","33624","33625",
           "33626","33629","33634","33635","33637","33647"],
  },
  {
    id: "jacksonville-fl",
    city: "Jacksonville",
    state: "Florida",
    stateCode: "FL",
    tier: "✅ Solid",
    note: "Fastest growing large city in FL, large contractor base with low web presence",
    zips: ["32099","32201","32202","32204","32205","32206","32207","32208",
           "32209","32210","32211","32212","32214","32216","32217","32218",
           "32219","32220","32221","32222","32223","32224","32225","32226",
           "32227","32228","32233","32234","32244","32246","32250","32254",
           "32256","32257","32258","32259","32266"],
  },

  // ── Georgia ──────────────────────────────────────────────────────────────────
  {
    id: "atlanta-ga",
    city: "Atlanta",
    state: "Georgia",
    stateCode: "GA",
    tier: "🔥 Hot",
    note: "Massive suburban expansion, film industry driving luxury builds",
    zips: ["30301","30303","30305","30306","30307","30308","30309","30310",
           "30311","30312","30313","30314","30315","30316","30317","30318",
           "30319","30324","30326","30327","30328","30329","30331","30336",
           "30337","30338","30339","30340","30341","30342","30344","30345",
           "30346","30349","30350","30354","30360"],
  },
  {
    id: "savannah-ga",
    city: "Savannah",
    state: "Georgia",
    stateCode: "GA",
    tier: "✅ Solid",
    note: "Port growth, historic renovation + new construction",
    zips: ["31401","31402","31403","31404","31405","31406","31407","31408",
           "31409","31410","31411","31412","31414","31415","31416","31419","31421"],
  },

  // ── North Carolina ───────────────────────────────────────────────────────────
  {
    id: "charlotte-nc",
    city: "Charlotte",
    state: "North Carolina",
    stateCode: "NC",
    tier: "🔥 Hot",
    note: "Banking hub, huge residential expansion into suburbs",
    zips: ["28201","28202","28203","28204","28205","28206","28207","28208",
           "28209","28210","28211","28212","28213","28214","28215","28216",
           "28217","28226","28227","28244","28262","28269","28270","28271",
           "28273","28277","28278"],
  },
  {
    id: "raleigh-nc",
    city: "Raleigh",
    state: "North Carolina",
    stateCode: "NC",
    tier: "📈 Growing",
    note: "Research Triangle boom — Research + tech workers buying homes",
    zips: ["27601","27603","27604","27605","27606","27607","27608","27609",
           "27610","27612","27613","27614","27615","27616","27617","27695"],
  },

  // ── Tennessee ────────────────────────────────────────────────────────────────
  {
    id: "nashville-tn",
    city: "Nashville",
    state: "Tennessee",
    stateCode: "TN",
    tier: "🔥 Hot",
    note: "#2 fastest growing city, enormous residential + commercial construction",
    zips: ["37201","37203","37204","37205","37206","37207","37208","37209",
           "37210","37211","37212","37213","37214","37215","37216","37217",
           "37218","37219","37220","37221","37228","37229","37232","37238"],
  },
  {
    id: "memphis-tn",
    city: "Memphis",
    state: "Tennessee",
    stateCode: "TN",
    tier: "✅ Solid",
    note: "Affordable housing, high remodeling demand, small contractors dominant",
    zips: ["38101","38103","38104","38105","38106","38107","38108","38109",
           "38111","38112","38113","38114","38115","38116","38117","38118",
           "38119","38120","38122","38125","38126","38127","38128","38131",
           "38132","38133","38134","38135","38138","38139","38141"],
  },

  // ── Arizona ──────────────────────────────────────────────────────────────────
  {
    id: "phoenix-az",
    city: "Phoenix",
    state: "Arizona",
    stateCode: "AZ",
    tier: "🔥 Hot",
    note: "Year-round construction, massive suburban sprawl, huge contractor base",
    zips: ["85001","85003","85004","85006","85007","85008","85009","85012",
           "85013","85014","85015","85016","85017","85018","85019","85020",
           "85021","85022","85023","85024","85027","85028","85029","85031",
           "85032","85033","85034","85035","85037","85040","85041","85042",
           "85043","85044","85045","85048","85050","85051","85053","85054"],
  },
  {
    id: "tucson-az",
    city: "Tucson",
    state: "Arizona",
    stateCode: "AZ",
    tier: "✅ Solid",
    note: "University town, steady construction, underserved digital market",
    zips: ["85701","85703","85704","85705","85706","85707","85708","85709",
           "85710","85711","85712","85713","85714","85715","85716","85718",
           "85719","85721","85726","85730","85741","85742","85743","85745",
           "85746","85747","85748","85749","85750"],
  },

  // ── Nevada ───────────────────────────────────────────────────────────────────
  {
    id: "las-vegas-nv",
    city: "Las Vegas",
    state: "Nevada",
    stateCode: "NV",
    tier: "📈 Growing",
    note: "Non-stop building, contractors can't keep up with demand",
    zips: ["89101","89102","89103","89104","89106","89107","89108","89109",
           "89110","89113","89115","89117","89118","89119","89120","89121",
           "89122","89123","89124","89128","89129","89130","89131","89134",
           "89135","89138","89139","89141","89142","89143","89144","89145",
           "89146","89147","89148","89149","89156","89166","89178","89179","89183"],
  },

  // ── Ohio ─────────────────────────────────────────────────────────────────────
  {
    id: "columbus-oh",
    city: "Columbus",
    state: "Ohio",
    stateCode: "OH",
    tier: "📈 Growing",
    note: "Intel fab + data center boom driving massive contractor demand",
    zips: ["43085","43201","43202","43203","43204","43205","43206","43207",
           "43209","43210","43211","43212","43213","43214","43215","43216",
           "43217","43219","43220","43221","43222","43223","43224","43227",
           "43228","43229","43230","43231","43232","43235"],
  },
  {
    id: "cleveland-oh",
    city: "Cleveland",
    state: "Ohio",
    stateCode: "OH",
    tier: "✅ Solid",
    note: "Older housing stock = huge remodeling market, many small contractors",
    zips: ["44101","44102","44103","44104","44105","44106","44107","44108",
           "44109","44110","44111","44112","44113","44114","44115","44116",
           "44118","44119","44120","44121","44122","44124","44125","44126",
           "44127","44128","44129","44130","44131","44132","44134","44135"],
  },

  // ── California ───────────────────────────────────────────────────────────────
  {
    id: "los-angeles-ca",
    city: "Los Angeles",
    state: "California",
    stateCode: "CA",
    tier: "🔥 Hot",
    note: "Wildfire rebuilds + ADU boom = enormous unmet contractor demand",
    zips: ["90001","90002","90003","90004","90005","90006","90007","90008",
           "90010","90011","90012","90013","90014","90015","90016","90017",
           "90018","90019","90020","90021","90022","90023","90024","90025",
           "90026","90027","90028","90029","90031","90032","90033","90034",
           "90035","90036","90037","90038","90039","90041","90042","90043",
           "90044","90045","90046","90047","90048","90049","90056","90057",
           "90058","90059","90061","90062","90063","90064","90065","90066",
           "90067","90068","90069","90071","90077"],
  },
  {
    id: "san-diego-ca",
    city: "San Diego",
    state: "California",
    stateCode: "CA",
    tier: "📈 Growing",
    note: "Military base + tech growth, ADU law driving massive remodel demand",
    zips: ["92101","92102","92103","92104","92105","92106","92107","92108",
           "92109","92110","92111","92113","92114","92115","92116","92117",
           "92119","92120","92121","92122","92123","92124","92126","92127",
           "92128","92129","92130","92131","92132","92134","92135","92136",
           "92139","92140","92145","92147","92154","92161","92173"],
  },

  // ── Utah ─────────────────────────────────────────────────────────────────────
  {
    id: "salt-lake-city-ut",
    city: "Salt Lake City",
    state: "Utah",
    stateCode: "UT",
    tier: "📈 Growing",
    note: "Tech corridor growth, massive housing shortage = huge contractor demand",
    zips: ["84101","84102","84103","84104","84105","84106","84107","84108",
           "84109","84110","84111","84112","84113","84115","84116","84117",
           "84118","84119","84120","84121","84123","84124","84128","84180"],
  },

  // ── South Carolina ───────────────────────────────────────────────────────────
  {
    id: "charleston-sc",
    city: "Charleston",
    state: "South Carolina",
    stateCode: "SC",
    tier: "📈 Growing",
    note: "Coastal boom, hurricane rebuilds, retiree influx driving construction",
    zips: ["29401","29403","29404","29405","29406","29407","29409","29410",
           "29412","29414","29418","29420","29423","29424","29425","29426",
           "29429","29445","29455","29456","29461","29466","29483","29485","29492"],
  },
];

// ── Helper functions ──────────────────────────────────────────────────────────

export const STATES = [...new Set(MARKETS.map(m => m.stateCode))].sort();

export function getMarketsByState(stateCode: string): Market[] {
  return MARKETS.filter(m => m.stateCode === stateCode);
}

export function getMarketById(id: string): Market | undefined {
  return MARKETS.find(m => m.id === id);
}

export const TIER_ORDER = { "🔥 Hot": 0, "📈 Growing": 1, "✅ Solid": 2 };

export const SORTED_MARKETS = [...MARKETS].sort(
  (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
);

// Industries preset list
export const INDUSTRIES = [
  "General Contractor",
  "Roofing / Roofer",
  "Painter / Painting",
  "Electrician",
  "Plumber / Plumbing",
  "HVAC",
  "Landscaper / Landscaping",
  "Flooring / Tile",
  "Remodeling / Renovation",
  "Custom Home Builder",
  "Concrete / Foundation",
  "Fencing",
  "Deck / Patio Builder",
  "Drywall",
  "Siding / Gutters",
];
