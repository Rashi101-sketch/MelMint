const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const { cashflowQuerySchema } = require("../validators/schemas");

// ─────────────────────────────────────────────────────────────
// GET /api/cashflow — Aggregated cash flow data for bar charts
//
// Query params:
//   ?period=fortnightly  → Group by fortnightly cycles
//   ?period=monthly      → Group by calendar month
//   ?cycleId=1           → Show data for a specific cycle only
// ─────────────────────────────────────────────────────────────
router.get("/", validate(cashflowQuerySchema, "query"), async (req, res, next) => {
  try {
    const { period, cycleId } = req.query;

    if (period === "fortnightly" || cycleId) {
      // ── Fortnightly: group by cycles ──────────────────────
      const cycleWhere = {};
      if (cycleId) {
        cycleWhere.id = cycleId;
      }

      const cycles = await prisma.cycle.findMany({
        where: cycleWhere,
        orderBy: { startDate: "desc" },
        take: cycleId ? 1 : 12, // last 12 cycles if not specific
      });

      const data = await Promise.all(
        cycles.map(async (cycle) => {
          const [incomeAgg, expenseAgg, savingsAllocated] = await Promise.all([
            prisma.transaction.aggregate({
              where: { cycleId: cycle.id, transactionType: "INCOME" },
              _sum: { amount: true },
              _count: true,
            }),
            prisma.transaction.aggregate({
              where: { cycleId: cycle.id, transactionType: "EXPENSE" },
              _sum: { amount: true },
              _count: true,
            }),
            // For "investing" we use savings allocations that happened during cycle period
            prisma.savingsGoal.aggregate({
              _sum: { savedAmount: true },
            }),
          ]);

          // Get expense breakdown by category for this cycle
          const expensesByCategory = await prisma.transaction.groupBy({
            by: ["category"],
            where: { cycleId: cycle.id, transactionType: "EXPENSE" },
            _sum: { amount: true },
            _count: true,
            orderBy: { _sum: { amount: "desc" } },
          });

          // Get income breakdown by category for this cycle
          const incomeByCategory = await prisma.transaction.groupBy({
            by: ["category"],
            where: { cycleId: cycle.id, transactionType: "INCOME" },
            _sum: { amount: true },
            _count: true,
            orderBy: { _sum: { amount: "desc" } },
          });

          const income = Number(incomeAgg._sum.amount || 0);
          const spending = Number(expenseAgg._sum.amount || 0);

          // Calculate investing as salary - rent - expenses (what went to savings)
          const salaryAmount = Number(cycle.salaryAmount);
          const investing = Math.max(0, salaryAmount - spending - Number(cycle.expenseLimit));

          const startDate = new Date(cycle.startDate);
          const endDate = cycle.endDate ? new Date(cycle.endDate) : new Date(startDate);
          if (!cycle.endDate) {
            endDate.setDate(endDate.getDate() + 13);
          }

          return {
            id: cycle.id,
            label: `${startDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${endDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
            startDate: cycle.startDate,
            endDate: endDate.toISOString(),
            status: cycle.status,
            income,
            spending,
            investing,
            netIncome: income - spending,
            expenseBreakdown: expensesByCategory.map((item) => ({
              category: item.category,
              amount: Number(item._sum.amount),
              count: item._count,
            })),
            incomeBreakdown: incomeByCategory.map((item) => ({
              category: item.category,
              amount: Number(item._sum.amount),
              count: item._count,
            })),
          };
        })
      );

      // Overall totals for savings goals (investing)
      const savingsGoals = await prisma.savingsGoal.findMany();
      const totalSaved = savingsGoals.reduce((sum, g) => sum + Number(g.savedAmount), 0);

      res.json({
        success: true,
        period: "fortnightly",
        data,
        totalSaved,
        savingsGoals: savingsGoals.map((g) => ({
          id: g.id,
          name: g.name,
          savedAmount: Number(g.savedAmount),
          targetAmount: Number(g.targetAmount),
          percentage: g.percentage,
        })),
      });
    } else {
      // ── Monthly: group by calendar month ──────────────────
      // Get all transactions grouped by month
      const transactions = await prisma.transaction.findMany({
        orderBy: { date: "desc" },
        select: {
          date: true,
          transactionType: true,
          category: true,
          amount: true,
        },
      });

      // Group by month
      const monthMap = new Map();

      for (const tx of transactions) {
        const d = new Date(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

        if (!monthMap.has(key)) {
          monthMap.set(key, {
            id: key,
            label,
            startDate: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
            endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString(),
            income: 0,
            spending: 0,
            investing: 0,
            netIncome: 0,
            incomeBreakdown: {},
            expenseBreakdown: {},
          });
        }

        const month = monthMap.get(key);
        const amount = Number(tx.amount);

        if (tx.transactionType === "INCOME") {
          month.income += amount;
          if (!month.incomeBreakdown[tx.category]) {
            month.incomeBreakdown[tx.category] = { amount: 0, count: 0 };
          }
          month.incomeBreakdown[tx.category].amount += amount;
          month.incomeBreakdown[tx.category].count += 1;
        } else {
          month.spending += amount;
          if (!month.expenseBreakdown[tx.category]) {
            month.expenseBreakdown[tx.category] = { amount: 0, count: 0 };
          }
          month.expenseBreakdown[tx.category].amount += amount;
          month.expenseBreakdown[tx.category].count += 1;
        }
      }

      // Convert map to array and compute net
      const data = Array.from(monthMap.values())
        .map((month) => {
          month.netIncome = month.income - month.spending;
          month.investing = Math.max(0, month.income - month.spending);

          // Convert breakdown objects to arrays
          month.expenseBreakdown = Object.entries(month.expenseBreakdown)
            .map(([category, data]) => ({ category, amount: data.amount, count: data.count }))
            .sort((a, b) => b.amount - a.amount);
          month.incomeBreakdown = Object.entries(month.incomeBreakdown)
            .map(([category, data]) => ({ category, amount: data.amount, count: data.count }))
            .sort((a, b) => b.amount - a.amount);

          return month;
        })
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .slice(0, 12);

      const savingsGoals = await prisma.savingsGoal.findMany();
      const totalSaved = savingsGoals.reduce((sum, g) => sum + Number(g.savedAmount), 0);

      res.json({
        success: true,
        period: "monthly",
        data,
        totalSaved,
        savingsGoals: savingsGoals.map((g) => ({
          id: g.id,
          name: g.name,
          savedAmount: Number(g.savedAmount),
          targetAmount: Number(g.targetAmount),
          percentage: g.percentage,
        })),
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
