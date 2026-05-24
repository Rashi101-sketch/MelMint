import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { HiTrendingUp, HiTrendingDown, HiShieldCheck } from "react-icons/hi";
import CyclePeriodSelector from "./CyclePeriodSelector";
import { getCashFlow } from "../services/api";

const TABS = [
  { key: "income", label: "Income", icon: HiTrendingUp, color: "#34d399", pillClass: "tab-pill-income" },
  { key: "spending", label: "Spending", icon: HiTrendingDown, color: "#f87171", pillClass: "tab-pill-spending" },
  { key: "investing", label: "Investing", icon: HiShieldCheck, color: "#fbbf24", pillClass: "tab-pill-investing" },
];

const CATEGORY_COLORS = [
  "#14b8a6", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#64748b",
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-900/95 border border-surface-700/50 rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-bold text-surface-200 mb-1.5">{payload[0]?.payload?.category || label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-surface-400">{entry.name}:</span>
          <span className="font-bold text-surface-100">
            ${Number(entry.value).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function CashFlowChart() {
  const [activeTab, setActiveTab] = useState("income");
  const [period, setPeriod] = useState("fortnightly");
  const [cashFlowData, setCashFlowData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCashFlow({ period });
      setCashFlowData(res);
      setSelectedIndex(0);
    } catch (err) {
      console.error("Failed to fetch cash flow:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periods = cashFlowData?.data || [];
  const selected = periods[selectedIndex] || null;

  // Format currency
  const fmt = (n) => `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;

  // Build bar chart data based on active tab
  const getChartData = () => {
    if (!selected) return [];

    if (activeTab === "income") {
      return (selected.incomeBreakdown || []).map((item) => ({
        category: item.category,
        amount: item.amount,
        count: item.count,
      }));
    }

    if (activeTab === "spending") {
      return (selected.expenseBreakdown || []).map((item) => ({
        category: item.category,
        amount: item.amount,
        count: item.count,
      }));
    }

    // Investing tab — show savings goals
    if (cashFlowData?.savingsGoals) {
      return cashFlowData.savingsGoals.map((g) => ({
        category: g.name,
        amount: g.savedAmount,
        target: g.targetAmount,
      }));
    }

    return [];
  };

  const chartData = getChartData();
  const tabColor = TABS.find((t) => t.key === activeTab)?.color || "#14b8a6";

  // Overview bar data (Income vs Spending vs Investing for selected period)
  const overviewData = selected ? [
    { name: "Income", value: selected.income, fill: "#34d399" },
    { name: "Spending", value: selected.spending, fill: "#f87171" },
    { name: "Investing", value: selected.investing, fill: "#fbbf24" },
  ] : [];

  if (loading) {
    return (
      <div className="glass-card p-6 animate-fade-in-up-d2">
        <div className="h-5 w-40 bg-surface-700/50 rounded animate-pulse mb-4" />
        <div className="h-10 bg-surface-700/20 rounded-xl animate-pulse mb-4" />
        <div className="h-64 bg-surface-700/20 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden animate-fade-in-up-d2">
      {/* Header with period selector */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-100 flex items-center gap-2">
            📊 Cash Flow
          </h2>
        </div>

        <CyclePeriodSelector
          period={period}
          onPeriodChange={setPeriod}
          periods={periods}
          selectedIndex={selectedIndex}
          onSelectPeriod={setSelectedIndex}
        />
      </div>

      {/* Net Income Display */}
      {selected && (
        <div className="net-income-display">
          <p className="net-income-label">Net Income</p>
          <p className={`net-income-value ${selected.netIncome >= 0 ? "net-income-positive" : "net-income-negative"}`}>
            {selected.netIncome < 0 && "-"}{fmt(selected.netIncome)}
          </p>
          <p className="net-income-subtitle">{selected.label}</p>
        </div>
      )}

      {/* Overview Bars (Income | Spending | Investing side by side) */}
      {selected && (
        <div className="px-6 pb-2">
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={overviewData} layout="vertical" barSize={18}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={70}
                tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {overviewData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab Pills */}
      <div className="px-6 py-3">
        <div className="tab-pills">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                className={`tab-pill ${activeTab === tab.key ? tab.pillClass : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {selected && (
                    <span className="ml-1 text-[10px] opacity-70">
                      {fmt(
                        tab.key === "income" ? selected.income :
                        tab.key === "spending" ? selected.spending :
                        selected.investing
                      )}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown Bar Chart */}
      <div className="px-6 pb-6">
        {chartData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-surface-500 text-sm">
              No {activeTab} data for this period
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
            <BarChart
              data={chartData}
              layout="vertical"
              barSize={16}
              margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.06)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                type="category"
                dataKey="category"
                width={100}
                tick={{ fill: "#cbd5e1", fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
              <Bar dataKey="amount" radius={[0, 8, 8, 0]} name="Amount">
                {chartData.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={tabColor}
                    fillOpacity={0.85 - (idx * 0.05)}
                  />
                ))}
              </Bar>
              {activeTab === "investing" && (
                <Bar dataKey="target" radius={[0, 8, 8, 0]} name="Target" fillOpacity={0.2}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={tabColor} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
