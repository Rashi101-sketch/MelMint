import { useState } from "react";
import { HiPencil, HiCheck, HiClock, HiExclamation, HiLightningBolt, HiX } from "react-icons/hi";
import toast from "react-hot-toast";
import { updateSetting, updateCycleLimit } from "../services/api";

export default function CycleTracker({ cycle, settings, loading, onSettingChange }) {
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitValue, setLimitValue] = useState("");

  if (loading) {
    return (
      <div className="glass-card-mint p-6 animate-fade-in-up-d2">
        <div className="space-y-4">
          <div className="h-5 w-40 bg-surface-700/50 rounded animate-pulse" />
          <div className="h-8 w-64 bg-surface-700/50 rounded animate-pulse" />
          <div className="h-3 w-full bg-surface-700/50 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="glass-card-mint p-6 text-center animate-fade-in-up-d2">
        <span className="text-3xl mb-3 block">📅</span>
        <p className="text-surface-300 font-semibold text-sm">No Active Cycle</p>
        <p className="text-surface-500 text-xs mt-1">
          A new monthly cycle will start automatically at the beginning of each month.
        </p>
      </div>
    );
  }

  const baseLimit = Number(settings?.expense_limit || cycle.expenseLimit || 300);
  const interestIncome = Number(cycle.interestIncome || 0);
  const interestBoostsLimit = cycle.interestBoostsLimit ?? (settings?.interest_boosts_limit !== "false");
  const adjustedLimit = cycle.adjustedExpenseLimit || (baseLimit + (interestBoostsLimit ? interestIncome : 0));
  const spent = cycle.regularExpenses ?? cycle.totalExpenses ?? 0;
  const remaining = adjustedLimit - spent;
  const pct = adjustedLimit > 0 ? Math.min(100, (spent / adjustedLimit) * 100) : 0;
  const overspend = cycle.overspend || 0;
  const overspendDeduction = cycle.overspendDeduction || null;

  const startDate = new Date(cycle.startDate);
  const endDate = cycle.estimatedEndDate ? new Date(cycle.estimatedEndDate) : (cycle.endDate ? new Date(cycle.endDate) : new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0));
  const today = new Date();
  const daysIn = cycle.daysIntoCycle ?? Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  const totalDays = cycle.totalDaysInCycle ?? Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const daysLeft = cycle.daysLeft ?? Math.max(0, totalDays - daysIn);

  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  const handleSaveLimit = async (applyToAll) => {
    const val = parseFloat(limitValue);
    if (isNaN(val) || val <= 0) {
      toast.error("Enter a valid limit");
      return;
    }
    try {
      await updateCycleLimit(cycle.id, val, applyToAll);
      toast.success(`Expense limit updated to $${val}`);
      setShowLimitModal(false);
      onSettingChange?.();
    } catch {
      toast.error("Failed to update limit");
    }
  };

  const handleToggleInterestBoost = async () => {
    const newValue = interestBoostsLimit ? "false" : "true";
    try {
      await updateSetting("interest_boosts_limit", newValue);
      toast.success(newValue === "true" ? "Interest now boosts your expense limit" : "Interest no longer boosts your expense limit");
      onSettingChange?.();
    } catch {
      toast.error("Failed to update setting");
    }
  };

  return (
    <div className="glass-card-mint p-6 glow-mint animate-fade-in-up-d2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HiClock className="w-5 h-5 text-mint-400" />
          <h3 className="text-sm font-bold text-surface-100">Current Cycle</h3>
          <span className="badge badge-cycle">{formatDate(cycle.startDate)} – {formatDate(endDate)}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Day {daysIn + 1}</p>
          <p className="text-xs text-mint-400 font-semibold">{daysLeft} days left</p>
        </div>
      </div>

      {/* Salary + Limit + Remaining */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Salary</p>
          <p className="text-lg font-bold text-emerald-400">${Number(cycle.salaryAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1">
            Expense Limit
            <button
              onClick={() => { setShowLimitModal(true); setLimitValue(String(baseLimit)); }}
              className="text-mint-500 hover:text-mint-400 transition-colors cursor-pointer"
              id="edit-limit-btn"
            >
              <HiPencil className="w-3 h-3" />
            </button>
          </p>
          <div>
              {interestBoostsLimit && interestIncome > 0 ? (
                <>
                  <p className="text-sm font-bold text-amber-400 line-through opacity-50">${baseLimit.toFixed(2)}</p>
                  <p className="text-lg font-bold text-emerald-400">${adjustedLimit.toFixed(2)}</p>
                </>
              ) : (
                <p className="text-lg font-bold text-amber-400">${adjustedLimit.toFixed(2)}</p>
              )}
            </div>
        </div>
        <div className="p-3 rounded-xl bg-surface-900/40">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Remaining</p>
          <p className={`text-lg font-bold ${remaining >= 0 ? "text-mint-400" : "text-red-400"}`}>
            {remaining < 0 && "-"}${Math.abs(remaining).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-surface-500">
          <span>Spent: ${spent.toFixed(2)}</span>
          <span>{pct.toFixed(0)}% of limit</span>
        </div>
        <div className="w-full h-2.5 bg-surface-900/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-400" : "bg-mint-500"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Interest Boost Toggle */}
      <div className="mt-3 flex items-center justify-between p-2.5 rounded-lg bg-surface-900/30 border border-surface-700/30">
        <div className="flex items-center gap-2">
          <HiLightningBolt className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-surface-300">Add interest to monthly expense limit</span>
        </div>
        <button
          onClick={handleToggleInterestBoost}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
            interestBoostsLimit ? "bg-mint-500" : "bg-surface-600"
          }`}
          id="toggle-interest-boost"
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
              interestBoostsLimit ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Interest Income Notice (only when toggle is on and interest > 0) */}
      {interestBoostsLimit && interestIncome > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-400 flex items-center gap-1.5">
            <HiLightningBolt className="w-3.5 h-3.5" />
            <span>
              <span className="font-semibold">+${interestIncome.toFixed(2)}</span> interest income added to your expense limit this cycle
            </span>
          </p>
        </div>
      )}

      {/* Cycle Notes */}
      {cycle.cycleNotes && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cycle.cycleNotes.split(" | ").map((note, i) => {
            let noteClass = "cycle-note-info";
            const lower = note.toLowerCase();
            if (lower.includes("saved") || lower.includes("rolled") || lower.includes("allocated")) noteClass = "cycle-note-saved";
            else if (lower.includes("overspent") || lower.includes("deducted")) noteClass = "cycle-note-overspent";
            else if (lower.includes("shortfall") || lower.includes("warning")) noteClass = "cycle-note-shortfall";
            return (
              <div key={i} className={`cycle-note ${noteClass}`}>
                {note.trim()}
              </div>
            );
          })}
        </div>
      )}

      {/* Overspend Warning */}
      {overspend > 0 && overspendDeduction && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 flex items-center gap-1.5 font-semibold mb-1.5">
            <HiExclamation className="w-3.5 h-3.5" />
            Over budget by ${overspend.toFixed(2)}
          </p>
          {overspendDeduction.deductions.map((d) => (
            <p key={d.goalId} className="text-[10px] text-red-400/80 ml-5">
              → ${d.deductAmount.toFixed(2)} would be deducted from <span className="font-semibold">{d.goalName}</span> (Priority {d.priority} — least important)
            </p>
          ))}
          {overspendDeduction.unrecoverable > 0 && (
            <p className="text-[10px] text-red-300 ml-5 mt-0.5 font-semibold">
              ⚠️ ${overspendDeduction.unrecoverable.toFixed(2)} cannot be covered by any goal
            </p>
          )}
        </div>
      )}

      {/* Rollover Notice */}
      {cycle.rolloverAmount > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400">
            ✨ <span className="font-semibold">${Number(cycle.rolloverAmount).toFixed(2)}</span>{" "}
            {cycle.cycleNotes && cycle.cycleNotes.split(" | ").find((n) => n.toLowerCase().includes("rolled"))
              ? cycle.cycleNotes.split(" | ").find((n) => n.toLowerCase().includes("rolled")).trim()
              : "rolled over from last cycle into Emergency savings"}
          </p>
        </div>
      )}

      {/* Edit Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-800 border border-surface-700 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-surface-100">Edit Monthly Expense Limit</h3>
              <button
                onClick={() => setShowLimitModal(false)}
                className="text-surface-400 hover:text-surface-200 transition-colors cursor-pointer"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <label className="text-xs text-surface-400 uppercase tracking-wider block mb-2">
                Monthly Base Limit ($)
              </label>
              <input
                type="number"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                className="input-field w-full text-lg py-2"
                autoFocus
                id="modal-limit-input"
              />
              <p className="text-[10px] text-surface-500 mt-2">
                {interestBoostsLimit
                  ? "Interest income will be added on top of this base limit."
                  : "Interest income will not affect this limit (toggle is off)."}
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleSaveLimit(false)}
                className="w-full btn-primary py-2 text-sm"
                id="btn-apply-cycle"
              >
                Apply to This Month Only
              </button>
              <button
                onClick={() => handleSaveLimit(true)}
                className="w-full btn-secondary py-2 text-sm"
                id="btn-apply-all"
              >
                Apply to All Upcoming Months
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
