import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiClock, HiChevronDown, HiChevronUp, HiCalendar,
  HiCurrencyDollar, HiSparkles, HiShoppingBag, HiFilter
} from "react-icons/hi";
import { getCycles, getTransactions } from "../services/api";
import MonthEndSummaryModal from "../components/MonthEndSummaryModal";

const CATEGORY_COLORS = {
  Groceries: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Food: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Transport: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Utilities: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Shopping: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Entertainment: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Health: "bg-red-500/10 text-red-400 border-red-500/20",
  Education: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Salary: "bg-mint-500/10 text-mint-400 border-mint-500/20",
  Interest: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Rent: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export default function HistoryPage() {
  const [searchParams] = useSearchParams();
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCycleId, setExpandedCycleId] = useState(null);
  const [cycleTransactions, setCycleTransactions] = useState({});
  const [txLoading, setTxLoading] = useState({});
  const [txFilter, setTxFilter] = useState("ALL"); // ALL, EXPENSES, RENT, INCOME
  const [modalCycle, setModalCycle] = useState(null);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCycles();
      const all = res.data || [];
      // Only closed monthly cycles, ordered most recent first
      const closed = all
        .filter((c) => c.status === "CLOSED")
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      setCycles(closed);

      // If cycleId in query params, open it
      const targetId = parseInt(searchParams.get("cycleId"), 10);
      if (targetId && closed.some((c) => c.id === targetId)) {
        setExpandedCycleId(targetId);
      } else if (closed.length > 0) {
        setExpandedCycleId(closed[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch past cycles:", err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  // Load transactions for an expanded cycle
  const loadCycleTransactions = useCallback(async (cycleId) => {
    if (cycleTransactions[cycleId]) return;
    setTxLoading((prev) => ({ ...prev, [cycleId]: true }));
    try {
      const res = await getTransactions({ cycleId, limit: 100, sortBy: "date", sortOrder: "desc" });
      setCycleTransactions((prev) => ({ ...prev, [cycleId]: res.data || [] }));
    } catch (err) {
      console.error(`Failed to fetch transactions for cycle ${cycleId}:`, err);
    } finally {
      setTxLoading((prev) => ({ ...prev, [cycleId]: false }));
    }
  }, [cycleTransactions]);

  useEffect(() => {
    if (expandedCycleId) {
      loadCycleTransactions(expandedCycleId);
    }
  }, [expandedCycleId, loadCycleTransactions]);

  const toggleCycle = (cycleId) => {
    setExpandedCycleId((prev) => (prev === cycleId ? null : cycleId));
  };

  const formatDate = (d) => {
    if (!d) return "";
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  };

  const formatShortDate = (d) => {
    if (!d) return "";
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const formatFullDate = (d) => {
    if (!d) return "";
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatCurrency = (n) =>
    `$${Math.abs(Number(n || 0)).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-60 bg-surface-700/50 rounded-xl animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in-up">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-surface-50 flex items-center gap-2.5">
            <HiClock className="w-6 h-6 text-mint-400" />
            Past Months History
          </h2>
          <p className="text-xs sm:text-sm text-surface-400 mt-1">
            Browse completed calendar-month cycles, inspect final savings allocations, and drill into logged expenses.
          </p>
        </div>
        <div className="text-xs text-surface-500 font-medium">
          {cycles.length} completed {cycles.length === 1 ? "month" : "months"}
        </div>
      </div>

      {cycles.length === 0 ? (
        <div className="glass-card p-10 text-center animate-fade-in">
          <span className="text-4xl mb-3 block">🗓️</span>
          <p className="text-surface-300 font-semibold text-base">No Completed Months Yet</p>
          <p className="text-surface-500 text-xs mt-1 max-w-sm mx-auto">
            Once your current active monthly cycle completes at month-end, its finalized summary and transactions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cycles.map((cycle, idx) => {
            const isExpanded = expandedCycleId === cycle.id;
            const ms = cycle.monthlySummary;
            const totalSalary = Number(ms?.totalSalary || cycle.salaryAmount || 0);
            const interest = Number(cycle.interestIncome || 0);
            const totalIncome = totalSalary + interest;
            const totalExpenses = Number(ms?.totalExpenses || cycle.totalExpenses || 0);
            const totalSavings = Number(ms?.totalSavings || 0);

            // Transactions for this cycle
            const txList = cycleTransactions[cycle.id] || [];
            const isTxLoading = txLoading[cycle.id];

            // Filtered transactions
            const filteredTx = txList.filter((tx) => {
              const catLower = (tx.category || "").toLowerCase();
              if (txFilter === "EXPENSES") {
                return tx.transactionType === "EXPENSE" && catLower !== "rent";
              }
              if (txFilter === "RENT") {
                return tx.transactionType === "EXPENSE" && catLower === "rent";
              }
              if (txFilter === "INCOME") {
                return tx.transactionType === "INCOME";
              }
              return true;
            });

            // Group expenses by category for quick chips
            const expenseTxs = txList.filter((t) => t.transactionType === "EXPENSE");
            const byCategory = {};
            for (const t of expenseTxs) {
              byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
            }

            return (
              <div
                key={cycle.id}
                className="glass-card overflow-hidden transition-all duration-300 border border-surface-700/40 hover:border-surface-600/60 animate-fade-in"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                {/* Month Card Header / Summary Row */}
                <div
                  onClick={() => toggleCycle(cycle.id)}
                  className="p-5 sm:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none hover:bg-surface-800/20 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mint-500/15 to-blue-500/15 border border-mint-500/25 flex items-center justify-center text-mint-400 shadow-sm shrink-0">
                      <HiCalendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-surface-100">
                          {formatDate(cycle.startDate)}
                        </h3>
                        <span className="badge badge-income text-[9px] py-0.5 px-2 font-semibold">
                          Closed
                        </span>
                      </div>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {formatShortDate(cycle.startDate)} – {formatFullDate(cycle.endDate)}
                      </p>
                    </div>
                  </div>

                  {/* Summary Metric Pills & Chevron */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-surface-800/50">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">Income</p>
                      <p className="text-xs sm:text-sm font-bold text-surface-200">{formatCurrency(totalIncome)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">Expenses</p>
                      <p className="text-xs sm:text-sm font-bold text-amber-400">{formatCurrency(totalExpenses)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-mint-400 uppercase tracking-wider font-semibold">Saved</p>
                      <p className="text-xs sm:text-sm font-bold text-mint-300">{formatCurrency(totalSavings)}</p>
                    </div>

                    <div className="p-1.5 rounded-lg text-surface-400 bg-surface-800/40">
                      {isExpanded ? <HiChevronUp className="w-4 h-4" /> : <HiChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Month Breakdown Section */}
                {isExpanded && (
                  <div className="border-t border-surface-800/70 p-5 sm:p-6 bg-surface-950/40 space-y-6 animate-fade-in">
                    {/* Top Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-surface-300 uppercase tracking-wider">
                          Month Breakdown
                        </span>
                        {ms?.totalSavings > 0 && (
                          <span className="badge badge-cycle text-[9px] py-0.5 px-2">
                            Saved {formatCurrency(ms.totalSavings)}
                          </span>
                        )}
                      </div>

                      {ms && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalCycle(cycle);
                          }}
                          className="flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg bg-mint-500/10 hover:bg-mint-500/20 text-mint-400 border border-mint-500/20 transition-all cursor-pointer"
                        >
                          <HiSparkles className="w-3.5 h-3.5" />
                          <span>View Summary Modal</span>
                        </button>
                      )}
                    </div>

                    {/* Both Pools Cards */}
                    {ms ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Pool 1: Salary Allocation */}
                        <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/80 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-mint-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-mint-400 inline-block" />
                              Pool 1: Salary Allocation
                            </span>
                            <span className="text-xs font-bold text-mint-400">
                              {formatCurrency(ms.salaryAllocation?.availableForGoals)}
                            </span>
                          </div>
                          <div className="text-[11px] text-surface-400 grid grid-cols-3 gap-1">
                            <div>Salary: <span className="text-surface-200 font-semibold">{formatCurrency(ms.totalSalary)}</span></div>
                            <div>Rent: <span className="text-surface-200 font-semibold">{formatCurrency(ms.totalRent)}</span></div>
                            <div>Budget: <span className="text-surface-200 font-semibold">{formatCurrency(cycle.expenseLimit)}</span></div>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            {ms.salaryAllocation?.breakdown?.map((item) => (
                              <div key={item.goalId} className="flex justify-between items-center text-xs py-1.5 px-2.5 rounded-lg bg-surface-800/40">
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

                        {/* Pool 2: Expense Rollover */}
                        <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/80 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                              Pool 2: Expense Rollover
                            </span>
                            <span className={`text-xs font-bold ${ms.expenseRollover?.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {ms.expenseRollover?.amount < 0 && "−"}
                              {formatCurrency(ms.expenseRollover?.amount)}
                            </span>
                          </div>
                          <div className="text-[11px] text-surface-400 grid grid-cols-2 gap-2">
                            <div>Adjusted Limit: <span className="text-surface-200 font-semibold">{formatCurrency(ms.expenseRollover?.adjustedLimit)}</span></div>
                            <div>Regular Spent: <span className="text-surface-200 font-semibold">{formatCurrency(ms.expenseRollover?.spent)}</span></div>
                          </div>

                          <div className="flex justify-between items-center text-xs py-2 px-2.5 rounded-lg bg-surface-800/40 mt-2">
                            <span className="text-surface-300 font-medium">
                              {ms.expenseRollover?.amount >= 0 ? "Rolled into" : "Deducted from"}{" "}
                              <span className="text-surface-100 font-semibold">{ms.expenseRollover?.goalName}</span>
                            </span>
                            <span className={`font-bold ${ms.expenseRollover?.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {ms.expenseRollover?.amount >= 0 ? "+" : "−"}{formatCurrency(ms.expenseRollover?.amount)}
                            </span>
                          </div>

                          {cycle.cycleNotes && (
                            <p className="text-[10px] text-surface-500 italic pt-1">
                              Note: {cycle.cycleNotes}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-surface-900/30 text-surface-400 text-xs">
                        No monthly summary recorded for this cycle.
                      </div>
                    )}

                    {/* Category Spending Chips */}
                    {Object.keys(byCategory).length > 0 && (
                      <div>
                        <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-2">
                          Spending by Category
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(byCategory).map(([cat, amt]) => {
                            const badgeColor = CATEGORY_COLORS[cat] || "bg-surface-800/60 text-surface-300 border-surface-700/50";
                            return (
                              <span key={cat} className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${badgeColor}`}>
                                <span>{cat}</span>
                                <span className="font-bold">{formatCurrency(amt)}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Drill Into Expenses Table */}
                    <div className="pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <HiShoppingBag className="w-4 h-4 text-surface-400" />
                          <h4 className="text-xs font-bold text-surface-200 uppercase tracking-wider">
                            Logged Transactions ({filteredTx.length})
                          </h4>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-900/70 border border-surface-800/80 text-xs">
                          <button
                            onClick={() => setTxFilter("ALL")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              txFilter === "ALL" ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:text-surface-200"
                            }`}
                          >
                            All ({txList.length})
                          </button>
                          <button
                            onClick={() => setTxFilter("EXPENSES")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              txFilter === "EXPENSES" ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:text-surface-200"
                            }`}
                          >
                            Expenses
                          </button>
                          <button
                            onClick={() => setTxFilter("RENT")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              txFilter === "RENT" ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:text-surface-200"
                            }`}
                          >
                            Rent
                          </button>
                          <button
                            onClick={() => setTxFilter("INCOME")}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              txFilter === "INCOME" ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:text-surface-200"
                            }`}
                          >
                            Income
                          </button>
                        </div>
                      </div>

                      {/* Transaction List */}
                      {isTxLoading ? (
                        <div className="space-y-2 py-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-10 bg-surface-800/30 rounded-lg animate-pulse" />
                          ))}
                        </div>
                      ) : filteredTx.length === 0 ? (
                        <p className="text-xs text-surface-500 py-4 text-center">
                          No transactions found for this filter.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-surface-800/80">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-surface-900/80 text-surface-500 uppercase tracking-wider font-semibold border-b border-surface-800/80">
                              <tr>
                                <th className="py-2.5 px-3">Date</th>
                                <th className="py-2.5 px-3">Category</th>
                                <th className="py-2.5 px-3">Description</th>
                                <th className="py-2.5 px-3">Method</th>
                                <th className="py-2.5 px-3 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-800/50">
                              {filteredTx.map((tx) => {
                                const isIncome = tx.transactionType === "INCOME";
                                const badgeColor = CATEGORY_COLORS[tx.category] || "bg-surface-800 text-surface-400 border-surface-700";

                                return (
                                  <tr key={tx.id} className="hover:bg-surface-800/30 transition-colors">
                                    <td className="py-2.5 px-3 text-surface-400 whitespace-nowrap">
                                      {formatShortDate(tx.date)}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}>
                                        {tx.category}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-surface-200 font-medium max-w-xs truncate">
                                      {tx.description || "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-surface-500 whitespace-nowrap">
                                      {tx.paymentMethod || "—"}
                                    </td>
                                    <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${isIncome ? "text-mint-400" : "text-surface-200"}`}>
                                      {isIncome ? "+" : "−"}{formatCurrency(tx.amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal View for Month-End Summary */}
      {modalCycle && (
        <MonthEndSummaryModal
          cycle={modalCycle}
          onClose={() => setModalCycle(null)}
        />
      )}
    </div>
  );
}
