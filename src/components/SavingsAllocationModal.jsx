import { useState, useEffect } from "react";
import { HiX } from "react-icons/hi";
import toast from "react-hot-toast";
import { allocateSavings } from "../services/api";

/**
 * Modal shown after a salary transaction is added.
 * Displays available savings and lets the user distribute across goals.
 */
export default function SavingsAllocationModal({ salaryData, onClose, onAllocated }) {
  const { availableSavings, suggestedAllocations, rolloverAmount, cycle } = salaryData;

  const [allocations, setAllocations] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (suggestedAllocations) {
      setAllocations(
        suggestedAllocations.map((a) => ({
          goalId: a.goalId,
          goalName: a.goalName,
          percentage: a.percentage,
          amount: a.suggestedAmount,
          currentSaved: a.currentSaved,
          targetAmount: a.targetAmount,
        }))
      );
    }
  }, [suggestedAllocations]);

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const unallocated = availableSavings - totalAllocated;

  const handleAmountChange = (goalId, value) => {
    setAllocations((prev) =>
      prev.map((a) => (a.goalId === goalId ? { ...a, amount: value } : a))
    );
  };

  const handlePercentageClick = (goalId, pct) => {
    const amount = parseFloat(((pct / 100) * availableSavings).toFixed(2));
    setAllocations((prev) =>
      prev.map((a) => (a.goalId === goalId ? { ...a, amount, percentage: pct } : a))
    );
  };

  const handleSubmit = async () => {
    if (totalAllocated > availableSavings + 0.01) {
      toast.error("Total exceeds available savings");
      return;
    }

    setSubmitting(true);
    try {
      await allocateSavings({
        totalAmount: availableSavings,
        allocations: allocations
          .filter((a) => parseFloat(a.amount) > 0)
          .map((a) => ({ goalId: a.goalId, amount: parseFloat(a.amount) })),
      });
      toast.success("Savings allocated successfully! 🎉");
      onAllocated?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to allocate");
    } finally {
      setSubmitting(false);
    }
  };

  const goalStyles = {
    "University Fees": { icon: "🎓", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    "Flight Home": { icon: "✈️", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    "Emergency": { icon: "🛡️", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
              💰 Allocate Savings
            </h2>
            <p className="text-xs text-surface-500 mt-1">
              New cycle started — distribute your available savings
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-700/50 transition-all cursor-pointer"
            id="close-modal"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3 rounded-xl bg-surface-900/50">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Salary</p>
            <p className="text-lg font-bold text-emerald-400">
              ${Number(cycle?.salaryAmount || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-surface-900/50">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Available to Save</p>
            <p className="text-lg font-bold text-mint-400">
              ${availableSavings.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Rollover Notice */}
        {rolloverAmount > 0 && (
          <div className="mb-4 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400">
              ✨ ${rolloverAmount.toFixed(2)} rolled over from the previous cycle into Emergency savings
            </p>
          </div>
        )}

        {/* Allocation Cards */}
        <div className="space-y-3 mb-5">
          {allocations.map((alloc) => {
            const style = goalStyles[alloc.goalName] || {
              icon: "📦", color: "text-surface-300", bg: "bg-surface-500/10", border: "border-surface-500/20",
            };
            const pct = alloc.targetAmount > 0
              ? Math.min(100, ((alloc.currentSaved + (parseFloat(alloc.amount) || 0)) / alloc.targetAmount) * 100)
              : 0;

            return (
              <div key={alloc.goalId} className={`p-4 rounded-xl ${style.bg} border ${style.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{style.icon}</span>
                    <div>
                      <h4 className={`text-sm font-bold ${style.color}`}>{alloc.goalName}</h4>
                      <p className="text-[10px] text-surface-500">
                        ${alloc.currentSaved.toFixed(2)} / ${alloc.targetAmount.toFixed(2)} saved
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-surface-500 font-semibold">{alloc.percentage}%</span>
                </div>

                {/* Quick % buttons */}
                <div className="flex gap-1.5 mb-2">
                  {[20, 30, 50].map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePercentageClick(alloc.goalId, p)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        alloc.percentage === p
                          ? "bg-mint-600/30 text-mint-300 border border-mint-500/30"
                          : "bg-surface-800/50 text-surface-500 hover:text-surface-300 border border-surface-700/50"
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>

                {/* Amount input */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-surface-500">$</span>
                  <input
                    type="number"
                    value={alloc.amount}
                    onChange={(e) => handleAmountChange(alloc.goalId, e.target.value)}
                    className="inline-input flex-1"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Mini progress */}
                <div className="mt-2 w-full h-1.5 bg-surface-900/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-mint-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-900/50 mb-4">
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Total Allocated</p>
            <p className={`text-sm font-bold ${totalAllocated > availableSavings ? "text-red-400" : "text-mint-400"}`}>
              ${totalAllocated.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Unallocated</p>
            <p className={`text-sm font-bold ${unallocated < 0 ? "text-red-400" : "text-amber-400"}`}>
              ${Math.abs(unallocated).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" id="skip-allocation">
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || totalAllocated > availableSavings + 0.01}
            className="btn-primary flex-1"
            id="confirm-allocation"
          >
            {submitting ? "Allocating..." : "Confirm Allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}
