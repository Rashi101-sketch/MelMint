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
const { getMonthBounds } = require("../lib/ensureCycle");

// ─────────────────────────────────────────────────────────────
// GET /api/transactions — List transactions (paginated + filtered)
// ─────────────────────────────────────────────────────────────
router.get("/", validate(queryTransactionsSchema, "query"), async (req, res, next) => {
  try {
    const {
      page, limit, sortBy, sortOrder,
      transactionType, category, paymentMethod,
      cycleId, startDate, endDate,
    } = req.query;

    const where = {};

    if (transactionType) where.transactionType = transactionType;
    if (category) where.category = { contains: category };
    if (paymentMethod) where.paymentMethod = { contains: paymentMethod };
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
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// Helper: Find the monthly cycle a transaction date falls into
// ─────────────────────────────────────────────────────────────
async function findCycleForDate(txDate) {
  // Find a cycle whose date range covers this transaction's date
  const match = await prisma.cycle.findFirst({
    where: {
      startDate: { lte: txDate },
      endDate: { gte: txDate },
      status: { in: ["ACTIVE", "CLOSED"] },
    },
    orderBy: { startDate: "desc" },
  });
  return match;
}

// ─────────────────────────────────────────────────────────────
// POST /api/transactions — Create a transaction
// Assigns transaction to the monthly cycle matching its date.
// Salary transactions are treated as regular income (no cycle trigger).
// ─────────────────────────────────────────────────────────────
router.post("/", validate(createTransactionSchema, "body"), async (req, res, next) => {
  try {
    let { date, transactionType, category, paymentMethod, description, amount, walletId } = req.body;

    const txDate = new Date(date);

    // ── Find the correct monthly cycle for this transaction's date ──
    let targetCycleId = null;
    const matchingCycle = await findCycleForDate(txDate);
    if (matchingCycle) {
      targetCycleId = matchingCycle.id;
    } else {
      // If no cycle exists for this date, try to create one (for backdated transactions)
      const { start, end } = getMonthBounds(txDate);
      const limitSetting = await prisma.setting.findUnique({ where: { key: "expense_limit" } });
      const expenseLimit = parseFloat(limitSetting?.value || "300");

      const newCycle = await prisma.cycle.create({
        data: {
          startDate: start,
          endDate: end,
          salaryAmount: 0,
          expenseLimit,
          status: txDate < new Date() ? "CLOSED" : "ACTIVE",
        },
      });
      targetCycleId = newCycle.id;
    }

    const transaction = await prisma.transaction.create({
      data: {
        date: txDate,
        transactionType,
        category,
        paymentMethod,
        description,
        amount,
        walletId: walletId || null,
        cycleId: targetCycleId,
      },
    });

    // If this is a salary transaction, update the cycle's salaryAmount
    if (category.toLowerCase() === "salary" && transactionType === "INCOME" && targetCycleId) {
      const salaryAgg = await prisma.transaction.aggregate({
        where: {
          cycleId: targetCycleId,
          transactionType: "INCOME",
          category: { in: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      });
      await prisma.cycle.update({
        where: { id: targetCycleId },
        data: { salaryAmount: Number(salaryAgg._sum.amount || 0) },
      });
    }

    // Trigger synchronization of the target cycle to update allocations
    if (targetCycleId) {
      await syncCycle(targetCycleId);
    }

    res.status(201).json({
      success: true,
      data: { ...transaction, amount: Number(transaction.amount) },
      assignedCycleId: targetCycleId,
    });
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

    // If date changed, reassign to the correct monthly cycle
    const newDate = req.body.date ? new Date(req.body.date) : existing.date;
    if (req.body.date) {
      updateData.date = newDate;
      const matchingCycle = await findCycleForDate(newDate);
      updateData.cycleId = matchingCycle?.id || null;
    }

    // Handle amount changes
    if (req.body.amount !== undefined) {
      updateData.amount = req.body.amount;
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: updateData,
    });

    // Synchronize cycles affected by the edit
    if (existing.cycleId) {
      await syncCycle(existing.cycleId);
    }
    if (updated.cycleId && updated.cycleId !== existing.cycleId) {
      await syncCycle(updated.cycleId);
    }

    // If salary amount changed, update the cycle's salaryAmount
    const checkCategory = req.body.category || existing.category;
    if (checkCategory.toLowerCase() === "salary" && updated.cycleId) {
      const salaryAgg = await prisma.transaction.aggregate({
        where: {
          cycleId: updated.cycleId,
          transactionType: "INCOME",
          category: { in: ["Salary", "salary"] },
        },
        _sum: { amount: true },
      });
      await prisma.cycle.update({
        where: { id: updated.cycleId },
        data: { salaryAmount: Number(salaryAgg._sum.amount || 0) },
      });
    }

    res.json({
      success: true,
      data: { ...updated, amount: Number(updated.amount) },
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

    await prisma.transaction.delete({ where: { id } });

    // Synchronize the cycle affected by the deletion
    if (existing.cycleId) {
      await syncCycle(existing.cycleId);

      // If it was a salary, update the cycle's salaryAmount
      if (existing.category.toLowerCase() === "salary" && existing.transactionType === "INCOME") {
        const salaryAgg = await prisma.transaction.aggregate({
          where: {
            cycleId: existing.cycleId,
            transactionType: "INCOME",
            category: { in: ["Salary", "salary"] },
          },
          _sum: { amount: true },
        });
        await prisma.cycle.update({
          where: { id: existing.cycleId },
          data: { salaryAmount: Number(salaryAgg._sum.amount || 0) },
        });
      }
    }

    res.json({ success: true, message: `Transaction ${id} deleted` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
