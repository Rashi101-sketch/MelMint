import { HiPlus, HiTrash, HiPencil, HiCheck, HiX, HiChevronDown, HiChevronUp } from "react-icons/hi";
import { useState } from "react";
import toast from "react-hot-toast";
import { addToSavingsGoal, createSavingsGoal, deleteSavingsGoal, updateSavingsGoal, getSavingsContributions, updateSetting } from "../services/api";

const GOAL_ICONS = {
  "University Fees": "🎓",
  "Flight Home": "✈️",
  "Emergency": "🛡️",
  "Vacation": "🏖️",
  "Car": "🚗",
  "House": "🏠",
  "Tech": "💻",
  "Health": "🏥",
  "Wedding": "💍",
  "Education": "📚",
};

const GOAL_COLORS = [
  { color: "text-blue-400", gradient: "from-blue-500/15 to-blue-600/10", border: "border-blue-500/25" },
  { color: "text-purple-400", gradient: "from-purple-500/15 to-purple-600/10", border: "border-purple-500/25" },
  { color: "text-amber-400", gradient: "from-amber-500/15 to-amber-600/10", border: "border-amber-500/25" },
  { color: "text-rose-400", gradient: "from-rose-500/15 to-rose-600/10", border: "border-rose-500/25" },
  { color: "text-emerald-400", gradient: "from-emerald-500/15 to-emerald-600/10", border: "border-emerald-500/25" },
  { color: "text-cyan-400", gradient: "from-cyan-500/15 to-cyan-600/10", border: "border-cyan-500/25" },
  { color: "text-indigo-400", gradient: "from-indigo-500/15 to-indigo-600/10", border: "border-indigo-500/25" },
];

function getGoalStyle(name, idx) {
  const icon = GOAL_ICONS[name] || "📦";
  const colorSet = GOAL_COLORS[idx % GOAL_COLORS.length];
  return { icon, ...colorSet };
}

export default function SavingsGoals({ goals, loading, onRefresh, settings }) {
  const [addAmounts, setAddAmounts] = useState({});
  const [addingId, setAddingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formPercentage, setFormPercentage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editTarget, setEditTarget] = useState("");
  const [editPercentage, setEditPercentage] = useState("");
  const [editSaved, setEditSaved] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [saving, setSaving] = useState(false);

  // Contribution history state
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [contributions, setContributions] = useState({});
  const [contributionsLoading, setContributionsLoading] = useState(false);

  const toggleHistory = async (goalId) => {
    if (expandedGoalId === goalId) {
      setExpandedGoalId(null);
      return;
    }
    setExpandedGoalId(goalId);
    if (!contributions[goalId]) {
      setContributionsLoading(true);
      try {
        const res = await getSavingsContributions(goalId);
        setContributions((prev) => ({ ...prev, [goalId]: res.data || [] }));
      } catch {
        toast.error("Failed to load history");
      } finally {
        setContributionsLoading(false);
      }
    }
  };

  const handleAddMoney = async (id) => {
    const amount = parseFloat(addAmounts[id]);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setAddingId(id);
    try {
      await addToSavingsGoal(id, amount);
      toast.success(`$${amount.toFixed(2)} allocated!`);
      setAddAmounts((p) => ({ ...p, [id]: "" }));
      onRefresh?.();
    } catch { toast.error("Failed to add"); }
    finally { setAddingId(null); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formName || !formTarget) return;
    setSubmitting(true);
    try {
      await createSavingsGoal({
        name: formName,
        targetAmount: parseFloat(formTarget),
        percentage: parseInt(formPercentage || "0", 10),
      });
      toast.success("Goal created!");
      setFormName(""); setFormTarget(""); setFormPercentage(""); setShowForm(false);
      onRefresh?.();
    } catch (err) { toast.error(err.response?.data?.message || "Failed to create"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}" goal? This cannot be undone.`)) return;
    try {
      await deleteSavingsGoal(id);
      toast.success(`"${name}" deleted`);
      onRefresh?.();
    } catch { toast.error("Failed to delete"); }
  };

  const startEdit = (goal) => {
    setEditingId(goal.id);
    setEditTarget(String(goal.targetAmount));
    setEditPercentage(String(goal.percentage));
    setEditSaved(String(goal.savedAmount));
    setEditPriority(String(goal.priority || 1));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTarget("");
    setEditPercentage("");
    setEditSaved("");
    setEditPriority("");
  };

  const handleSaveEdit = async (id) => {
    const target = parseFloat(editTarget);
    const pct = parseInt(editPercentage, 10);
    const saved = parseFloat(editSaved);

    if (isNaN(target) || target < 0) { toast.error("Invalid target amount"); return; }
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error("Percentage must be 0–100"); return; }
    if (isNaN(saved) || saved < 0) { toast.error("Invalid saved amount"); return; }

    // Check total percentage across all goals won't exceed 100
    const otherGoalsPct = goals
      .filter((g) => g.id !== id)
      .reduce((sum, g) => sum + g.percentage, 0);
    if (otherGoalsPct + pct > 100) {
      toast.error(`Total allocation would be ${otherGoalsPct + pct}% — max is 100%`);
      return;
    }

    setSaving(true);
    try {
      await updateSavingsGoal(id, {
        targetAmount: target,
        percentage: pct,
        savedAmount: saved,
        priority: parseInt(editPriority, 10) || 1,
      });
      toast.success("Goal updated!");
      cancelEdit();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  // Total percentage allocation
  const totalPct = goals.reduce((sum, g) => sum + g.percentage, 0);

  if (loading) {
    return (
      <div className="glass-card p-6 animate-fade-in-up-d3">
        <div className="h-5 w-32 bg-surface-700/50 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 bg-surface-700/20 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 animate-fade-in-up-d3">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-surface-100 flex items-center gap-2">
          🎯 Savings Goals
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            showForm
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-mint-600/20 text-mint-400 border border-mint-500/20 hover:bg-mint-600/30"
          }`}
          id="toggle-goal-form"
        >
          {showForm ? <><HiX className="w-3 h-3" /> Cancel</> : <><HiPlus className="w-3 h-3" /> New Goal</>}
        </button>
      </div>

      {/* Rollover & Overspend Goal Settings */}
      {goals.length > 0 && (
        <div className="mb-5 p-3 rounded-xl bg-surface-900/30 border border-surface-700/30">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-2.5">Month-End Routing</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400 whitespace-nowrap">Rollover →</span>
              <select
                value={settings?.rollover_goal_id || ""}
                onChange={async (e) => {
                  try {
                    await updateSetting("rollover_goal_id", e.target.value);
                    toast.success(`Rollover goal updated`);
                    onRefresh?.();
                  } catch { toast.error("Failed to update"); }
                }}
                className="cycle-select text-xs flex-1"
                id="rollover-goal-select"
              >
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400 whitespace-nowrap">Overspend →</span>
              <select
                value={settings?.overspend_goal_id || ""}
                onChange={async (e) => {
                  try {
                    await updateSetting("overspend_goal_id", e.target.value);
                    toast.success(`Overspend goal updated`);
                    onRefresh?.();
                  } catch { toast.error("Failed to update"); }
                }}
                className="cycle-select text-xs flex-1"
                id="overspend-goal-select"
              >
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 p-4 rounded-xl bg-surface-900/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Goal name"
              className="input-field"
              required
              id="goal-name-input"
            />
            <input
              type="number"
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
              placeholder="Target ($)"
              min="1"
              step="0.01"
              className="input-field"
              required
              id="goal-target-input"
            />
            <div className="relative">
              <input
                type="number"
                value={formPercentage}
                onChange={(e) => setFormPercentage(e.target.value)}
                placeholder="Salary %"
                min="0"
                max="100"
                className="input-field pr-8"
                id="goal-pct-input"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 text-xs">%</span>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary text-sm" id="create-goal-btn">
              {submitting ? "..." : "Create"}
            </button>
          </div>
          <p className="text-[10px] text-surface-500">
            Salary % = how much of your available savings (after rent & expenses) goes to this goal each cycle.
            Currently allocated: <span className={totalPct > 100 ? "text-red-400" : "text-mint-400"}>{totalPct}%</span> / 100%
          </p>
        </form>
      )}

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🎯</p>
          <p className="text-surface-400 text-sm">No savings goals yet</p>
          <p className="text-surface-600 text-xs mt-1">Click + New Goal to create one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {goals.map((goal, idx) => {
            const style = getGoalStyle(goal.name, idx);
            const pct = goal.targetAmount > 0
              ? Math.min(100, (goal.savedAmount / goal.targetAmount) * 100) : 0;
            const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
            const isEditing = editingId === goal.id;

            return (
              <div
                key={goal.id}
                className={`relative rounded-2xl border ${style.border} bg-gradient-to-br ${style.gradient} p-5 transition-all hover:shadow-xl hover:shadow-black/20 ${isEditing ? "ring-1 ring-mint-500/30" : "hover:scale-[1.02]"}`}
              >
                {/* Action buttons */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(goal.id)}
                        disabled={saving}
                        className="p-1 rounded-md bg-mint-600/20 text-mint-400 hover:bg-mint-600/30 transition-colors cursor-pointer"
                        id={`save-goal-${goal.id}`}
                      >
                        <HiCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded-md bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors cursor-pointer"
                        id={`cancel-goal-${goal.id}`}
                      >
                        <HiX className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(goal)}
                        className="p-1 rounded-md text-surface-600 hover:text-mint-400 hover:bg-mint-500/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                        style={{ opacity: 1 }}
                        id={`edit-goal-${goal.id}`}
                      >
                        <HiPencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(goal.id, goal.name)}
                        className="p-1 rounded-md text-surface-600 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                        id={`delete-goal-${goal.id}`}
                      >
                        <HiTrash className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{style.icon}</span>
                  <div>
                    <h3 className={`text-sm font-bold ${style.color}`}>{goal.name}</h3>
                    <p className="text-[10px] text-surface-500 uppercase tracking-wider mt-0.5">
                      {pct >= 100 ? "Fully funded 🎉" : `$${remaining.toFixed(2)} remaining`}
                    </p>
                  </div>
                </div>

                {/* Amounts — editable or display */}
                {isEditing ? (
                  <div className="space-y-2.5 mb-3">
                    {/* Target Amount */}
                    <div>
                      <label className="text-[10px] text-surface-500 uppercase tracking-wider block mb-1">Target Amount ($)</label>
                      <input
                        type="number"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        min="0"
                        step="0.01"
                        className="input-field text-sm py-1.5"
                        id={`edit-target-${goal.id}`}
                      />
                    </div>

                    {/* Saved Amount */}
                    <div>
                      <label className="text-[10px] text-surface-500 uppercase tracking-wider block mb-1">Saved Amount ($)</label>
                      <input
                        type="number"
                        value={editSaved}
                        onChange={(e) => setEditSaved(e.target.value)}
                        min="0"
                        step="0.01"
                        className="input-field text-sm py-1.5"
                        id={`edit-saved-${goal.id}`}
                      />
                    </div>

                    {/* Salary Percentage */}
                    <div>
                      <label className="text-[10px] text-surface-500 uppercase tracking-wider block mb-1">
                        Salary Allocation (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(e.target.value)}
                          min="0"
                          max="100"
                          className="input-field text-sm py-1.5 pr-8"
                          id={`edit-pct-${goal.id}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 text-xs">%</span>
                      </div>
                      <p className="text-[9px] text-surface-600 mt-1">
                        Other goals use {goals.filter((g) => g.id !== goal.id).reduce((s, g) => s + g.percentage, 0)}% — {100 - goals.filter((g) => g.id !== goal.id).reduce((s, g) => s + g.percentage, 0)}% available
                      </p>
                    </div>

                    {/* Priority / Importance */}
                    <div>
                      <label className="text-[10px] text-surface-500 uppercase tracking-wider block mb-1">
                        Importance (1 = Most Important)
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="input-field text-sm py-1.5"
                        id={`edit-priority-${goal.id}`}
                      >
                        <option value="1">🔴 1 — Critical (Protected)</option>
                        <option value="2">🟠 2 — High</option>
                        <option value="3">🟡 3 — Medium</option>
                        <option value="4">🟢 4 — Low</option>
                        <option value="5">⚪ 5 — Flexible (Deducted first)</option>
                      </select>
                      <p className="text-[9px] text-surface-600 mt-1">
                        If you overspend, the least important goal gets deducted first
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-xl font-bold text-surface-100">
                        ${goal.savedAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-surface-500">
                        / ${goal.targetAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-surface-900/50 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-mint-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                      <p className={`text-[10px] font-bold ${pct >= 100 ? "text-emerald-400" : "text-surface-500"}`}>
                        {pct.toFixed(0)}% funded
                      </p>
                      <div className="flex items-center gap-1.5">
                        {goal.priority && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                            goal.priority <= 1 ? "text-red-400/80 bg-red-500/10" :
                            goal.priority <= 2 ? "text-orange-400/80 bg-orange-500/10" :
                            goal.priority <= 3 ? "text-yellow-400/80 bg-yellow-500/10" :
                            goal.priority <= 4 ? "text-green-400/80 bg-green-500/10" :
                            "text-surface-400/80 bg-surface-500/10"
                          }`}>
                            {goal.priority <= 1 ? "🔴" : goal.priority <= 2 ? "🟠" : goal.priority <= 3 ? "🟡" : goal.priority <= 4 ? "🟢" : "⚪"} P{goal.priority}
                          </span>
                        )}
                        {goal.percentage > 0 && (
                          <span className="text-[10px] font-semibold text-mint-400/70 bg-mint-500/10 px-1.5 py-0.5 rounded-md">
                            {goal.percentage}% of salary
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Add money */}
                    {pct < 100 && (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={addAmounts[goal.id] || ""}
                          onChange={(e) => setAddAmounts((p) => ({ ...p, [goal.id]: e.target.value }))}
                          placeholder="Add $"
                          min="0.01"
                          step="0.01"
                          className="input-field flex-1 text-xs py-1.5"
                        />
                        <button
                          onClick={() => handleAddMoney(goal.id)}
                          disabled={addingId === goal.id}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          {addingId === goal.id ? "..." : "+ Add"}
                        </button>
                      </div>
                    )}

                    {/* Contribution History Dropdown */}
                    <button
                      onClick={() => toggleHistory(goal.id)}
                      className="w-full flex items-center justify-between mt-3 pt-2 border-t border-surface-700/30 text-[10px] text-surface-500 hover:text-mint-400 transition-colors cursor-pointer"
                      id={`history-toggle-${goal.id}`}
                    >
                      <span className="font-semibold uppercase tracking-wider">Contribution History</span>
                      {expandedGoalId === goal.id ? (
                        <HiChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <HiChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {expandedGoalId === goal.id && (
                      <div className="mt-2 rounded-lg bg-surface-900/40 p-2.5 space-y-1.5 animate-fade-in-up max-h-48 overflow-y-auto">
                        {contributionsLoading ? (
                          <div className="space-y-1.5">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="h-3.5 bg-surface-700/40 rounded animate-pulse" style={{ width: `${90 - i * 15}%` }} />
                            ))}
                          </div>
                        ) : (contributions[goal.id] || []).length === 0 ? (
                          <p className="text-[10px] text-surface-600 text-center py-2">
                            No contributions yet — add a salary to start tracking.
                          </p>
                        ) : (
                          (contributions[goal.id] || []).map((c) => {
                            const formatDate = (d) =>
                              d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
                            const sourceLabels = {
                              salary_allocation: "💰 Salary Split",
                              rollover: "✨ Rollover Saved",
                              overspend_deduction: "⚠️ Overspend",
                              manual: "✏️ Manual",
                            };
                            const isNegative = c.amount < 0;
                            return (
                              <div key={c.id} className="flex items-center justify-between text-[10px] py-1 px-1.5 rounded hover:bg-surface-800/30">
                                <div className="flex items-center gap-2">
                                  <span className="text-surface-600">{formatDate(c.cycleStart)} – {formatDate(c.cycleEnd)}</span>
                                  <span className="text-surface-400">{sourceLabels[c.source] || c.source}</span>
                                </div>
                                <span className={`font-bold ${isNegative ? "text-red-400" : "text-mint-400"}`}>
                                  {isNegative ? "−" : "+"}${Math.abs(c.amount).toFixed(2)}
                                </span>
                              </div>
                            );
                          })
                        )}
                        {(contributions[goal.id] || []).length > 0 && (
                          <div className="pt-1.5 border-t border-surface-700/20 flex justify-between text-[10px]">
                            <span className="text-surface-500 font-semibold">Total from allocations</span>
                            <span className="text-mint-300 font-bold">
                              ${(contributions[goal.id] || []).reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Allocation Summary */}
      {goals.length > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-surface-900/30">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-surface-500">
              Salary split: {goals.filter(g => g.percentage > 0).map(g => `${g.name} (${g.percentage}%)`).join(" • ") || "None set"}
            </p>
            <p className={`text-[10px] font-bold ${totalPct > 100 ? "text-red-400" : totalPct === 100 ? "text-emerald-400" : "text-surface-500"}`}>
              {totalPct}% / 100% allocated
            </p>
          </div>
          {/* Visual allocation bar */}
          <div className="w-full h-1.5 bg-surface-900/50 rounded-full overflow-hidden mt-2 flex">
            {goals.filter(g => g.percentage > 0).map((g, idx) => {
              const colorSet = GOAL_COLORS[goals.indexOf(g) % GOAL_COLORS.length];
              const bgColor = colorSet.color.replace("text-", "bg-").replace("-400", "-500");
              return (
                <div
                  key={g.id}
                  className={`h-full ${bgColor} transition-all duration-500`}
                  style={{ width: `${g.percentage}%` }}
                  title={`${g.name}: ${g.percentage}%`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
