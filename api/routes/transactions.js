const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
} = require("../validators/schemas");
const { syncCycle } = require("../lib/cycleSync");

// ─────────────────────────────────────────────────────────────
// GET /api/transactions — List transactions (paginated + filtered)
// ─────────────────────────────────────────────────────────────
router.get("/", validate(queryTransactionsSchema, "query"), async (req, res, next) => {
  try {
    const {
      page, limit, sortBy, sortOrder,
      transactionType, category, paymentMethod,
      walletId, cycleId, startDate, endDate,
    } = req.query;

    const where = {};

    if (transactionType) where.transactionType = transactionType;
    if (category) where.category = { contains: category };
    if (paymentMethod) where.paymentMethod = { contains: paymentMethod };
    if (walletId) where.walletId = walletId;
    if (cycleId) where.cycleId = cycleId;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: { wallet: { select: { name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        walletName: t.wallet?.name,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// Helper: Find the cycle a transaction date falls into
// Checks all cycles' date ranges to find the matching one
// Prioritizes ACTIVE cycles to avoid boundary date conflicts
// ─────────────────────────────────────────────────────────────
async function findCycleForDate(txDate) {
  // First try: find the ACTIVE cycle that started before or on this date
  // Check ACTIVE first to prioritize current cycle when date matches cycle boundary
  const activeMatch = await prisma.cycle.findFirst({
    where: {
      startDate: { lte: txDate },
      status: "ACTIVE",
    },
    orderBy: { startDate: "desc" },
  });
  if (activeMatch) return activeMatch;

  // Second try: find a CLOSED cycle whose date range covers this date
  // Use endDate > txDate instead of >= to avoid double-counting boundary dates
  const closedMatch = await prisma.cycle.findFirst({
    where: {
      startDate: { lte: txDate },
      endDate: { gt: txDate }, // Use > instead of >= to exclude the end boundary
      status: "CLOSED",
    },
    orderBy: { startDate: "desc" },
  });
  if (closedMatch) return closedMatch;

  // Third try: if the date is before all cycles, find the earliest cycle
  // (for very old backdated transactions)
  const earliestCycle = await prisma.cycle.findFirst({
    orderBy: { startDate: "asc" },
  });

  // Only assign if the date is reasonably close (within 14 days before cycle start)
  if (earliestCycle) {
    const cycleStart = new Date(earliestCycle.startDate);
    const diffDays = (cycleStart - txDate) / (1000 * 60 * 60 * 24);
    if (diffDays <= 14 && diffDays >= 0) return earliestCycle;
  }

  return null; // No matching cycle found
}

// ─────────────────────────────────────────────────────────────
// POST /api/transactions — Create a transaction
// If category === "Salary", triggers the cycle/rollover logic
// Assigns transaction to the cycle matching its DATE, not current time
// ─────────────────────────────────────────────────────────────
router.post("/", validate(createTransactionSchema, "body"), async (req, res, next) => {
  try {
    let { date, transactionType, category, paymentMethod, description, amount, walletId } = req.body;

    const isSalary = category.toLowerCase() === "salary" && transactionType === "INCOME";
    const txDate = new Date(date);
    const isCycle1Exception = txDate >= new Date("2026-04-08") && txDate <= new Date("2026-04-21T23:59:59");

    // Rent Sourcing Exception
    if (isCycle1Exception && category.toLowerCase() === "rent") {
      const setupFund = await prisma.wallet.findFirst({ where: { name: { contains: "Setup" } } });
      if (setupFund) {
        walletId = setupFund.id;
      }
    }

    let newCycle = null;
    let rolloverAmount = 0;
    let availableSavings = 0;
    let suggestedAllocations = [];
    let salaryBreakdown = null;

    if (isSalary) {
      // ── 1. Close previous active cycle with smart adjustments ──
      const previousCycle = await prisma.cycle.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
      });

      const closingNotes = [];

      if (previousCycle) {
        // Sum regular expenses in the previous cycle (exclude Rent)
        const expenseAgg = await prisma.transaction.aggregate({
          where: {
            cycleId: previousCycle.id,
            transactionType: "EXPENSE",
            category: { notIn: ["Rent", "rent"] },
          },
          _sum: { amount: true },
        });

        // Sum extra income in the previous cycle (exclude Salary)
        const extraIncomeAgg = await prisma.transaction.aggregate({
          where: {
            cycleId: previousCycle.id,
            transactionType: "INCOME",
            category: { notIn: ["Salary", "salary"] },
          },
          _sum: { amount: true },
        });

        const totalRegularExpenses = Number(expenseAgg._sum.amount || 0);
        const extraIncome = Number(extraIncomeAgg._sum.amount || 0);
        
        let baseLimit = Number(previousCycle.expenseLimit);
        let adjustedExpenseLimit = baseLimit + extraIncome;

        // Cycle 1 Exception
        const isCycle1ExceptionPrev = previousCycle.startDate >= new Date("2026-04-08") && previousCycle.startDate <= new Date("2026-04-21T23:59:59");
        if (isCycle1ExceptionPrev) {
          const salaryIncomeAgg = await prisma.transaction.aggregate({
            where: {
              cycleId: previousCycle.id,
              transactionType: "INCOME",
              category: { in: ["Salary", "salary"] },
            },
            _sum: { amount: true },
          });
          const salaryIncome = Number(salaryIncomeAgg._sum.amount || 0);
          adjustedExpenseLimit = salaryIncome + extraIncome;
        }

        const remaining = adjustedExpenseLimit - totalRegularExpenses;
        rolloverAmount = Math.max(0, remaining);

        // Get goals sorted by priority for smart adjustments
        const mostImportantGoal = await prisma.savingsGoal.findFirst({
          orderBy: { priority: "asc" }, // priority 1 = most important
        });
        const leastImportantGoal = await prisma.savingsGoal.findFirst({
          orderBy: { priority: "desc" }, // priority 3 = least important
        });

        if (remaining > 0 && mostImportantGoal) {
          // SAVED: Transfer surplus to Most Important Goal
          await prisma.savingsGoal.update({
            where: { id: mostImportantGoal.id },
            data: {
              savedAmount: Number(mostImportantGoal.savedAmount) + remaining,
            },
          });
          // Record contribution history for rollover
          await prisma.savingsContribution.create({
            data: {
              cycleId: previousCycle.id,
              goalId: mostImportantGoal.id,
              amount: remaining,
              source: "rollover",
            },
          });
          closingNotes.push(`Saved $${remaining.toFixed(2)}, added to ${mostImportantGoal.name}`);
        } else if (remaining < 0 && leastImportantGoal) {
          // OVERSPENT: Deduct from Least Important Goal
          const overspend = Math.abs(remaining);
          const available = Number(leastImportantGoal.savedAmount);
          const deductAmount = Math.min(overspend, available);
          await prisma.savingsGoal.update({
            where: { id: leastImportantGoal.id },
            data: {
              savedAmount: Math.max(0, available - deductAmount),
            },
          });
          // Record contribution history for overspend deduction
          await prisma.savingsContribution.create({
            data: {
              cycleId: previousCycle.id,
              goalId: leastImportantGoal.id,
              amount: -deductAmount, // negative = deduction
              source: "overspend_deduction",
            },
          });
          closingNotes.push(`Overspent by $${overspend.toFixed(2)}, deducted from ${leastImportantGoal.name}`);
          if (deductAmount < overspend) {
            closingNotes.push(`$${(overspend - deductAmount).toFixed(2)} unrecoverable`);
          }
        } else {
          closingNotes.push("Broke even — no adjustment needed");
        }

        // Close the previous cycle
        await prisma.cycle.update({
          where: { id: previousCycle.id },
          data: {
            endDate: txDate,
            status: "CLOSED",
            rolloverAmount,
            cycleNotes: closingNotes.join(" | "),
          },
        });
      }

      // ── 2. Get current expense limit from settings ──────────
      const limitSetting = await prisma.setting.findUnique({ where: { key: "expense_limit" } });
      const expenseLimit = parseFloat(limitSetting?.value || "150");

      // ── 3. Create new cycle ──────────────────────────────────
      newCycle = await prisma.cycle.create({
        data: {
          startDate: txDate,
          salaryAmount: amount,
          expenseLimit,
          rolloverAmount,
          status: "ACTIVE",
        },
      });

      // ── 4. Dynamic rent: fetch from transactions in this cycle ──
      // (Rent may be added on the same day, so we check after cycle creation)
      // For now, calculate based on the current state — rent transactions
      // will be assigned to this cycle when they're created
      const rentAgg = await prisma.transaction.aggregate({
        where: {
          cycleId: newCycle.id,
          transactionType: "EXPENSE",
          category: { in: ["Rent", "rent"] },
        },
        _sum: { amount: true },
      });
      const dynamicRent = Number(rentAgg._sum.amount || 0);

      // ── 5. Priority-based salary routing ──────────────────────
      // Step 1: Reserve expense limit
      const afterLimit = amount - expenseLimit;
      // Step 2: Pay rent from remaining
      let rentShortfall = 0;
      const newCycleNotes = [];

      if (afterLimit < dynamicRent && dynamicRent > 0) {
        rentShortfall = dynamicRent - Math.max(0, afterLimit);
        // Deduct shortfall from least important goal
        const leastGoal = await prisma.savingsGoal.findFirst({
          orderBy: { priority: "desc" },
        });
        if (leastGoal) {
          const goalAvailable = Number(leastGoal.savedAmount);
          const deduct = Math.min(rentShortfall, goalAvailable);
          await prisma.savingsGoal.update({
            where: { id: leastGoal.id },
            data: { savedAmount: Math.max(0, goalAvailable - deduct) },
          });
          newCycleNotes.push(`Rent shortfall $${rentShortfall.toFixed(2)}, deducted from ${leastGoal.name}`);
        }
      }

      // Update cycle notes if shortfall occurred
      if (newCycleNotes.length > 0) {
        await prisma.cycle.update({
          where: { id: newCycle.id },
          data: { cycleNotes: newCycleNotes.join(" | ") },
        });
      }

      // ── 6. Calculate available savings ────────────────────────
      availableSavings = Math.max(0, amount - dynamicRent - expenseLimit);

      // ── 7. Get suggested allocations ──────────────────────────
      const goals = await prisma.savingsGoal.findMany({ orderBy: { priority: "asc" } });
      suggestedAllocations = goals.map((g) => ({
        goalId: g.id,
        goalName: g.name,
        percentage: g.percentage,
        priority: g.priority,
        suggestedAmount: isCycle1Exception ? 0 : parseFloat(((g.percentage / 100) * availableSavings).toFixed(2)),
        currentSaved: Number(g.savedAmount),
        targetAmount: Number(g.targetAmount),
      }));

      // ── 7b. AUTO-APPLY savings allocations to goals ────────────
      // Persist allocations immediately so goals stay in sync
      if (!isCycle1Exception && availableSavings > 0) {
        for (const alloc of suggestedAllocations) {
          if (alloc.suggestedAmount <= 0) continue;

          // Update goal balance
          await prisma.savingsGoal.update({
            where: { id: alloc.goalId },
            data: { savedAmount: { increment: alloc.suggestedAmount } },
          });

          // Record contribution history
          await prisma.savingsContribution.create({
            data: {
              cycleId: newCycle.id,
              goalId: alloc.goalId,
              amount: alloc.suggestedAmount,
              source: "salary_allocation",
            },
          });

          // Record the allocation in the cycle notes so it is visible in the UI
          newCycleNotes.push(`Allocated $${alloc.suggestedAmount.toFixed(2)} to ${alloc.goalName}`);
        }
      }

      // ── 8. Build salary breakdown for Receipt UI ──────────────
      salaryBreakdown = {
        totalSalary: amount,
        expenseLimit,
        dynamicRent,
        rentShortfall,
        rentShortfallSource: rentShortfall > 0 ? (await prisma.savingsGoal.findFirst({ orderBy: { priority: "desc" } }))?.name : null,
        availableForGoals: availableSavings,
        goalDistribution: suggestedAllocations,
        closingNotes: closingNotes.length > 0 ? closingNotes : null,
        cycleNotes: newCycleNotes.length > 0 ? newCycleNotes : null,
      };
    }

    // ── Find the correct cycle for this transaction's date ────
    // For salary, use the newly created cycle.
    // For everything else, find by date range.
    let targetCycleId = null;

    if (newCycle) {
      targetCycleId = newCycle.id;
    } else {
      // Find the cycle whose date range covers this transaction's date
      const matchingCycle = await findCycleForDate(txDate);
      targetCycleId = matchingCycle?.id || null;
    }

    const transaction = await prisma.transaction.create({
      data: {
        date: txDate,
        transactionType,
        category,
        paymentMethod,
        description,
        amount,
        walletId,
        cycleId: targetCycleId,
      },
      include: { wallet: { select: { name: true } } },
    });

    // ── Update wallet balance ─────────────────────────────────
    const balanceChange = transactionType === "INCOME" ? amount : -amount;
    await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: balanceChange } },
    });

    const response = {
      success: true,
      data: { ...transaction, amount: Number(transaction.amount), walletName: transaction.wallet?.name },
    };

    // Add salary-specific data to the response
    if (isSalary) {
      response.cycleCreated = true;
      response.cycle = {
        ...newCycle,
        salaryAmount: Number(newCycle.salaryAmount),
        expenseLimit: Number(newCycle.expenseLimit),
        rolloverAmount: Number(newCycle.rolloverAmount),
        cycleNotes: newCycle.cycleNotes,
      };
      response.rolloverAmount = rolloverAmount;
      response.availableSavings = availableSavings;
      response.suggestedAllocations = suggestedAllocations;
      response.salaryBreakdown = salaryBreakdown;
    }

    // Include which cycle it was assigned to (helpful for UI feedback)
    response.assignedCycleId = targetCycleId;

    // Trigger synchronization of the target cycle to update allocations/rollovers
    if (targetCycleId) {
      await syncCycle(targetCycleId);
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/transactions/:id — Inline edit (update any field)
// ─────────────────────────────────────────────────────────────
router.put("/:id", validate(updateTransactionSchema, "body"), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid transaction ID" });
    }

    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Transaction ${id} not found` });
    }

    // Build update data — only include fields that were sent
    const updateData = {};
    if (req.body.transactionType) updateData.transactionType = req.body.transactionType;
    if (req.body.category) updateData.category = req.body.category;
    if (req.body.paymentMethod) updateData.paymentMethod = req.body.paymentMethod;
    if (req.body.description) updateData.description = req.body.description;
    if (req.body.walletId) updateData.walletId = req.body.walletId;

    // If date changed, reassign to the correct cycle
    const newDate = req.body.date ? new Date(req.body.date) : existing.date;
    if (req.body.date) {
      updateData.date = newDate;
      // Find the cycle this date belongs to and reassign
      const matchingCycle = await findCycleForDate(newDate);
      updateData.cycleId = matchingCycle?.id || null;
    }

    const isCycle1Exception = newDate >= new Date("2026-04-08") && newDate <= new Date("2026-04-21T23:59:59");
    const checkCategory = req.body.category || existing.category;
    
    // Rent Sourcing Exception
    if (isCycle1Exception && checkCategory.toLowerCase() === "rent") {
      const setupFund = await prisma.wallet.findFirst({ where: { name: { contains: "Setup" } } });
      if (setupFund) {
        req.body.walletId = setupFund.id;
        updateData.walletId = setupFund.id;
      }
    }

    // Handle amount changes — update wallet balance accordingly
    if (req.body.amount !== undefined) {
      const oldAmount = Number(existing.amount);
      const newAmount = req.body.amount;
      const oldType = existing.transactionType;
      const newType = req.body.transactionType || oldType;

      // Reverse old balance impact
      const oldImpact = oldType === "INCOME" ? -oldAmount : oldAmount;
      // Apply new balance impact
      const newImpact = newType === "INCOME" ? newAmount : -newAmount;
      const netChange = oldImpact + newImpact;

      const targetWalletId = req.body.walletId || existing.walletId;

      if (netChange !== 0) {
        await prisma.wallet.update({
          where: { id: targetWalletId },
          data: { balance: { increment: netChange } },
        });
      }

      // If wallet changed, also reverse from old wallet
      if (req.body.walletId && req.body.walletId !== existing.walletId) {
        const reverseOld = oldType === "INCOME" ? -oldAmount : oldAmount;
        await prisma.wallet.update({
          where: { id: existing.walletId },
          data: { balance: { increment: reverseOld } },
        });
        const applyNew = newType === "INCOME" ? newAmount : -newAmount;
        await prisma.wallet.update({
          where: { id: req.body.walletId },
          data: { balance: { increment: applyNew } },
        });
      }

      updateData.amount = newAmount;
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: updateData,
      include: { wallet: { select: { name: true } } },
    });

    // Synchronize cycles affected by the edit
    if (existing.cycleId) {
      await syncCycle(existing.cycleId);
    }
    if (updated.cycleId && updated.cycleId !== existing.cycleId) {
      await syncCycle(updated.cycleId);
    }

    res.json({
      success: true,
      data: { ...updated, amount: Number(updated.amount), walletName: updated.wallet?.name },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/transactions/:id — Delete a transaction
// ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid transaction ID" });
    }

    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Transaction ${id} not found` });
    }

    // Reverse the wallet balance impact
    const reversal = existing.transactionType === "INCOME"
      ? -Number(existing.amount)
      : Number(existing.amount);

    await prisma.wallet.update({
      where: { id: existing.walletId },
      data: { balance: { increment: reversal } },
    });

    await prisma.transaction.delete({ where: { id } });

    // Synchronize the cycle affected by the deletion
    if (existing.cycleId) {
      await syncCycle(existing.cycleId);
    }

    res.json({ success: true, message: `Transaction ${id} deleted` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
