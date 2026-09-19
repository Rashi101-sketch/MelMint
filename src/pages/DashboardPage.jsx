import { useState, useEffect, useCallback } from "react";
import { HiX, HiSparkles } from "react-icons/hi";
import SummaryCards from "../components/SummaryCards";
import CycleTracker from "../components/CycleTracker";
import SavingsGoals from "../components/SavingsGoals";
import TransactionTable from "../components/TransactionTable";
import SalaryReceipt from "../components/SalaryReceipt";
import CycleDashboard from "../components/CycleDashboard";
import {
  getCurrentCycle, getSavingsGoals, getCycles,
  getSummary, getSettings, getTransactions,
} from "../services/api";

export default function DashboardPage() {
  const [cycle, setCycle] = useState(null);
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [recentTx, setRecentTx] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Rollover notification banner
  const [rolloverBanner, setRolloverBanner] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cycleRes, goalsRes, summaryRes, settingsRes, cyclesRes] = await Promise.all([
        getCurrentCycle(),
        getSavingsGoals(),
        getSummary(),
        getSettings(),
        getCycles(),
      ]);

      setCycle(cycleRes.data || null);
      setGoals(goalsRes.data || []);
      setSummary(summaryRes.data || null);
      setSettings(settingsRes.data || {});

      // Check for rollover notification from most recent closed cycle
      const allCycles = cyclesRes.data || [];
      const closedCycles = allCycles.filter(c => c.status === "CLOSED").sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      if (closedCycles.length > 0) {
        const lastClosed = closedCycles[0];
        const dismissKey = `rollover_dismissed_${lastClosed.id}`;
        const isDismissed = localStorage.getItem(dismissKey) === "true";

        if (!isDismissed && lastClosed.monthlySummary?.expenseRollover) {
          const rollover = lastClosed.monthlySummary.expenseRollover;
          if (rollover.amount > 0 && rollover.goalName) {
            setRolloverBanner({
              amount: rollover.amount,
              goalName: rollover.goalName,
              cycleId: lastClosed.id,
              dismissKey,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await getTransactions({ page: 1, limit: 5, sortBy: "date", sortOrder: "desc" });
      setRecentTx(res.data || []);
    } catch (err) {
      console.error("Failed to fetch recent transactions:", err);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); fetchRecent(); }, [fetchAll, fetchRecent]);

  const handleRefresh = () => {
    fetchAll();
    fetchRecent();
  };

  const dismissRolloverBanner = () => {
    if (rolloverBanner?.dismissKey) {
      localStorage.setItem(rolloverBanner.dismissKey, "true");
    }
    setRolloverBanner(null);
  };

  return (
    <div className="space-y-6">
      {/* Rollover Notification Banner */}
      {rolloverBanner && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 animate-fade-in">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <HiSparkles className="w-4 h-4" />
            <span>
              <span className="font-semibold">${rolloverBanner.amount.toFixed(2)}</span> rolled into{" "}
              <span className="font-semibold">{rolloverBanner.goalName}</span> this month
              <span className="text-emerald-500/60"> — change this anytime in the Goals section below</span>
            </span>
          </p>
          <button
            onClick={dismissRolloverBanner}
            className="text-emerald-500/50 hover:text-emerald-400 transition-colors cursor-pointer p-1"
            id="dismiss-rollover-banner"
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <SummaryCards summary={summary} loading={loading} />

      {/* Salary Receipt + Cycle Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SalaryReceipt />
        <CycleTracker
          cycle={cycle}
          settings={settings}
          loading={loading}
          onSettingChange={fetchAll}
        />
      </div>

      {/* Cycle History Dashboard */}
      <CycleDashboard />

      {/* Recent Transactions */}
      <div>
        <div className="animate-fade-in-up-d3 mb-2">
          <h2 className="text-lg font-bold text-surface-100">Recent Transactions</h2>
          <p className="text-xs text-surface-500">Click any cell to edit inline. Click + Add to create new.</p>
        </div>
        <TransactionTable
          transactions={recentTx}
          pagination={null}
          loading={recentLoading}
          onPageChange={() => {}}
          onSortChange={() => {}}
          sortBy="date"
          sortOrder="desc"
          onRefresh={handleRefresh}
        />
      </div>

      {/* Savings Goals */}
      <SavingsGoals goals={goals} loading={loading} onRefresh={fetchAll} settings={settings} />
    </div>
  );
}
