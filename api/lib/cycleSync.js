const prisma = require("./prisma");

/**
 * Synchronizes a cycle's allocations, rent shortfalls, and rollovers.
 * 
 * TIMING:
 * - While ACTIVE: computes preview numbers and updates cycleNotes (rent shortfall warnings),
 *   but does NOT modify goal savedAmounts or create SavingsContribution records.
 * - When CLOSED: executes both Pool 1 (salary allocation) and Pool 2 (expense rollover)
 *   in a single pass, updating goal balances and creating contribution records.
 *   Also builds and persists the monthlySummary JSON.
 * 
 * TWO DISTINCT POOLS:
 * - Pool 1 (Salary Allocation): totalSalary − rent − budgetCommitment → split by % across goals
 * - Pool 2 (Expense Rollover): adjustedExpenseLimit − actualSpent → surplus to rollover goal,
 *   deficit deducted from overspend goal
 * 
 * @param {number|null} cycleId - The ID of the cycle to synchronize.
 */
async function syncCycle(cycleId) {
  if (!cycleId) return;

  try {
    // 1. Fetch the cycle with its transactions
    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { transactions: true }
    });
    if (!cycle) {
      console.warn(`[SyncCycle] Cycle ${cycleId} not found.`);
      return;
    }

    // 2. Fetch goals and configured rollover/overspend targets
    const goals = await prisma.savingsGoal.findMany({ orderBy: { priority: "asc" } });
    const priorityMostImportant = goals.find(g => g.priority === 1) || goals[0];
    const priorityLeastImportant = [...goals].reverse().find(g => g.priority === 3) || goals[goals.length - 1];

    // Read configured rollover/overspend goals from settings (with priority-based fallbacks)
    const [rolloverSetting, overspendSetting, boostSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "rollover_goal_id" } }),
      prisma.setting.findUnique({ where: { key: "overspend_goal_id" } }),
      prisma.setting.findUnique({ where: { key: "interest_boosts_limit" } }),
    ]);

    const rolloverGoal = rolloverSetting
      ? goals.find(g => g.id === Number(rolloverSetting.value)) || priorityMostImportant
      : priorityMostImportant;

    const overspendGoal = overspendSetting
      ? goals.find(g => g.id === Number(overspendSetting.value)) || priorityLeastImportant
      : priorityLeastImportant;

    // 3. Compute amounts from transactions
    const salaryTxs = cycle.transactions.filter(t => t.transactionType === "INCOME" && ["Salary", "salary"].includes(t.category));
    const salaryAmount = salaryTxs.reduce((sum, t) => sum + Number(t.amount), 0);

    const rentTxs = cycle.transactions.filter(t => t.transactionType === "EXPENSE" && ["Rent", "rent"].includes(t.category));
    const dynamicRent = rentTxs.reduce((sum, t) => sum + Number(t.amount), 0);

    const regularExpenses = cycle.transactions
      .filter(t => t.transactionType === "EXPENSE" && !["Rent", "rent"].includes(t.category))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Only Interest-category income is eligible to boost the expense limit
    const interestIncome = cycle.transactions
      .filter(t => t.transactionType === "INCOME" && t.category === "Interest")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const interestBoostsLimit = boostSetting?.value !== "false";
    const limitBoost = interestBoostsLimit ? interestIncome : 0;

    const isCycle1Exception = cycle.startDate >= new Date("2026-04-08") && cycle.startDate <= new Date("2026-04-21T23:59:59");

    // 4. Compute Pool 1 numbers (salary allocation)
    const expenseLimit = Number(cycle.expenseLimit);
    const afterLimit = salaryAmount - expenseLimit;
    let rentShortfall = 0;
    let availableSavings = 0;
    const newCycleNotes = [];

    if (salaryAmount > 0) {
      if (afterLimit < dynamicRent && dynamicRent > 0) {
        rentShortfall = parseFloat((dynamicRent - Math.max(0, afterLimit)).toFixed(2));
        if (overspendGoal) {
          newCycleNotes.push(`Rent shortfall $${rentShortfall.toFixed(2)}, deducted from ${overspendGoal.name}`);
        }
      }
      availableSavings = Math.max(0, parseFloat((salaryAmount - dynamicRent - expenseLimit).toFixed(2)));
    }

    // 5. Compute Pool 2 numbers (expense rollover)
    let baseLimit = expenseLimit;
    let adjustedLimit = baseLimit + limitBoost;
    if (isCycle1Exception) {
      adjustedLimit = salaryAmount + limitBoost;
    }
    const remaining = parseFloat((adjustedLimit - regularExpenses).toFixed(2));
    const expectedRollover = Math.max(0, remaining);
    const expectedOverspend = Math.max(0, parseFloat((-remaining).toFixed(2)));

    // ─── ACTIVE CYCLE: Preview only, no balance updates ───
    if (cycle.status !== "CLOSED") {
      await prisma.cycle.update({
        where: { id: cycleId },
        data: {
          cycleNotes: newCycleNotes.length > 0 ? newCycleNotes.join(" | ") : null
        }
      });
      console.log(`[SyncCycle] Cycle ${cycleId} (ACTIVE) — preview computed, no balance updates.`);
      return;
    }

    // ─── CLOSED CYCLE: Execute both pools ───

    // A. Reverse ALL existing contributions for this cycle (salary_allocation, rent_shortfall, rollover, overspend_deduction)
    const existingContributions = await prisma.savingsContribution.findMany({
      where: { cycleId, source: { in: ["salary_allocation", "rent_shortfall", "rollover", "overspend_deduction"] } }
    });

    for (const c of existingContributions) {
      const goal = goals.find(g => g.id === c.goalId);
      if (goal) {
        goal.savedAmount = Number(goal.savedAmount) - Number(c.amount);
        await prisma.savingsGoal.update({
          where: { id: goal.id },
          data: { savedAmount: Math.max(0, goal.savedAmount) }
        });
      }
    }

    await prisma.savingsContribution.deleteMany({
      where: { cycleId, source: { in: ["salary_allocation", "rent_shortfall", "rollover", "overspend_deduction"] } }
    });

    // B. Pool 1: Salary Allocation
    const salaryBreakdown = [];

    // B1. Rent shortfall deduction (from overspend goal)
    if (rentShortfall > 0 && overspendGoal) {
      const deductAmount = parseFloat(Math.min(rentShortfall, Math.max(0, Number(overspendGoal.savedAmount))).toFixed(2));
      overspendGoal.savedAmount = parseFloat(Math.max(0, Number(overspendGoal.savedAmount) - deductAmount).toFixed(2));
      await prisma.savingsGoal.update({
        where: { id: overspendGoal.id },
        data: { savedAmount: overspendGoal.savedAmount }
      });
      if (deductAmount > 0) {
        await prisma.savingsContribution.create({
          data: {
            cycleId,
            goalId: overspendGoal.id,
            amount: -deductAmount,
            source: "rent_shortfall"
          }
        });
      }
    }

    // B2. Percentage-based salary allocation (runs ONCE with total monthly salary)
    if (!isCycle1Exception && availableSavings > 0) {
      for (const goal of goals) {
        const allocAmount = parseFloat(((goal.percentage / 100) * availableSavings).toFixed(2));
        if (allocAmount > 0) {
          const matchedGoal = goals.find(g => g.id === goal.id);
          matchedGoal.savedAmount = Number(matchedGoal.savedAmount) + allocAmount;
          await prisma.savingsGoal.update({
            where: { id: goal.id },
            data: { savedAmount: matchedGoal.savedAmount }
          });
          await prisma.savingsContribution.create({
            data: {
              cycleId,
              goalId: goal.id,
              amount: allocAmount,
              source: "salary_allocation"
            }
          });
          salaryBreakdown.push({
            goalId: goal.id,
            goalName: goal.name,
            percentage: goal.percentage,
            amount: allocAmount
          });
        }
      }
    }

    // C. Pool 2: Expense Rollover / Overspend
    const closingNotes = [];
    let rolloverInfo = null;

    if (expectedRollover > 0 && rolloverGoal) {
      rolloverGoal.savedAmount = Number(rolloverGoal.savedAmount) + expectedRollover;
      await prisma.savingsGoal.update({
        where: { id: rolloverGoal.id },
        data: { savedAmount: rolloverGoal.savedAmount }
      });
      await prisma.savingsContribution.create({
        data: {
          cycleId,
          goalId: rolloverGoal.id,
          amount: expectedRollover,
          source: "rollover"
        }
      });
      closingNotes.push(`Saved $${expectedRollover.toFixed(2)}, added to ${rolloverGoal.name}`);
      rolloverInfo = {
        adjustedLimit,
        spent: regularExpenses,
        amount: expectedRollover,
        goalName: rolloverGoal.name,
        goalId: rolloverGoal.id
      };
    } else if (expectedOverspend > 0 && overspendGoal) {
      const available = Number(overspendGoal.savedAmount);
      const deductAmount = parseFloat(Math.min(expectedOverspend, available).toFixed(2));
      overspendGoal.savedAmount = parseFloat(Math.max(0, available - deductAmount).toFixed(2));
      await prisma.savingsGoal.update({
        where: { id: overspendGoal.id },
        data: { savedAmount: overspendGoal.savedAmount }
      });
      await prisma.savingsContribution.create({
        data: {
          cycleId,
          goalId: overspendGoal.id,
          amount: -deductAmount,
          source: "overspend_deduction"
        }
      });
      closingNotes.push(`Overspent by $${expectedOverspend.toFixed(2)}, deducted from ${overspendGoal.name}`);
      if (deductAmount < expectedOverspend) {
        closingNotes.push(`$${(expectedOverspend - deductAmount).toFixed(2)} unrecoverable`);
      }
      rolloverInfo = {
        adjustedLimit,
        spent: regularExpenses,
        amount: -deductAmount,
        goalName: overspendGoal.name,
        goalId: overspendGoal.id
      };
    } else {
      closingNotes.push("Broke even — no adjustment needed");
      rolloverInfo = {
        adjustedLimit,
        spent: regularExpenses,
        amount: 0,
        goalName: null,
        goalId: null
      };
    }

    // D. Build monthly summary
    const totalSavingsFromAllocation = parseFloat(salaryBreakdown.reduce((sum, s) => sum + s.amount, 0).toFixed(2));
    const rolloverAmount = expectedRollover;
    const totalSavings = parseFloat((totalSavingsFromAllocation + rolloverAmount).toFixed(2));

    const monthlySummary = {
      totalSalary: salaryAmount,
      totalExpenses: parseFloat((regularExpenses + dynamicRent).toFixed(2)),
      totalRent: dynamicRent,
      regularExpenses,
      totalSavings,
      salaryAllocation: {
        availableForGoals: availableSavings,
        breakdown: salaryBreakdown
      },
      expenseRollover: rolloverInfo
    };

    const mergedNotes = [...newCycleNotes, ...closingNotes].join(" | ");

    // E. Update cycle record
    await prisma.cycle.update({
      where: { id: cycleId },
      data: {
        rolloverAmount: expectedRollover,
        cycleNotes: mergedNotes,
        monthlySummary
      }
    });

    console.log(`[SyncCycle] Cycle ${cycleId} (CLOSED) — finalized. Pool 1: $${totalSavingsFromAllocation.toFixed(2)} allocated, Pool 2: $${expectedRollover.toFixed(2)} rollover.`);
  } catch (err) {
    console.error(`[SyncCycle] Error syncing cycle ${cycleId}:`, err);
  }
}

module.exports = { syncCycle };
