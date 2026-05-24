import { useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";

/**
 * CommBank-style period selector with fortnightly/monthly toggle
 * and a dropdown to pick a specific cycle/month.
 */
export default function CyclePeriodSelector({
  period,
  onPeriodChange,
  periods,
  selectedIndex,
  onSelectPeriod,
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Period toggle: Fortnightly | Monthly */}
      <div className="period-toggle">
        <button
          id="period-fortnightly"
          className={`period-btn ${period === "fortnightly" ? "period-btn-active" : ""}`}
          onClick={() => onPeriodChange("fortnightly")}
        >
          Fortnightly
        </button>
        <button
          id="period-monthly"
          className={`period-btn ${period === "monthly" ? "period-btn-active" : ""}`}
          onClick={() => onPeriodChange("monthly")}
        >
          Monthly
        </button>
      </div>

      {/* Cycle navigation */}
      {periods && periods.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            id="prev-period"
            onClick={() => onSelectPeriod(Math.min(selectedIndex + 1, periods.length - 1))}
            disabled={selectedIndex >= periods.length - 1}
            className="p-1.5 rounded-lg bg-surface-800/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <HiChevronLeft className="w-4 h-4" />
          </button>

          <select
            id="cycle-dropdown"
            className="cycle-select"
            value={selectedIndex}
            onChange={(e) => onSelectPeriod(Number(e.target.value))}
          >
            {periods.map((p, idx) => (
              <option key={p.id} value={idx}>
                {p.label}
              </option>
            ))}
          </select>

          <button
            id="next-period"
            onClick={() => onSelectPeriod(Math.max(selectedIndex - 1, 0))}
            disabled={selectedIndex <= 0}
            className="p-1.5 rounded-lg bg-surface-800/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <HiChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
