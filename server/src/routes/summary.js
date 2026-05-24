const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const { summaryQuerySchema } = require("../validators/schemas");

// ─────────────────────────────────────────────────────────────
// GET /api/summary — Financial summary
//
// Query params:
//   ?cycleId=1           → Summary for a specific cycle
//   ?startDate=&endDate= → Custom date range
//   (no params)          → All-time summary
// ─────────────────────────────────────────────────────────────
router.get("/", validate(summaryQuerySchema, "query"), async (req, res, next) => {
  try {
    const { cycleId, startDate, endDate } = req.query;

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
    const totalSaved = savingsGoals.reduce((sum, g) => sum + Number(g.savedAmount), 0);

    res.json({
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netBalance: totalIncome - totalExpenses,
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
