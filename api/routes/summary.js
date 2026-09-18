const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const { summaryQuerySchema } = require("../validators/schemas");
const { EARNING_START_DATE } = require("../lib/ensureCycle");

// ─────────────────────────────────────────────────────────────
// GET /api/summary — Financial summary
//
// The Starting Balance ($2,634.79) represents pre-existing money
// from parents, computed as all Setup Fund transactions strictly before
// 2026-04-22. It is frozen and never changes.
//
// totalIncome, totalExpenses, netBalance only count transactions
// ON OR AFTER 2026-04-22 (the earning period).
//
// totalBalance = startingBalance + netBalance (earned)
//
// Query params:
//   ?cycleId=1           → Summary for a specific cycle
//   ?startDate=&endDate= → Custom date range
//   (no params)          → Earned-period summary (post-22-April)
// ─────────────────────────────────────────────────────────────
router.get("/", validate(summaryQuerySchema, "query"), async (req, res, next) => {
  try {
    const { cycleId, startDate, endDate } = req.query;

    // ── Starting Balance: frozen pre-earning period ──────────
    // Frozen Starting Balance: sum of all Setup Fund transactions strictly before 2026-04-22 ($2,634.79)
    const preEarningCutoff = new Date("2026-04-22T00:00:00.000Z");
    const [preIncome, preExpense] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          wallet: { name: "Setup Fund" },
          transactionType: "INCOME",
          date: { lt: preEarningCutoff },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          wallet: { name: "Setup Fund" },
          transactionType: "EXPENSE",
          date: { lt: preEarningCutoff },
        },
        _sum: { amount: true },
      }),
    ]);
    const startingBalance = Number(preIncome._sum.amount || 0) - Number(preExpense._sum.amount || 0);

    // ── Earned-period summary ────────────────────────────────
    const where = {};

    if (cycleId) {
      where.cycleId = cycleId;
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    } else {
      // Default: only count post-22-April transactions
      where.date = { gte: EARNING_START_DATE };
    }

    const [incomeAgg, expenseAgg, expensesByCategory, savingsGoals] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...where, transactionType: "INCOME" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...where, transactionType: "EXPENSE" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { ...where, transactionType: "EXPENSE" },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.savingsGoal.findMany(),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const netBalance = totalIncome - totalExpenses;
    const totalSaved = savingsGoals.reduce((sum, g) => sum + Number(g.savedAmount), 0);
    const totalBalance = startingBalance + netBalance;

    res.json({
      success: true,
      data: {
        startingBalance,
        totalIncome,
        totalExpenses,
        netBalance,
        totalBalance,
        totalSaved,
        incomeCount: incomeAgg._count,
        expenseCount: expenseAgg._count,
        categoryBreakdown: expensesByCategory.map((item) => ({
          category: item.category,
          amount: Number(item._sum.amount),
          count: item._count,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
