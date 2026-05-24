import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = [
  "#14b8a6", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#64748b",
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { category, amount, count } = payload[0].payload;
  return (
    <div className="bg-surface-900/95 border border-surface-700/50 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-sm font-semibold text-surface-100">{category}</p>
      <p className="text-xs text-mint-400 font-bold">
        ${amount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
      </p>
      <p className="text-[10px] text-surface-500">{count} transaction{count !== 1 ? "s" : ""}</p>
    </div>
  );
};

export default function ExpenseChart({ categoryBreakdown, loading }) {
  if (loading) {
    return (
      <div className="glass-card p-6 animate-fade-in-up-d4">
        <div className="h-5 w-32 bg-surface-700/50 rounded animate-pulse mb-4" />
        <div className="h-48 bg-surface-700/20 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!categoryBreakdown || categoryBreakdown.length === 0) {
    return (
      <div className="glass-card p-6 text-center animate-fade-in-up-d4">
        <p className="text-3xl mb-2">📊</p>
        <p className="text-surface-400 text-sm">No expense data to display</p>
        <p className="text-surface-600 text-xs mt-1">Add some expenses to see the breakdown</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 animate-fade-in-up-d4">
      <h2 className="text-lg font-semibold text-surface-100 mb-4 flex items-center gap-2">
        📊 Expense Breakdown
      </h2>

      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={categoryBreakdown}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            strokeWidth={0}
          >
            {categoryBreakdown.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span className="text-xs text-surface-400">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
