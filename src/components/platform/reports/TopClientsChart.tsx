"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import {
  axisTick,
  chartColors,
  compactCents,
  tooltipContentStyle,
} from "./RevenueByMonthChart";

export default function TopClientsChart({
  data,
}: {
  data: { name: string; cents: number }[];
}) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={compactCents}
            tickLine={false}
            axisLine={{ stroke: chartColors.hairline }}
            tick={axisTick}
            tickMargin={8}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ ...axisTick, fill: chartColors.ink }}
          />
          <Tooltip
            cursor={{ fill: "rgba(147, 164, 136, 0.14)" }}
            contentStyle={tooltipContentStyle}
            labelStyle={{ color: chartColors.ink, fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: chartColors.inkMuted }}
            formatter={(value) => [formatCents(Number(value)), "Paid revenue"]}
          />
          <Bar dataKey="cents" name="Paid revenue" radius={[0, 3, 3, 0]} maxBarSize={28}>
            {data.map((entry, i) => (
              <Cell
                key={entry.name}
                // Emphasize the top client in forest; the rest stay sage.
                fill={i === 0 ? chartColors.forest : chartColors.sage}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
