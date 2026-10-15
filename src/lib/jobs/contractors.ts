/**
 * Government contractors in the Baltimore / DC / Northern Virginia area —
 * the starting list for job boards. Not exhaustive by design:
 * scripts/discover-contractors.ts pulls the full list (including small
 * firms) from USAspending award data, and scripts/verify-job-boards.ts
 * checks each company's job system before it becomes a JobBoard row.
 *
 * Nothing here asserts which job system a company uses; that is discovered
 * and verified live. `focus` is a hint for lanes and the CMS cluster (CMS is
 * headquartered in Woodlawn, Baltimore County, so its contractors are the
 * densest health + civic + Baltimore overlap). `clearanceHeavy` marks firms
 * whose engineering roles mostly require Secret or above; their postings will
 * usually be filtered out, so they are verified last.
 */

export type ContractorTier = "large" | "mid" | "small";
export type ContractorFocus =
  | "cms-health"
  | "civic-digital"
  | "federal-it"
  | "health-research"
  | "infrastructure"
  | "defense-intel"
  | "climate-environment";

/** Agencies a contractor is commonly associated with (hint; awards data confirms). */
export type Agency = "EPA" | "NOAA" | "DOE" | "NASA" | "USGS" | "FEMA" | "CMS" | "VA";

export type Contractor = {
  name: string;
  tier: ContractorTier;
  focus: ContractorFocus[];
  /** Region of the main office, as commonly listed; confirmed by discovery. */
  region: "Baltimore" | "DC" | "NoVA" | "MD" | "Remote-first";
  clearanceHeavy?: boolean;
  nonprofit?: boolean;
  agencies?: Agency[];
};

export const CONTRACTORS: Contractor[] = [
  // --- Large primes ---
  { name: "Booz Allen Hamilton", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Leidos", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "SAIC", tier: "large", focus: ["federal-it"], region: "NoVA" },
  { name: "CACI", tier: "large", focus: ["federal-it"], region: "NoVA" },
  { name: "General Dynamics Information Technology", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Peraton", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "ManTech", tier: "large", focus: ["federal-it"], region: "NoVA", clearanceHeavy: true },
  { name: "Maximus", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "ICF", tier: "large", focus: ["federal-it", "cms-health", "health-research"], region: "NoVA" },
  { name: "Accenture Federal Services", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Guidehouse", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "CGI Federal", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Parsons", tier: "large", focus: ["infrastructure", "federal-it"], region: "NoVA" },
  { name: "MITRE", tier: "large", focus: ["federal-it", "cms-health"], region: "NoVA", nonprofit: true },
  { name: "Noblis", tier: "large", focus: ["federal-it", "health-research"], region: "NoVA", nonprofit: true },
  { name: "Johns Hopkins Applied Physics Laboratory", tier: "large", focus: ["defense-intel", "health-research"], region: "MD", clearanceHeavy: true, nonprofit: true },

  // --- Mid-tier federal IT ---
  { name: "ActioNet", tier: "mid", focus: ["federal-it"], region: "NoVA" },
  { name: "Octo", tier: "mid", focus: ["federal-it"], region: "NoVA" },
  { name: "Steampunk", tier: "mid", focus: ["federal-it", "civic-digital"], region: "NoVA" },
  { name: "Karsun Solutions", tier: "mid", focus: ["federal-it"], region: "NoVA" },
  { name: "NetImpact Strategies", tier: "mid", focus: ["federal-it"], region: "NoVA" },
  { name: "Excella", tier: "mid", focus: ["federal-it", "civic-digital"], region: "NoVA" },
  { name: "Ventera", tier: "mid", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Pyramid Systems", tier: "mid", focus: ["federal-it"], region: "NoVA" },
  { name: "Credence Management Solutions", tier: "mid", focus: ["federal-it", "cms-health"], region: "NoVA" },
  { name: "Mathematica", tier: "mid", focus: ["health-research", "cms-health"], region: "DC" },
  { name: "Bixal", tier: "mid", focus: ["civic-digital"], region: "NoVA" },

  // --- CMS cluster (Baltimore / Woodlawn and nearby) ---
  { name: "Softrams", tier: "mid", focus: ["cms-health", "civic-digital"], region: "NoVA" },
  { name: "NewWave", tier: "mid", focus: ["cms-health"], region: "Baltimore" },
  { name: "Index Analytics", tier: "small", focus: ["cms-health"], region: "Baltimore" },
  { name: "Sparksoft", tier: "small", focus: ["cms-health"], region: "MD" },
  { name: "Semanticbits", tier: "mid", focus: ["cms-health"], region: "NoVA" },
  { name: "Bellese Technologies", tier: "small", focus: ["cms-health", "civic-digital"], region: "Baltimore" },
  { name: "Fearless", tier: "small", focus: ["civic-digital", "cms-health"], region: "Baltimore" },

  // --- Civic digital services (often remote-first) ---
  { name: "Nava PBC", tier: "mid", focus: ["civic-digital", "cms-health"], region: "Remote-first" },
  { name: "Ad Hoc", tier: "mid", focus: ["civic-digital", "cms-health"], region: "Remote-first" },
  { name: "Skylight", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "Oddball", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "Truss", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "Coforma", tier: "small", focus: ["civic-digital", "cms-health"], region: "Remote-first" },
  { name: "Agile Six", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "Flexion", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "CivicActions", tier: "small", focus: ["civic-digital"], region: "Remote-first" },
  { name: "Aquia", tier: "small", focus: ["federal-it", "civic-digital"], region: "Remote-first" },
  { name: "Code for America", tier: "mid", focus: ["civic-digital"], region: "Remote-first", nonprofit: true },
  { name: "U.S. Digital Response", tier: "small", focus: ["civic-digital"], region: "Remote-first", nonprofit: true },

  // --- Climate & environment agencies (EPA, NOAA, DOE, NASA Earth science) ---
  // Several are Maryland-based around NOAA (Silver Spring) and NASA Goddard (Greenbelt).
  { name: "Eastern Research Group", tier: "mid", focus: ["climate-environment"], region: "DC", agencies: ["EPA"] },
  { name: "Abt Global", tier: "large", focus: ["climate-environment", "health-research"], region: "MD", agencies: ["EPA"] },
  { name: "Industrial Economics", tier: "small", focus: ["climate-environment"], region: "Remote-first", agencies: ["EPA", "NOAA"] },
  { name: "RTI International", tier: "large", focus: ["climate-environment", "health-research"], region: "Remote-first", nonprofit: true, agencies: ["EPA"] },
  { name: "Tetra Tech", tier: "large", focus: ["climate-environment", "infrastructure"], region: "NoVA", agencies: ["EPA", "FEMA"] },
  { name: "I.M. Systems Group", tier: "mid", focus: ["climate-environment"], region: "MD", agencies: ["NOAA"] },
  { name: "Earth Resources Technology", tier: "mid", focus: ["climate-environment"], region: "MD", agencies: ["NOAA"] },
  { name: "Global Science & Technology", tier: "mid", focus: ["climate-environment"], region: "MD", agencies: ["NOAA", "NASA"] },
  { name: "Science Systems and Applications", tier: "mid", focus: ["climate-environment"], region: "MD", agencies: ["NASA", "NOAA"] },
  { name: "ADNET Systems", tier: "mid", focus: ["climate-environment"], region: "MD", agencies: ["NASA"] },
  { name: "Lynker", tier: "mid", focus: ["climate-environment"], region: "Remote-first", agencies: ["NOAA"] },
  { name: "Riverside Technology", tier: "small", focus: ["climate-environment"], region: "Remote-first", agencies: ["NOAA"] },
  { name: "Science and Technology Corporation", tier: "small", focus: ["climate-environment"], region: "NoVA", agencies: ["NOAA", "NASA"] },
  { name: "Dewberry", tier: "large", focus: ["infrastructure", "climate-environment"], region: "NoVA", agencies: ["FEMA"] },
];
