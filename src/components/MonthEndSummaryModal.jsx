import { HiX, HiArrowRight, HiSparkles } from "react-icons/hi";
import { useNavigate } from "react-router-dom";

export default function MonthEndSummaryModal({ cycle, onClose }) {
  const navigate = useNavigate();

  if (!cycle || !cycle.monthlySummary) return null;

  const ms = cycle.monthlySummary;
  const formatDate = (d) => {
    if (!d) return "";
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  };

  const formatRange = (start, end) => {
    if (!start) return "";
    const s = new Date(start).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const e = end ? new Date(end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
    return `${s} – ${e}`;
  };

  const formatCurrency = (n) =>
    `$${Math.abs(Number(n || 0)).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalIncome = Number(ms.totalSalary || 0) + Number(cycle.interestIncome || 0);
  const totalExpenses = Number(ms.totalExpenses || 0);
  const totalSavings = Number(ms.totalSavings || 0);
  const savingsRate = totalIncome > 0 ? ((totalSavings / totalIncome) * 100).toFixed(1) : 0;

  const monthLabel = formatDate(cycle.startDate);

  const handleGoToHistory = () => {
    onClose?.();
    navigate(`/history?cycleId=${cycle.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div
        className="glass-card max-w-lg w-full p-6 sm:p-7 relative border border-surface-700/60 shadow-2xl shadow-black/80 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-surface-400 hover:text-surface-100 hover:bg-surface-800/60 transition-all cursor-pointer"
          aria-label="Close modal"
        >
          <HiX className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-mint-500/20 to-emerald-500/20 border border-mint-500/30 text-mint-400 mb-3 shadow-lg shadow-mint-500/10 animate-float">
            <HiSparkles className="w-6 h-6" />
          </div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-mint-500/15 text-mint-400 border border-mint-500/30 mb-1.5">
            Month Complete
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-surface-50 tracking-tight">
            {monthLabel} Summary
          </h2>
          <p className="text-xs text-surface-400 mt-0.5">
            {formatRange(cycle.startDate, cycle.endDate)}
          </p>
        </div>

        {/* High-Level Metrics 3-Card Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800/80 text-center">
            <p className="text-[10px] text-surface-500 font-semibold uppercase tracking-wider">Total Income</p>
            <p className="text-sm sm:text-base font-bold text-surface-100 mt-0.5">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800/80 text-center">
            <p className="text-[10px] text-surface-500 font-semibold uppercase tracking-wider">Total Expenses</p>
            <p className="text-sm sm:text-base font-bold text-amber-400 mt-0.5">{formatCurrency(totalExpenses)}</p>
          </div>
          <div className="p-3 rounded-xl bg-mint-950/40 border border-mint-500/30 text-center">
            <p className="text-[10px] text-mint-400 font-semibold uppercase tracking-wider">Total Saved</p>
            <p className="text-sm sm:text-base font-bold text-mint-300 mt-0.5">{formatCurrency(totalSavings)}</p>
          </div>
        </div>

        {/* Savings Rate Pill */}
        <div className="mb-5 p-2.5 rounded-xl bg-surface-900/40 border border-surface-800/60 flex items-center justify-between text-xs">
          <span className="text-surface-400 font-medium">Monthly Savings Rate</span>
          <span className="font-bold text-mint-400">{savingsRate}% of income saved</span>
        </div>

        {/* Two Separate Pools Breakdown */}
        <div className="space-y-3.5 mb-6">
          {/* Pool 1: Salary Allocation */}
          {ms.salaryAllocation && (
            <div className="p-4 rounded-xl bg-surface-900/40 border border-surface-800/80 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-surface-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-mint-400 inline-block" />
                  Pool 1: Salary Allocation
                </span>
                <span className="text-xs font-bold text-mint-400">
                  {formatCurrency(ms.salaryAllocation.availableForGoals)}
                </span>
              </div>
              <p className="text-[11px] text-surface-500">
                Split by income percentages (after rent & commitment)
              </p>
              <div className="space-y-1.5 pt-1">
                {ms.salaryAllocation.breakdown?.map((item) => (
                  <div key={item.goalId} className="flex justify-between items-center text-xs py-1 px-2 rounded-lg bg-surface-800/40">
                    <span className="text-surface-300 font-medium">
                      {item.goalName} ({item.percentage}%)
                    </span>
                    <span className="text-mint-300 font-semibold">
                      +{formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pool 2: Expense Rollover */}
          {ms.expenseRollover && (
            <div className="p-4 rounded-xl bg-surface-900/40 border border-surface-800/80 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-surface-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Pool 2: Expense Rollover
                </span>
                <span className={`text-xs font-bold ${ms.expenseRollover.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {ms.expenseRollover.amount < 0 && "−"}
                  {formatCurrency(ms.expenseRollover.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-surface-400">
                <div>Limit: <span className="text-surface-200 font-semibold">{formatCurrency(ms.expenseRollover.adjustedLimit)}</span></div>
                <div>Spent: <span className="text-surface-200 font-semibold">{formatCurrency(ms.expenseRollover.spent)}</span></div>
              </div>
              <div className="flex justify-between items-center text-xs py-1 px-2 rounded-lg bg-surface-800/40">
                <span className="text-surface-300 font-medium">
                  {ms.expenseRollover.amount >= 0 ? "Rolled into" : "Deducted from"} {ms.expenseRollover.goalName}
                </span>
                <span className={`font-semibold ${ms.expenseRollover.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {ms.expenseRollover.amount >= 0 ? "+" : "−"}{formatCurrency(ms.expenseRollover.amount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <button
            onClick={handleGoToHistory}
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-mint-600 hover:bg-mint-500 text-surface-950 transition-all shadow-lg shadow-mint-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>View Month in History</span>
            <HiArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-5 rounded-xl text-xs font-semibold text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-all cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
