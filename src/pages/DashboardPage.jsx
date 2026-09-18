import { useState, useEffect, useCallback } from "react";
import SummaryCards from "../components/SummaryCards";
import CycleTracker from "../components/CycleTracker";
import SavingsGoals from "../components/SavingsGoals";
import TransactionTable from "../components/TransactionTable";
import SalaryReceipt from "../components/SalaryReceipt";
import CycleDashboard from "../components/CycleDashboard";
import {
  getCurrentCycle, getSavingsGoals,
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cycleRes, goalsRes, summaryRes, settingsRes] = await Promise.all([
        getCurrentCycle(),
        getSavingsGoals(),
        getSummary(),
        getSettings(),
      ]);

      setCycle(cycleRes.data || null);
      setGoals(goalsRes.data || []);
      setSummary(summaryRes.data || null);
      setSettings(settingsRes.data || {});
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

  return (
    <div className="space-y-6">
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
      <SavingsGoals goals={goals} loading={loading} onRefresh={fetchAll} />
    </div>
  );
}
