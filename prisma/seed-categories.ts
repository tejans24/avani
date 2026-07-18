/**
 * S-corp (Form 1120-S) chart of categories, shared by prisma/seed.ts and the
 * e2e reset helper. Names are unique keys — seeding upserts by name.
 */
export type CategorySeed = {
  name: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER" | "OWNER";
  taxLine:
    | "GROSS_RECEIPTS"
    | "OFFICER_COMPENSATION"
    | "SALARIES_WAGES"
    | "REPAIRS_MAINTENANCE"
    | "RENTS"
    | "TAXES_LICENSES"
    | "INTEREST"
    | "DEPRECIATION"
    | "ADVERTISING"
    | "EMPLOYEE_BENEFITS"
    | "OTHER_DEDUCTIONS"
    | "NONE";
  deductiblePct?: number;
};

export const CATEGORY_SEEDS: CategorySeed[] = [
  { name: "Client Revenue", kind: "INCOME", taxLine: "GROSS_RECEIPTS" },
  { name: "Other Income", kind: "INCOME", taxLine: "GROSS_RECEIPTS" },
  { name: "Officer Compensation", kind: "EXPENSE", taxLine: "OFFICER_COMPENSATION" },
  { name: "Salaries & Wages", kind: "EXPENSE", taxLine: "SALARIES_WAGES" },
  { name: "Payroll Taxes & Licenses", kind: "EXPENSE", taxLine: "TAXES_LICENSES" },
  { name: "Repairs & Maintenance", kind: "EXPENSE", taxLine: "REPAIRS_MAINTENANCE" },
  { name: "Rent", kind: "EXPENSE", taxLine: "RENTS" },
  { name: "Interest", kind: "EXPENSE", taxLine: "INTEREST" },
  { name: "Depreciation", kind: "EXPENSE", taxLine: "DEPRECIATION" },
  { name: "Advertising & Marketing", kind: "EXPENSE", taxLine: "ADVERTISING" },
  { name: "Employee Benefits", kind: "EXPENSE", taxLine: "EMPLOYEE_BENEFITS" },
  { name: "Software & Subscriptions", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Meals (50%)", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS", deductiblePct: 50 },
  { name: "Travel", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Insurance", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Legal & Professional", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Office Supplies", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Utilities & Phone", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Bank & Payment Fees", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS" },
  { name: "Owner Distribution", kind: "OWNER", taxLine: "NONE" },
  { name: "Owner Contribution", kind: "OWNER", taxLine: "NONE" },
  { name: "Transfer Between Accounts", kind: "TRANSFER", taxLine: "NONE" },
  { name: "Personal (non-business)", kind: "OWNER", taxLine: "NONE" },
];

/**
 * Federal compliance deadlines for an LLC taxed as S-corp, for a given year.
 * State deadlines are added by the user in-app (state varies).
 * leadDays = when the preparation window opens (package/nag).
 */
export function complianceSeedsForYear(year: number): {
  key: string;
  title: string;
  dueDate: string; // ISO
  leadDays: number;
  notes?: string;
}[] {
  return [
    {
      key: `form-1120s-${year}`,
      title: `Form 1120-S (S-corp return) for ${year - 1}`,
      dueDate: `${year}-03-15`,
      leadDays: 45,
      notes: "Accountant package: P&L by 1120-S line, officer comp vs distributions, ledger CSV. File Form 7004 for extension if needed.",
    },
    {
      key: `form-1040-${year}`,
      title: `Personal 1040 for ${year - 1} (needs K-1)`,
      dueDate: `${year}-04-15`,
      leadDays: 30,
    },
    {
      key: `q1-estimate-${year}`,
      title: `Q1 ${year} estimated tax payment`,
      dueDate: `${year}-04-15`,
      leadDays: 14,
    },
    {
      key: `q2-estimate-${year}`,
      title: `Q2 ${year} estimated tax payment`,
      dueDate: `${year}-06-15`,
      leadDays: 14,
    },
    {
      key: `q3-estimate-${year}`,
      title: `Q3 ${year} estimated tax payment`,
      dueDate: `${year}-09-15`,
      leadDays: 14,
    },
    {
      key: `q4-estimate-${year}`,
      title: `Q4 ${year} estimated tax payment`,
      dueDate: `${year + 1}-01-15`,
      leadDays: 14,
    },
    {
      key: `payroll-q1-941-${year}`,
      title: `Q1 ${year} Form 941 (payroll)`,
      dueDate: `${year}-04-30`,
      leadDays: 14,
      notes: "Handled by payroll provider if configured — verify filing.",
    },
    {
      key: `payroll-q2-941-${year}`,
      title: `Q2 ${year} Form 941 (payroll)`,
      dueDate: `${year}-07-31`,
      leadDays: 14,
      notes: "Handled by payroll provider if configured — verify filing.",
    },
    {
      key: `payroll-q3-941-${year}`,
      title: `Q3 ${year} Form 941 (payroll)`,
      dueDate: `${year}-10-31`,
      leadDays: 14,
      notes: "Handled by payroll provider if configured — verify filing.",
    },
    {
      key: `january-payroll-pack-${year}`,
      title: `W-2/W-3, Form 940, Q4 941, 1099-NECs for ${year - 1}`,
      dueDate: `${year}-01-31`,
      leadDays: 21,
      notes: "W-2 for owner salary; 1099-NEC for any contractor paid >= $600.",
    },
  ];
}
