const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// ─────────────────────────────────────────────────────────────
// GET /api/cycles — List all cycles (history) with full stats
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const cycles = await prisma.cycle.findMany({
      orderBy: { startDate: "desc" },
      include: {
        _count: { select: { transactions: true } },
      },
    });

    // For each cycle, compute full stats
    const cyclesWithStats = await Promise.all(
      cycles.map(async (cycle) => {
        const [expenseAgg, regularExpenseAgg, extraIncomeAgg, salaryIncomeAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: { cycleId: cycle.id, transactionType: "EXPENSE" },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              cycleId: cycle.id,
              transactionType: "EXPENSE",
              category: { notIn: ["Rent", "rent"] },
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              cycleId: cycle.id,
              transactionType: "INCOME",
              category: { notIn: ["Salary", "salary"] },
            },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: {
              cycleId: cycle.id,
              transactionType: "INCOME",
              category: { in: ["Salary", "salary"] },
            },
            _sum: { amount: true },
          }),
        ]);

        let baseLimit = Number(cycle.expenseLimit);
        const extraIncome = Number(extraIncomeAgg._sum.amount || 0);
        const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
        let adjustedExpenseLimit = baseLimit + extraIncome;
        const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);

        // Cycle 1 Exception
        const isCycle1Exception = cycle.startDate >= new Date("2026-04-08") && cycle.startDate <= new Date("2026-04-21T23:59:59");
        if (isCycle1Exception) {
          adjustedExpenseLimit = salaryIncome + extraIncome; // exact pooled income budget
          baseLimit = adjustedExpenseLimit;
        }

        // Dynamic rent: sum of Rent transactions in this cycle
        const rentAgg = await prisma.transaction.aggregate({
          where: {
            cycleId: cycle.id,
            transactionType: "EXPENSE",
            category: { in: ["Rent", "rent"] },
          },
          _sum: { amount: true },
        });
        const dynamicRent = Number(rentAgg._sum.amount || 0);

        return {
          ...cycle,
          salaryAmount: Number(cycle.salaryAmount),
          expenseLimit: baseLimit,
          adjustedExpenseLimit,
          extraIncome,
          dynamicRent,
          rolloverAmount: Number(cycle.rolloverAmount),
          totalExpenses: Number(expenseAgg._sum.amount || 0),
          regularExpenses,
          remaining: adjustedExpenseLimit - regularExpenses,
          transactionCount: cycle._count.transactions,
          cycleNotes: cycle.cycleNotes || null,
        };
      })
    );

    res.json({ success: true, data: cyclesWithStats });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/cycles/current — Get the active cycle with stats
// ─────────────────────────────────────────────────────────────
router.get("/current", async (req, res, next) => {
  try {
    const activeCycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      include: {
        _count: { select: { transactions: true } },
      },
    });

    if (!activeCycle) {
      return res.json({
        success: true,
        data: null,
        message: "No active cycle. Add a salary transaction to start one.",
      });
    }

    // Get expense breakdown for this cycle
    // Separate regular expenses (excl. rent) for limit tracking
    const [expenseAgg, regularExpenseAgg, salaryIncomeAgg, extraIncomeAgg, expensesByCategory, savingsGoals] = await Promise.all([
      prisma.transaction.aggregate({
        where: { cycleId: activeCycle.id, transactionType: "EXPENSE" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          cycleId: activeCycle.id,
          transactionType: "EXPENSE",
          category: { notIn: ["Rent", "rent"] },
        },
        _sum: { amount: true },
      }),
      // Salary income only
      prisma.transaction.aggregate({
        where: {
          cycleId: activeCycle.id,
          transactionType: "INCOME",
          category: { in: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      }),
      // Extra income (non-salary)
      prisma.transaction.aggregate({
        where: {
          cycleId: activeCycle.id,
          transactionType: "INCOME",
          category: { notIn: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { cycleId: activeCycle.id, transactionType: "EXPENSE" },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.savingsGoal.findMany({
        orderBy: { priority: "desc" }, // least important first
      }),
    ]);

    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);
    const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
    const extraIncome = Number(extraIncomeAgg._sum.amount || 0);
    const totalIncome = salaryIncome + extraIncome;
    let baseExpenseLimit = Number(activeCycle.expenseLimit);

    // Extra income boosts the expense limit
    let adjustedExpenseLimit = baseExpenseLimit + extraIncome;

    // Cycle 1 Exception
    const isCycle1Exception = activeCycle.startDate >= new Date("2026-04-08") && activeCycle.startDate <= new Date("2026-04-21T23:59:59");
    if (isCycle1Exception) {
      adjustedExpenseLimit = totalIncome; // exact pooled income budget
      baseExpenseLimit = adjustedExpenseLimit;
    }

    const remaining = adjustedExpenseLimit - regularExpenses;

    // Overspend detection — if expenses exceed the adjusted limit
    const overspend = Math.max(0, regularExpenses - adjustedExpenseLimit);
    let overspendDeduction = null;

    if (overspend > 0 && savingsGoals.length > 0) {
      // Find least important goal(s) with savings to deduct from
      // Goals sorted by priority DESC = least important first
      let amountToDeduct = overspend;
      const deductions = [];

      for (const goal of savingsGoals) {
        if (amountToDeduct <= 0) break;
        const available = Number(goal.savedAmount);
        if (available <= 0) continue;

        const deductAmount = Math.min(amountToDeduct, available);
        deductions.push({
          goalId: goal.id,
          goalName: goal.name,
          priority: goal.priority,
          deductAmount,
          currentSaved: available,
        });
        amountToDeduct -= deductAmount;
      }

      overspendDeduction = {
        totalOverspend: overspend,
        deductions,
        unrecoverable: amountToDeduct, // amount that couldn't be covered by any goal
      };
    }

    // Calculate days into cycle and estimated end
    const startDate = new Date(activeCycle.startDate);
    const today = new Date();
    const daysIntoCycle = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    const estimatedEndDate = new Date(startDate);
    estimatedEndDate.setDate(estimatedEndDate.getDate() + 13);

    // Dynamic rent for this cycle
    const rentAgg = await prisma.transaction.aggregate({
      where: {
        cycleId: activeCycle.id,
        transactionType: "EXPENSE",
        category: { in: ["Rent", "rent"] },
      },
      _sum: { amount: true },
    });
    const dynamicRent = Number(rentAgg._sum.amount || 0);

    res.json({
      success: true,
      data: {
        ...activeCycle,
        salaryAmount: Number(activeCycle.salaryAmount),
        expenseLimit: baseExpenseLimit,
        adjustedExpenseLimit,
        extraIncome,
        dynamicRent,
        rolloverAmount: Number(activeCycle.rolloverAmount),
        totalExpenses,
        regularExpenses,
        totalIncome,
        remaining,
        overspend,
        overspendDeduction,
        daysIntoCycle,
        estimatedEndDate: estimatedEndDate.toISOString(),
        transactionCount: activeCycle._count.transactions,
        cycleNotes: activeCycle.cycleNotes || null,
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

// ─────────────────────────────────────────────────────────────
// GET /api/cycles/:id — Get a single cycle with full stats
// (Used by Salary Receipt and Cycle Dashboard for historical views)
// ─────────────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid cycle ID" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id },
      include: {
        _count: { select: { transactions: true } },
      },
    });

    if (!cycle) {
      return res.status(404).json({ success: false, message: `Cycle ${id} not found` });
    }

    const [expenseAgg, regularExpenseAgg, extraIncomeAgg, salaryIncomeAgg, rentAgg, expensesByCategory] = await Promise.all([
      prisma.transaction.aggregate({
        where: { cycleId: cycle.id, transactionType: "EXPENSE" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          cycleId: cycle.id,
          transactionType: "EXPENSE",
          category: { notIn: ["Rent", "rent"] },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          cycleId: cycle.id,
          transactionType: "INCOME",
          category: { notIn: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          cycleId: cycle.id,
          transactionType: "INCOME",
          category: { in: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          cycleId: cycle.id,
          transactionType: "EXPENSE",
          category: { in: ["Rent", "rent"] },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { cycleId: cycle.id, transactionType: "EXPENSE" },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
      }),
    ]);

    let baseLimit = Number(cycle.expenseLimit);
    const extraIncome = Number(extraIncomeAgg._sum.amount || 0);
    const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
    let adjustedExpenseLimit = baseLimit + extraIncome;
    const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);
    const dynamicRent = Number(rentAgg._sum.amount || 0);
    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const totalIncome = salaryIncome + extraIncome;

    // Cycle 1 Exception
    const isCycle1Exception = cycle.startDate >= new Date("2026-04-08") && cycle.startDate <= new Date("2026-04-21T23:59:59");
    if (isCycle1Exception) {
      adjustedExpenseLimit = totalIncome;
      baseLimit = adjustedExpenseLimit;
    }

    const remaining = adjustedExpenseLimit - regularExpenses;

    // Salary breakdown for Receipt view
    const salaryBreakdown = {
      totalSalary: salaryIncome,
      expenseLimit: baseLimit,
      dynamicRent,
      availableForGoals: Math.max(0, salaryIncome - dynamicRent - baseLimit),
    };

    res.json({
      success: true,
      data: {
        ...cycle,
        salaryAmount: Number(cycle.salaryAmount),
        expenseLimit: baseLimit,
        adjustedExpenseLimit,
        extraIncome,
        dynamicRent,
        rolloverAmount: Number(cycle.rolloverAmount),
        totalExpenses,
        regularExpenses,
        totalIncome,
        remaining,
        transactionCount: cycle._count.transactions,
        cycleNotes: cycle.cycleNotes || null,
        salaryBreakdown,
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

// ─────────────────────────────────────────────────────────────
// PUT /api/cycles/:id/limit — Update expense limit for a cycle
// ─────────────────────────────────────────────────────────────
router.put("/:id/limit", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { limit, applyToAll } = req.body;

    if (isNaN(id) || isNaN(limit) || limit < 0) {
      return res.status(400).json({ success: false, message: "Invalid limit or cycle ID" });
    }

    // Update the specific cycle's limit
    const updatedCycle = await prisma.cycle.update({
      where: { id },
      data: { expenseLimit: limit },
    });

    // If applied to all, update the global setting
    if (applyToAll) {
      const existingSetting = await prisma.setting.findUnique({ where: { key: "expense_limit" } });
      if (existingSetting) {
        await prisma.setting.update({
          where: { key: "expense_limit" },
          data: { value: String(limit) },
        });
      } else {
        await prisma.setting.create({
          data: { key: "expense_limit", value: String(limit) },
        });
      }
    }

    res.json({ success: true, data: updatedCycle });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
