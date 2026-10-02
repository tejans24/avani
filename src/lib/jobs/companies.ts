/**
 * Nationwide remote-friendly mission employers: climate / conservation and
 * health / civic, alongside the regional gov contractors in contractors.ts.
 * A starting list to verify (scripts/verify-job-boards.ts), not exhaustive.
 *
 * `stage` matters for the owner's "stable, lender-recognizable pay" must-have:
 * public companies, large nonprofits and late-stage private companies are
 * listed first; earlier-stage startups are included because much climate
 * work lives there, but their postings take the Series A–C penalty in
 * scoring. Nothing here asserts which job system a company uses; that is
 * discovered and verified live.
 *
 * Federal climate civil-service roles (EPA, NOAA, DOE) come from USAJOBS.
 * The national labs do NOT post on USAJOBS: they are contractor-operated
 * FFRDCs with their own career sites, listed below. Weapons labs (LANL,
 * LLNL, Sandia) are left out: their roles almost all need Q/L clearances.
 */

export type EmployerStage = "public" | "nonprofit" | "late-private" | "startup" | "national-lab";
export type EmployerFocus = "climate" | "conservation" | "energy-grid" | "earth-data" | "health" | "civic";

export type Employer = {
  name: string;
  stage: EmployerStage;
  focus: EmployerFocus[];
};

export const MISSION_EMPLOYERS: Employer[] = [
  // --- Climate & conservation: nonprofits (stable, mission-first) ---
  { name: "World Resources Institute", stage: "nonprofit", focus: ["climate", "earth-data"] },
  { name: "RMI", stage: "nonprofit", focus: ["climate", "energy-grid"] },
  { name: "Environmental Defense Fund", stage: "nonprofit", focus: ["climate", "conservation"] },
  { name: "The Nature Conservancy", stage: "nonprofit", focus: ["conservation"] },
  { name: "Conservation International", stage: "nonprofit", focus: ["conservation"] },
  { name: "Rewiring America", stage: "nonprofit", focus: ["climate", "energy-grid"] },
  { name: "WattTime", stage: "nonprofit", focus: ["climate", "energy-grid"] },
  { name: "Earthjustice", stage: "nonprofit", focus: ["climate", "conservation"] },

  // --- Climate: public and late-stage companies ---
  { name: "Planet Labs", stage: "public", focus: ["earth-data", "climate"] },
  { name: "Sunrun", stage: "public", focus: ["energy-grid"] },
  { name: "Esri", stage: "late-private", focus: ["earth-data", "conservation"] },
  { name: "Arcadia", stage: "late-private", focus: ["energy-grid", "climate"] },
  { name: "Watershed", stage: "late-private", focus: ["climate"] },
  { name: "Aurora Solar", stage: "late-private", focus: ["energy-grid"] },
  { name: "Palmetto", stage: "late-private", focus: ["energy-grid"] },
  { name: "Uplight", stage: "late-private", focus: ["energy-grid"] },
  { name: "EnergyHub", stage: "late-private", focus: ["energy-grid"] },
  { name: "Redaptive", stage: "late-private", focus: ["energy-grid", "climate"] },

  // --- Climate: earlier-stage (take the Series A–C penalty) ---
  { name: "Pachama", stage: "startup", focus: ["climate", "earth-data"] },
  { name: "Sylvera", stage: "startup", focus: ["climate", "earth-data"] },
  { name: "Persefoni", stage: "startup", focus: ["climate"] },
  { name: "Patch", stage: "startup", focus: ["climate"] },
  { name: "Carbon Direct", stage: "startup", focus: ["climate"] },
  { name: "Camus Energy", stage: "startup", focus: ["energy-grid"] },
  { name: "Kevala", stage: "startup", focus: ["energy-grid", "earth-data"] },
  { name: "Voltus", stage: "startup", focus: ["energy-grid"] },
  { name: "Raptor Maps", stage: "startup", focus: ["energy-grid", "earth-data"] },
  { name: "Overstory", stage: "startup", focus: ["conservation", "earth-data"] },

  // --- DOE national labs (own career sites; stable, mission-first) ---
  { name: "National Renewable Energy Laboratory", stage: "national-lab", focus: ["energy-grid", "climate"] },
  { name: "Pacific Northwest National Laboratory", stage: "national-lab", focus: ["energy-grid", "climate", "earth-data"] },
  { name: "Lawrence Berkeley National Laboratory", stage: "national-lab", focus: ["energy-grid", "climate", "earth-data"] },
  { name: "Oak Ridge National Laboratory", stage: "national-lab", focus: ["energy-grid", "earth-data"] },
  { name: "Argonne National Laboratory", stage: "national-lab", focus: ["energy-grid", "climate"] },

  // --- Health & civic: nationwide remote ---
  { name: "Included Health", stage: "late-private", focus: ["health"] },
  { name: "Flatiron Health", stage: "late-private", focus: ["health"] },
  { name: "Color Health", stage: "late-private", focus: ["health"] },
  { name: "Commure", stage: "late-private", focus: ["health"] },
  { name: "Komodo Health", stage: "late-private", focus: ["health"] },
  { name: "Abridge", stage: "late-private", focus: ["health"] },
  { name: "Zus Health", stage: "startup", focus: ["health"] },
  { name: "Particle Health", stage: "startup", focus: ["health"] },
  { name: "Benefits Data Trust", stage: "nonprofit", focus: ["civic"] },
  { name: "Propel", stage: "startup", focus: ["civic"] },
];
