const prisma = require("./prisma");

/**
 * Synchronizes a cycle's allocations, rent shortfalls, and rollovers.
 * Re-evaluates transactions and updates savings goals and contribution history accordingly.
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

    // 2. Fetch the goals sorted by priority
    const goals = await prisma.savingsGoal.findMany({ orderBy: { priority: "asc" } });
    const mostImportantGoal = goals.find(g => g.priority === 1) || goals[0];
    const leastImportantGoal = [...goals].reverse().find(g => g.priority === 3) || goals[goals.length - 1];

    // 3. Find amounts
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

    // Read the interest boost toggle
    const boostSetting = await prisma.setting.findUnique({ where: { key: "interest_boosts_limit" } });
    const interestBoostsLimit = boostSetting?.value !== "false";
    const limitBoost = interestBoostsLimit ? interestIncome : 0;

    const isCycle1Exception = cycle.startDate >= new Date("2026-04-08") && cycle.startDate <= new Date("2026-04-21T23:59:59");

    // ─── PART A: START-OF-CYCLE ROUTING (Salary allocations and rent shortfalls) ───
    // A1. Reverse existing salary allocations AND rent shortfall deductions for this cycle
    const existingStartAllocations = await prisma.savingsContribution.findMany({
      where: { cycleId, source: { in: ["salary_allocation", "rent_shortfall"] } }
    });

    for (const c of existingStartAllocations) {
      const goal = goals.find(g => g.id === c.goalId);
      if (goal) {
        goal.savedAmount = Number(goal.savedAmount) - Number(c.amount);
        await prisma.savingsGoal.update({
          where: { id: goal.id },
          data: { savedAmount: Math.max(0, goal.savedAmount) }
        });
      }
    }

    // Delete old salary allocations and rent shortfall records
    await prisma.savingsContribution.deleteMany({
      where: { cycleId, source: { in: ["salary_allocation", "rent_shortfall"] } }
    });

    // A2. Calculate new salary allocations and rent shortfall
    let availableSavings = 0;
    let rentShortfall = 0;
    const newCycleNotes = [];

    if (salaryAmount > 0) {
      const expenseLimit = Number(cycle.expenseLimit);
      const afterLimit = salaryAmount - expenseLimit;
      if (afterLimit < dynamicRent && dynamicRent > 0) {
        rentShortfall = dynamicRent - Math.max(0, afterLimit);
        // Deduct rent shortfall from least important goal WITH contribution record
        if (leastImportantGoal) {
          const deductAmount = Math.min(rentShortfall, Math.max(0, Number(leastImportantGoal.savedAmount)));
          leastImportantGoal.savedAmount = Math.max(0, Number(leastImportantGoal.savedAmount) - deductAmount);
          await prisma.savingsGoal.update({
            where: { id: leastImportantGoal.id },
            data: { savedAmount: leastImportantGoal.savedAmount }
          });
          // Create tracked contribution record so it can be reversed on re-sync
          if (deductAmount > 0) {
            await prisma.savingsContribution.create({
              data: {
                cycleId,
                goalId: leastImportantGoal.id,
                amount: -deductAmount, // negative = deduction
                source: "rent_shortfall"
              }
            });
          }
          newCycleNotes.push(`Rent shortfall $${rentShortfall.toFixed(2)}, deducted from ${leastImportantGoal.name}`);
        }
      }
      availableSavings = Math.max(0, salaryAmount - dynamicRent - expenseLimit);
    }

    // A3. Auto-apply new salary allocations
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
        }
      }
    }

    // ─── PART B: END-OF-CYCLE ROUTING (Rollover or Overspend) ───
    // B1. Reverse existing rollover and overspend deductions from goals' savedAmount
    const existingEndAllocations = await prisma.savingsContribution.findMany({
      where: { cycleId, source: { in: ["rollover", "overspend_deduction"] } }
    });

    for (const c of existingEndAllocations) {
      const goal = goals.find(g => g.id === c.goalId);
      if (goal) {
        // Reverse deduction (which is negative) or rollover (which is positive)
        goal.savedAmount = Number(goal.savedAmount) - Number(c.amount);
        await prisma.savingsGoal.update({
          where: { id: goal.id },
          data: { savedAmount: Math.max(0, goal.savedAmount) }
        });
      }
    }

    // Delete old rollover and overspend deductions
    await prisma.savingsContribution.deleteMany({
      where: { cycleId, source: { in: ["rollover", "overspend_deduction"] } }
    });

    // B2. Only calculate and apply end-of-cycle rollover/overspend if CLOSED!
    if (cycle.status === "CLOSED") {
      let baseLimit = Number(cycle.expenseLimit);
      let adjustedLimit = baseLimit + limitBoost;
      if (isCycle1Exception) {
        adjustedLimit = salaryAmount + limitBoost;
      }

      const remaining = adjustedLimit - regularExpenses;
      const expectedRollover = Math.max(0, remaining);
      const expectedOverspend = Math.max(0, -remaining);

      const closingNotes = [];
      if (expectedRollover > 0 && mostImportantGoal) {
        mostImportantGoal.savedAmount = Number(mostImportantGoal.savedAmount) + expectedRollover;
        await prisma.savingsGoal.update({
          where: { id: mostImportantGoal.id },
          data: { savedAmount: mostImportantGoal.savedAmount }
        });
        await prisma.savingsContribution.create({
          data: {
            cycleId,
            goalId: mostImportantGoal.id,
            amount: expectedRollover,
            source: "rollover"
          }
        });
        closingNotes.push(`Saved $${expectedRollover.toFixed(2)}, added to ${mostImportantGoal.name}`);
      } else if (expectedOverspend > 0 && leastImportantGoal) {
        const available = Number(leastImportantGoal.savedAmount);
        const deductAmount = Math.min(expectedOverspend, available);
        leastImportantGoal.savedAmount = Math.max(0, available - deductAmount);
        await prisma.savingsGoal.update({
          where: { id: leastImportantGoal.id },
          data: { savedAmount: leastImportantGoal.savedAmount }
        });
        await prisma.savingsContribution.create({
          data: {
            cycleId,
            goalId: leastImportantGoal.id,
            amount: -deductAmount,
            source: "overspend_deduction"
          }
        });
        closingNotes.push(`Overspent by $${expectedOverspend.toFixed(2)}, deducted from ${leastImportantGoal.name}`);
        if (deductAmount < expectedOverspend) {
          closingNotes.push(`$${(expectedOverspend - deductAmount).toFixed(2)} unrecoverable`);
        }
      } else {
        closingNotes.push("Broke even — no adjustment needed");
      }

      const mergedNotes = [...newCycleNotes, ...closingNotes].join(" | ");

      // Update cycle in DB
      await prisma.cycle.update({
        where: { id: cycleId },
        data: {
          rolloverAmount: expectedRollover,
          cycleNotes: mergedNotes
        }
      });
    } else {
      // If cycle is still ACTIVE, update notes if rent shortfall occurred
      await prisma.cycle.update({
        where: { id: cycleId },
        data: {
          cycleNotes: newCycleNotes.length > 0 ? newCycleNotes.join(" | ") : null
        }
      });
    }

    console.log(`[SyncCycle] Cycle ${cycleId} successfully synchronized.`);
  } catch (err) {
    console.error(`[SyncCycle] Error syncing cycle ${cycleId}:`, err);
  }
}

module.exports = { syncCycle };
