import { useState, useEffect } from "react";
import { HiChartBar, HiChevronDown } from "react-icons/hi";
import { getCycles } from "../services/api";

export default function CycleDashboard() {
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCycles();
        const allCycles = res.data || [];
        setCycles(allCycles);
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

  const handleCycleChange = (e) => {
    setSelectedCycleId(Number(e.target.value));
    setAnimKey((k) => k + 1);
  };

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);

  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const formatCurrency = (n) =>
    `$${Math.abs(Number(n)).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;

  // Skeleton loading
  if (loading) {
    return (
      <div className="glass-card p-6 animate-fade-in-up-d3">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-44 bg-surface-700/50 rounded animate-pulse" />
            <div className="h-8 w-48 bg-surface-700/50 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-surface-700/20 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-3 w-full bg-surface-700/50 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (cycles.length === 0) {
    return (
      <div className="glass-card p-6 text-center animate-fade-in-up-d3">
        <span className="text-3xl mb-3 block">📊</span>
        <p className="text-surface-300 font-semibold text-sm">No Cycle History</p>
        <p className="text-surface-500 text-xs mt-1">
          Historical cycle data will appear here after your first cycle.
        </p>
      </div>
    );
  }

  const baseLimit = Number(selectedCycle?.expenseLimit || 0);
  const extraIncome = Number(selectedCycle?.extraIncome || 0);
  const adjustedLimit = Number(selectedCycle?.adjustedExpenseLimit || baseLimit + extraIncome);
  const regularExpenses = Number(selectedCycle?.regularExpenses ?? selectedCycle?.totalExpenses ?? 0);
  const diff = adjustedLimit - regularExpenses;
  const isSaved = diff >= 0;
  const pct = adjustedLimit > 0 ? Math.min(100, (regularExpenses / adjustedLimit) * 100) : 0;
  const cycleNotes = selectedCycle?.cycleNotes || "";

  const progressColor =
    pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-400" : "bg-mint-500";
  const progressLabel =
    pct >= 90 ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-mint-400";

  return (
    <div className="glass-card p-6 animate-fade-in-up-d3">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <HiChartBar className="w-5 h-5 text-mint-400" />
          <h3 className="text-sm font-bold text-surface-100">Cycle History</h3>
        </div>
        <div className="relative">
          <select
            value={selectedCycleId || ""}
            onChange={handleCycleChange}
            className="cycle-select pr-6 appearance-none"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.startDate)} – {formatDate(c.endDate)}
              </option>
            ))}
          </select>
          <HiChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" />
        </div>
      </div>

      {/* Stats Grid */}
      <div key={animKey} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 animate-fade-in">
        {/* Expense Limit */}
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Expense Limit</p>
          <p className="text-lg font-bold text-amber-400">{formatCurrency(adjustedLimit)}</p>
          {extraIncome > 0 && (
            <p className="text-[9px] text-blue-400 mt-0.5">
              incl. +{formatCurrency(extraIncome)} extra
            </p>
          )}
        </div>

        {/* Amount Used */}
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Amount Used</p>
          <p className="text-lg font-bold text-surface-200">{formatCurrency(regularExpenses)}</p>
          <p className="text-[9px] text-surface-600 mt-0.5">regular expenses</p>
        </div>

        {/* Saved / Overspent */}
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">
            {isSaved ? "Amount Saved" : "Overspent"}
          </p>
          <p className={`text-lg font-bold ${isSaved ? "text-emerald-400" : "text-red-400"}`}>
            {!isSaved && "−"}{formatCurrency(diff)}
          </p>
        </div>

        {/* Salary */}
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Salary</p>
          <p className="text-lg font-bold text-emerald-400">
            {formatCurrency(selectedCycle?.salaryAmount || 0)}
          </p>
          <p className="text-[9px] text-surface-600 mt-0.5">
            {selectedCycle?.transactionCount || 0} transactions
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center justify-between text-[10px] text-surface-500">
          <span>Budget Utilisation</span>
          <span className={progressLabel}>{pct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-3 bg-surface-900/50 rounded-full overflow-hidden">
          <div
            key={`bar-${animKey}`}
            className={`h-full rounded-full transition-all duration-700 ${progressColor}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-surface-600">
          <span>$0</span>
          <span>{formatCurrency(adjustedLimit)}</span>
        </div>
      </div>

      {/* Cycle Notes */}
      {cycleNotes && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-1">
            Cycle Notes
          </p>
          {cycleNotes.split(" | ").map((note, i) => {
            let noteClass = "cycle-note-info";
            const lower = note.toLowerCase();
            if (lower.includes("saved") || lower.includes("rolled") || lower.includes("allocated")) {
              noteClass = "cycle-note-saved";
            } else if (lower.includes("overspent") || lower.includes("deducted")) {
              noteClass = "cycle-note-overspent";
            } else if (lower.includes("shortfall") || lower.includes("warning")) {
              noteClass = "cycle-note-shortfall";
            }
            return (
              <div key={i} className={`cycle-note ${noteClass} animate-fade-in-up`} style={{ animationDelay: `${i * 0.05}s` }}>
                {note.trim()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
