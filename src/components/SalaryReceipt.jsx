import { useState, useEffect, useCallback } from "react";
import { HiReceiptTax, HiChevronDown } from "react-icons/hi";
import { getCycles, getTransactions, getSavingsGoals } from "../services/api";

export default function SalaryReceipt() {
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [rentAmount, setRentAmount] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);

  // Fetch all cycles on mount
  useEffect(() => {
    (async () => {
      try {
        const [cyclesRes, goalsRes] = await Promise.all([
          getCycles(),
          getSavingsGoals(),
        ]);
        const allCycles = cyclesRes.data || [];
        setCycles(allCycles);
        setGoals(goalsRes.data || []);
        if (allCycles.length > 0) {
          setSelectedCycleId(allCycles[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch cycles:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch cycle-specific data when selection changes
  const fetchCycleData = useCallback(async (cycleId) => {
    if (!cycleId) return;
    setCycleLoading(true);
    try {
      const [incomeRes, rentRes] = await Promise.all([
        getTransactions({ cycleId, transactionType: "INCOME" }),
        getTransactions({ cycleId, category: "Rent", transactionType: "EXPENSE" }),
      ]);

      const incomes = incomeRes.data || [];
      const rents = rentRes.data || [];

      setIncomeTotal(incomes.reduce((sum, tx) => sum + Number(tx.amount), 0));
      setRentAmount(rents.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0));
    } catch (err) {
      console.error("Failed to fetch cycle data:", err);
    } finally {
      setCycleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCycleId) fetchCycleData(selectedCycleId);
  }, [selectedCycleId, fetchCycleData]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);

  const formatDate = (d) => {
    if (!d) return "Ongoing";
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return "Ongoing";
    return parsed.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  // For active cycles with null endDate, calculate estimated end
  const getCycleEndLabel = (cycle) => {
    if (cycle.endDate) return formatDate(cycle.endDate);
    return "Ongoing";
  };

  const formatCurrency = (n) =>
    `$${Math.abs(Number(n)).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;

  // Skeleton
  if (loading) {
    return (
      <div className="receipt-card p-6 animate-fade-in-up-d1">
        <div className="space-y-4">
          <div className="h-5 w-40 bg-surface-700/50 rounded animate-pulse" />
          <div className="h-4 w-full bg-surface-700/50 rounded animate-pulse" />
          <div className="receipt-divider" />
          <div className="h-4 w-3/4 bg-surface-700/50 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-surface-700/50 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-surface-700/50 rounded animate-pulse" />
          <div className="receipt-total-divider" />
          <div className="h-5 w-1/2 bg-surface-700/50 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (cycles.length === 0) {
    return (
      <div className="receipt-card p-6 text-center animate-fade-in-up-d1">
        <span className="text-3xl mb-3 block">🧾</span>
        <p className="text-surface-300 font-semibold text-sm">No Cycles Yet</p>
        <p className="text-surface-500 text-xs mt-1">
          Salary receipts will appear once you have a completed cycle.
        </p>
      </div>
    );
  }

  const salary = Number(selectedCycle?.salaryAmount || 0);
  // Use base expenseLimit (not adjustedExpenseLimit) to match backend allocation formula
  const expenseLimit = Number(selectedCycle?.expenseLimit || 0);
  const availableForGoals = salary - expenseLimit - rentAmount;
  const totalPct = goals.reduce((sum, g) => sum + g.percentage, 0);
  const cycleNotes = selectedCycle?.cycleNotes || "";

  // Parse rent shortfall from notes
  const hasRentShortfall = cycleNotes.toLowerCase().includes("shortfall");

  return (
    <div className="receipt-card p-6 animate-fade-in-up-d1">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiReceiptTax className="w-5 h-5 text-mint-400" />
          <h3 className="text-sm font-bold text-surface-100">Salary Receipt</h3>
        </div>
        <div className="relative">
          <select
            value={selectedCycleId || ""}
            onChange={(e) => setSelectedCycleId(Number(e.target.value))}
            className="cycle-select pr-6 appearance-none"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.startDate)} – {getCycleEndLabel(c)}
              </option>
            ))}
          </select>
          <HiChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" />
        </div>
      </div>

      {cycleLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 bg-surface-700/50 rounded animate-pulse" style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
      ) : (
        <>
          {/* Cycle status badge */}
          <div className="mb-4">
            <span className={`badge ${selectedCycle?.status === "ACTIVE" ? "badge-cycle" : "badge-income"}`}>
              {selectedCycle?.status || "COMPLETED"}
            </span>
          </div>

          {/* Receipt Lines */}
          <div className="space-y-2.5 text-sm">
            {/* Salary */}
            <div className="flex justify-between items-center">
              <span className="text-surface-400">Total Salary</span>
              <span className="font-bold text-emerald-400">{formatCurrency(salary)}</span>
            </div>

            <div className="receipt-divider" />

            {/* Deductions */}
            <div className="flex justify-between items-center">
              <span className="text-surface-500 text-xs">− Expense Limit</span>
              <span className="text-amber-400 font-medium">−{formatCurrency(expenseLimit)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-surface-500 text-xs">− Rent</span>
              <span className="text-amber-400 font-medium">−{formatCurrency(rentAmount)}</span>
            </div>

            {hasRentShortfall && (
              <div className="cycle-note cycle-note-shortfall flex items-center gap-1.5 mt-1">
                <span className="text-xs">⚠️</span>
                <span>Rent shortfall detected — check notes below</span>
              </div>
            )}

            <div className="receipt-total-divider" />

            {/* Available for Goals */}
            <div className="flex justify-between items-center">
              <span className="text-surface-200 font-semibold text-xs">= Available for Goals</span>
              <span className={`text-lg font-bold ${availableForGoals >= 0 ? "text-mint-400" : "text-red-400"}`}>
                {availableForGoals < 0 && "−"}{formatCurrency(availableForGoals)}
              </span>
            </div>

            {/* Goal Distribution */}
            {goals.length > 0 && availableForGoals > 0 && (
              <>
                <div className="receipt-divider" />
                <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">
                  Savings Distribution
                </p>
                <div className="space-y-1.5">
                  {goals
                    .filter((g) => g.percentage > 0)
                    .map((goal) => {
                      const goalAmount = (goal.percentage / 100) * availableForGoals;
                      return (
                        <div key={goal.id} className="flex justify-between items-center">
                          <span className="text-surface-400 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-mint-500 inline-block" />
                            {goal.name}
                            <span className="text-surface-600">({goal.percentage}%)</span>
                          </span>
                          <span className="text-mint-300 text-xs font-medium">{formatCurrency(goalAmount)}</span>
                        </div>
                      );
                    })}
                  {totalPct < 100 && (
                    <div className="flex justify-between items-center">
                      <span className="text-surface-400 text-xs flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-600 inline-block" />
                        Unallocated
                        <span className="text-surface-600">({100 - totalPct}%)</span>
                      </span>
                      <span className="text-surface-500 text-xs font-medium">
                        {formatCurrency(((100 - totalPct) / 100) * availableForGoals)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Cycle Notes */}
          {cycleNotes && (
            <>
              <div className="receipt-divider mt-3" />
              <div className="space-y-1.5 mt-2">
                <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">Notes</p>
                {cycleNotes.split(" | ").map((note, i) => {
                  let noteClass = "cycle-note-info";
                  if (note.toLowerCase().includes("saved") || note.toLowerCase().includes("rolled")) noteClass = "cycle-note-saved";
                  else if (note.toLowerCase().includes("overspent") || note.toLowerCase().includes("deducted")) noteClass = "cycle-note-overspent";
                  else if (note.toLowerCase().includes("shortfall") || note.toLowerCase().includes("warning")) noteClass = "cycle-note-shortfall";
                  return (
                    <div key={i} className={`cycle-note ${noteClass}`}>
                      {note.trim()}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-surface-700/30 text-center">
            <p className="text-[10px] text-surface-600">
              {selectedCycle?.transactionCount || 0} transactions this cycle
            </p>
          </div>
        </>
      )}
    </div>
  );
}
