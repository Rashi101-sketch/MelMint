const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// ─────────────────────────────────────────────────────────────
// GET /api/cycles — List all cycles (history) with full stats
// Only shows non-LEGACY cycles (monthly cycles)
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const cycles = await prisma.cycle.findMany({
      where: { status: { in: ["ACTIVE", "CLOSED"] } },
      orderBy: { startDate: "desc" },
      include: {
        _count: { select: { transactions: true } },
      },
    });

    // Read the interest boost toggle
    const boostSetting = await prisma.setting.findUnique({ where: { key: "interest_boosts_limit" } });
    const interestBoostsLimit = boostSetting?.value !== "false";

    // For each cycle, compute full stats
    const cyclesWithStats = await Promise.all(
      cycles.map(async (cycle) => {
        const [expenseAgg, regularExpenseAgg, interestIncomeAgg, salaryIncomeAgg] = await Promise.all([
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
          // Only Interest-category income can boost the expense limit
          prisma.transaction.aggregate({
            where: {
              cycleId: cycle.id,
              transactionType: "INCOME",
              category: "Interest",
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
        const interestIncome = Number(interestIncomeAgg._sum.amount || 0);
        const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
        const limitBoost = interestBoostsLimit ? interestIncome : 0;
        let adjustedExpenseLimit = baseLimit + limitBoost;
        const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);

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
          salaryAmount: salaryIncome || Number(cycle.salaryAmount),
          expenseLimit: baseLimit,
          adjustedExpenseLimit,
          interestIncome,
          interestBoostsLimit,
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
        message: "No active cycle.",
      });
    }

    // Read the interest boost toggle
    const boostSetting = await prisma.setting.findUnique({ where: { key: "interest_boosts_limit" } });
    const interestBoostsLimit = boostSetting?.value !== "false";

    // Get expense breakdown for this cycle
    const [expenseAgg, regularExpenseAgg, salaryIncomeAgg, interestIncomeAgg, expensesByCategory, savingsGoals] = await Promise.all([
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
      prisma.transaction.aggregate({
        where: {
          cycleId: activeCycle.id,
          transactionType: "INCOME",
          category: { in: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      }),
      // Only Interest-category income can boost the expense limit
      prisma.transaction.aggregate({
        where: {
          cycleId: activeCycle.id,
          transactionType: "INCOME",
          category: "Interest",
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
        orderBy: { priority: "desc" },
      }),
    ]);

    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);
    const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
    const interestIncome = Number(interestIncomeAgg._sum.amount || 0);
    const totalIncome = salaryIncome + interestIncome;
    let baseExpenseLimit = Number(activeCycle.expenseLimit);
    const limitBoost = interestBoostsLimit ? interestIncome : 0;
    let adjustedExpenseLimit = baseExpenseLimit + limitBoost;

    const remaining = adjustedExpenseLimit - regularExpenses;

    // Overspend detection
    const overspend = Math.max(0, regularExpenses - adjustedExpenseLimit);
    let overspendDeduction = null;

    if (overspend > 0 && savingsGoals.length > 0) {
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
        unrecoverable: amountToDeduct,
      };
    }

    // Calculate days into cycle using actual month dates
    const startDate = new Date(activeCycle.startDate);
    const endDate = activeCycle.endDate ? new Date(activeCycle.endDate) : new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0);
    const today = new Date();
    const daysIntoCycle = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    const totalDaysInCycle = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const daysLeft = Math.max(0, totalDaysInCycle - daysIntoCycle);

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

    // ── Projected Savings Preview (Pool 1 + Pool 2) ──
    // Read configured rollover/overspend goals
    const [rolloverSetting, overspendSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "rollover_goal_id" } }),
      prisma.setting.findUnique({ where: { key: "overspend_goal_id" } }),
    ]);

    const goalsAsc = [...savingsGoals].sort((a, b) => a.priority - b.priority);
    const priorityMostImportant = goalsAsc[0];
    const priorityLeastImportant = goalsAsc[goalsAsc.length - 1];

    const rolloverGoal = rolloverSetting
      ? goalsAsc.find(g => g.id === Number(rolloverSetting.value)) || priorityMostImportant
      : priorityMostImportant;

    const overspendGoalObj = overspendSetting
      ? goalsAsc.find(g => g.id === Number(overspendSetting.value)) || priorityLeastImportant
      : priorityLeastImportant;

    // Pool 1: Salary allocation preview
    const projectedAvailableForGoals = Math.max(0, parseFloat((salaryIncome - dynamicRent - baseExpenseLimit).toFixed(2)));
    const goalBreakdown = goalsAsc
      .filter(g => g.percentage > 0)
      .map(g => ({
        goalId: g.id,
        goalName: g.name,
        percentage: g.percentage,
        amount: parseFloat(((g.percentage / 100) * projectedAvailableForGoals).toFixed(2)),
      }));

    // Pool 2: Expense rollover preview
    const projectedRollover = Math.max(0, parseFloat((adjustedExpenseLimit - regularExpenses).toFixed(2)));
    const projectedOverspend = Math.max(0, parseFloat((regularExpenses - adjustedExpenseLimit).toFixed(2)));

    const projectedSavings = {
      totalSalary: salaryIncome,
      rent: dynamicRent,
      budgetCommitment: baseExpenseLimit,
      availableForGoals: projectedAvailableForGoals,
      goalBreakdown,
      expenseRollover: {
        adjustedLimit: adjustedExpenseLimit,
        spent: regularExpenses,
        projectedRollover,
        projectedOverspend,
        rolloverGoalName: rolloverGoal?.name || null,
        rolloverGoalId: rolloverGoal?.id || null,
        overspendGoalName: overspendGoalObj?.name || null,
        overspendGoalId: overspendGoalObj?.id || null,
      },
      isPreview: true,
    };

    res.json({
      success: true,
      data: {
        ...activeCycle,
        salaryAmount: salaryIncome || Number(activeCycle.salaryAmount),
        expenseLimit: baseExpenseLimit,
        adjustedExpenseLimit,
        interestIncome,
        interestBoostsLimit,
        dynamicRent,
        rolloverAmount: Number(activeCycle.rolloverAmount),
        totalExpenses,
        regularExpenses,
        totalIncome,
        remaining,
        overspend,
        overspendDeduction,
        daysIntoCycle,
        daysLeft,
        totalDaysInCycle,
        estimatedEndDate: endDate.toISOString(),
        transactionCount: activeCycle._count.transactions,
        cycleNotes: activeCycle.cycleNotes || null,
        projectedSavings,
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

    // Read the interest boost toggle
    const boostSetting = await prisma.setting.findUnique({ where: { key: "interest_boosts_limit" } });
    const interestBoostsLimit = boostSetting?.value !== "false";

    const [expenseAgg, regularExpenseAgg, interestIncomeAgg, salaryIncomeAgg, rentAgg, expensesByCategory] = await Promise.all([
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
      // Only Interest-category income can boost the expense limit
      prisma.transaction.aggregate({
        where: {
          cycleId: cycle.id,
          transactionType: "INCOME",
          category: "Interest",
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
    const interestIncome = Number(interestIncomeAgg._sum.amount || 0);
    const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
    const limitBoost = interestBoostsLimit ? interestIncome : 0;
    let adjustedExpenseLimit = baseLimit + limitBoost;
    const regularExpenses = Number(regularExpenseAgg._sum.amount || 0);
    const dynamicRent = Number(rentAgg._sum.amount || 0);
    const totalExpenses = Number(expenseAgg._sum.amount || 0);
    const totalIncome = salaryIncome + interestIncome;

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
        salaryAmount: salaryIncome || Number(cycle.salaryAmount),
        expenseLimit: baseLimit,
        adjustedExpenseLimit,
        interestIncome,
        interestBoostsLimit,
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
