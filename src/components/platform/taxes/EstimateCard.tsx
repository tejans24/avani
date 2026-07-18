import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import type { EstimateResult } from "@/lib/tax-estimates";

/**
 * Quarterly estimate overview: annualized profit, per-jurisdiction annual
 * estimates, and the cumulative quarterly schedule with the next due row
 * highlighted. The disclaimer is persistent — every consumer of these numbers
 * must show it (see tax-estimates.ts).
 */

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div style={{ minWidth: 150 }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        data-testid={testId}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function EstimateCard({
  estimate,
  ytdNetProfitCents,
  year,
}: {
  estimate: EstimateResult;
  ytdNetProfitCents: number;
  year: number;
}) {
  const nextDueQuarter = estimate.nextDue?.quarter.quarter ?? null;

  return (
    <div className="form-card" style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          margin: "0 0 16px",
          color: "var(--text-primary)",
        }}
      >
        {year} estimated taxes
      </h2>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat
          label="YTD net profit (tax view)"
          value={formatCents(ytdNetProfitCents)}
          testId="ytd-profit"
        />
        <Stat
          label="Annualized profit"
          value={formatCents(estimate.annualizedProfitCents)}
          testId="annualized-profit"
        />
        <Stat label="Est. federal" value={formatCents(estimate.estAnnualFederalCents)} />
        <Stat label="Est. state" value={formatCents(estimate.estAnnualStateCents)} />
        <Stat
          label="Est. total (after withholding)"
          value={formatCents(estimate.estAnnualTotalCents)}
          testId="est-total"
        />
      </div>

      <table className="data-table" data-testid="estimate-schedule">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Due date</th>
            <th className="num">Target (cumulative)</th>
            <th className="num">Paid</th>
            <th className="num">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {estimate.schedule.map((s) => {
            const isNext = s.quarter.quarter === nextDueQuarter;
            return (
              <tr
                key={s.quarter.quarter}
                data-testid={`quarter-row-${s.quarter.quarter}`}
                data-next-due={isNext || undefined}
                style={
                  isNext
                    ? {
                        background: "var(--color-surface-sunken)",
                        fontWeight: 600,
                      }
                    : undefined
                }
              >
                <td>
                  Q{s.quarter.quarter}
                  {isNext && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: "var(--text-xs)",
                        color: "var(--clay)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Next due
                    </span>
                  )}
                </td>
                <td>{formatDateLong(s.quarter.dueDateIso)}</td>
                <td className="num">{formatCents(s.targetCents)}</td>
                <td className="num">{formatCents(s.paidCents)}</td>
                <td className="num" data-testid={`q${s.quarter.quarter}-remaining`}>
                  {formatCents(s.remainingCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p
        style={{
          marginTop: 14,
          marginBottom: 0,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
        }}
      >
        Estimate only — not tax advice. Confirm with your CPA.
      </p>
    </div>
  );
}
