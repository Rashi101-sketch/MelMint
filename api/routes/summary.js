const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const { summaryQuerySchema } = require("../validators/schemas");
// ─────────────────────────────────────────────────────────────
// GET /api/summary — Financial summary
//
// The Starting Balance represents the initial baseline balance stored
// in the Settings table ("starting_balance", defaults to $0 for new users).
//
// totalIncome, totalExpenses, netBalance count transactions belonging
// to monthly cycles (or custom date range/cycle filter).
//
// totalBalance = startingBalance + netBalance (earned)
//
// Query params:
//   ?cycleId=1           → Summary for a specific cycle
//   ?startDate=&endDate= → Custom date range
//   (no params)          → All active/tracked cycles summary
// ─────────────────────────────────────────────────────────────
router.get("/", validate(summaryQuerySchema, "query"), async (req, res, next) => {
  try {
    const { cycleId, startDate, endDate } = req.query;

    // ── Starting Balance: stored in settings (defaults to 0) ─
    const startingBalSetting = await prisma.setting.findUnique({
      where: { key: "starting_balance" },
    });
    const startingBalance = parseFloat(startingBalSetting?.value || "0");

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
      // Default: count all transactions belonging to cycles
      where.cycleId = { not: null };
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
