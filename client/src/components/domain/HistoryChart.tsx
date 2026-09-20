import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface HistoryPoint {
  createdAt: string;
  healthScore: number;
}

export function HistoryChart({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="py-10 text-center text-sm text-paper-muted">Not enough history yet — run a few more checks to see a trend.</p>;
  }

  const data = history.map((h) => ({
    time: new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: h.healthScore,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3EA8FF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3EA8FF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E4E1D8" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#E4E1D8" }} />
        <Area type="monotone" dataKey="score" stroke="#3EA8FF" strokeWidth={2} fill="url(#scoreGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
