import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const data = [
  { name: "Current", value: 125400, fill: "hsl(160, 84%, 39%)" },
  { name: "1-30 days", value: 45200, fill: "hsl(199, 89%, 48%)" },
  { name: "31-60 days", value: 28600, fill: "hsl(38, 92%, 50%)" },
  { name: "61-90 days", value: 12800, fill: "hsl(25, 95%, 53%)" },
  { name: "90+ days", value: 8600, fill: "hsl(0, 72%, 51%)" },
];

export function ARAgingChart() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AR Aging</h3>
          <p className="text-sm text-muted-foreground">Outstanding receivables by age</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">$220,600</p>
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
        </div>
      </div>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={40}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(217, 33%, 16%)"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(222, 47%, 10%)",
                border: "1px solid hsl(217, 33%, 16%)",
                borderRadius: "8px",
                color: "hsl(210, 40%, 98%)",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Amount"]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-xs text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
