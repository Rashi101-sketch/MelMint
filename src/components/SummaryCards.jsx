import { HiTrendingUp, HiTrendingDown, HiCash, HiShieldCheck } from "react-icons/hi";

const cards = [
  { key: "income", label: "Total Income", icon: HiTrendingUp, color: "text-emerald-400", glow: "glow-income", gradient: "from-emerald-500/10 to-emerald-600/5" },
  { key: "expenses", label: "Total Expenses", icon: HiTrendingDown, color: "text-red-400", glow: "glow-expense", gradient: "from-red-500/10 to-red-600/5" },
  { key: "balance", label: "Net Balance", icon: HiCash, color: "text-mint-400", glow: "glow-mint", gradient: "from-mint-500/10 to-mint-600/5" },
  { key: "saved", label: "Total Saved", icon: HiShieldCheck, color: "text-amber-400", glow: "", gradient: "from-amber-500/10 to-amber-600/5" },
];

export default function SummaryCards({ summary, loading }) {
  const values = {
    income: summary?.totalIncome ?? 0,
    expenses: summary?.totalExpenses ?? 0,
    balance: summary?.netBalance ?? 0,
    saved: summary?.totalSaved ?? 0,
  };

  const format = (n) => `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={`glass-card p-5 bg-gradient-to-br ${card.gradient} ${card.glow} animate-fade-in-up-d${i + 1}`}
          >
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-20 bg-surface-700/50 rounded animate-pulse" />
                <div className="h-7 w-28 bg-surface-700/50 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${card.color}`} />
                  <span className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                    {card.label}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>
                  {card.key === "balance" && values.balance < 0 && "-"}
                  {format(values[card.key])}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
