const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const {
  createSavingsGoalSchema,
  addToSavingsGoalSchema,
  allocateSavingsSchema,
} = require("../validators/schemas");

// ─────────────────────────────────────────────────────────────
// GET /api/savings — List all savings goals
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      orderBy: { percentage: "desc" },
    });

    res.json({
      success: true,
      data: goals.map((g) => ({
        ...g,
        targetAmount: Number(g.targetAmount),
        savedAmount: Number(g.savedAmount),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/savings — Create a new savings goal
// ─────────────────────────────────────────────────────────────
router.post("/", validate(createSavingsGoalSchema, "body"), async (req, res, next) => {
  try {
    const { name, targetAmount, percentage } = req.body;

    const goal = await prisma.savingsGoal.create({
      data: { name, targetAmount, savedAmount: 0, percentage },
    });

    res.status(201).json({
      success: true,
      data: {
        ...goal,
        targetAmount: Number(goal.targetAmount),
        savedAmount: Number(goal.savedAmount),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/savings/:id — Add money to a savings goal
// ─────────────────────────────────────────────────────────────
router.patch("/:id", validate(addToSavingsGoalSchema, "body"), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid goal ID" });
    }

    const existing = await prisma.savingsGoal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Savings goal ${id} not found` });
    }

    const { amount } = req.body;
    const newSaved = Number(existing.savedAmount) + amount;

    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: { savedAmount: newSaved },
    });

    res.json({
      success: true,
      data: {
        ...updated,
        targetAmount: Number(updated.targetAmount),
        savedAmount: Number(updated.savedAmount),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/savings/:id — Update a savings goal (target, percentage, name)
// ─────────────────────────────────────────────────────────────
router.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid goal ID" });
    }

    const existing = await prisma.savingsGoal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Savings goal ${id} not found` });
    }

    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name.trim();
    if (req.body.targetAmount !== undefined) updateData.targetAmount = req.body.targetAmount;
    if (req.body.percentage !== undefined) updateData.percentage = req.body.percentage;
    if (req.body.savedAmount !== undefined) updateData.savedAmount = req.body.savedAmount;
    if (req.body.priority !== undefined) updateData.priority = req.body.priority;

    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        targetAmount: Number(updated.targetAmount),
        savedAmount: Number(updated.savedAmount),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/savings/allocate — Distribute savings across goals
// Called after salary is added to distribute available savings
// ─────────────────────────────────────────────────────────────
router.post("/allocate", validate(allocateSavingsSchema, "body"), async (req, res, next) => {
  try {
    const { totalAmount, allocations } = req.body;

    // Validate total doesn't exceed available
    const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
    if (allocatedTotal > totalAmount + 0.01) { // small float tolerance
      return res.status(400).json({
        success: false,
        message: `Allocated total ($${allocatedTotal.toFixed(2)}) exceeds available ($${totalAmount.toFixed(2)})`,
      });
    }

    // Update each goal
    const results = [];
    for (const allocation of allocations) {
      if (allocation.amount <= 0) continue;

      const goal = await prisma.savingsGoal.findUnique({ where: { id: allocation.goalId } });
      if (!goal) continue;

      const updated = await prisma.savingsGoal.update({
        where: { id: allocation.goalId },
        data: {
          savedAmount: Number(goal.savedAmount) + allocation.amount,
        },
      });

      results.push({
        ...updated,
        targetAmount: Number(updated.targetAmount),
        savedAmount: Number(updated.savedAmount),
        allocated: allocation.amount,
      });
    }

    res.json({
      success: true,
      data: results,
      totalAllocated: allocatedTotal,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/savings/:id — Delete a savings goal
// ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid goal ID" });
    }

    const existing = await prisma.savingsGoal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Savings goal ${id} not found` });
    }

    await prisma.savingsGoal.delete({ where: { id } });

    res.json({ success: true, message: `Savings goal "${existing.name}" deleted` });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/savings/:id/contributions — Contribution history
// Returns per-cycle contribution records for a savings goal
// ─────────────────────────────────────────────────────────────
router.get("/:id/contributions", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid goal ID" });
    }

    const contributions = await prisma.savingsContribution.findMany({
      where: { goalId: id },
      include: {
        cycle: {
          select: { startDate: true, endDate: true, salaryAmount: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: contributions.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        source: c.source,
        cycleId: c.cycleId,
        cycleStart: c.cycle.startDate,
        cycleEnd: c.cycle.endDate,
        cycleSalary: Number(c.cycle.salaryAmount),
        cycleStatus: c.cycle.status,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
