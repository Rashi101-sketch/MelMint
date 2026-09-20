const prisma = require("./prisma");

/**
 * Returns the first and last day of a given month in UTC.
 * @param {Date} date - Any date within the target month
 * @returns {{ start: Date, end: Date }}
 */
function getMonthBounds(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Lazy cycle management middleware.
 * Runs on every API request to ensure a valid monthly cycle exists.
 *
 * 1. Finds the active cycle
 * 2. If no active cycle exists, or if today is past the active cycle's endDate,
 *    closes the old cycle and creates a new one for the current calendar month
 * 3. Sets req.activeCycle for downstream route handlers
 */
async function ensureCurrentCycle(req, res, next) {
  try {
    const now = new Date();

    const activeCycle = await prisma.cycle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });

    if (activeCycle) {
      // Check if we've moved past this cycle's end date
      if (activeCycle.endDate && now > new Date(activeCycle.endDate)) {
        // Close the old cycle
        await prisma.cycle.update({
          where: { id: activeCycle.id },
          data: { status: "CLOSED" },
        });

        // Run sync on the closed cycle to finalize rollover/overspend
        const { syncCycle } = require("./cycleSync");
        await syncCycle(activeCycle.id);

        // Create new cycle for the current month
        const newCycle = await createMonthlyCycle(now);
        req.activeCycle = newCycle;
      } else {
        req.activeCycle = activeCycle;
      }
    } else {
      // No active cycle — create one for the current month
      const newCycle = await createMonthlyCycle(now);
      req.activeCycle = newCycle;
    }

    next();
  } catch (err) {
    console.error("[EnsureCycle] Error:", err);
    // Don't block the request if cycle management fails
    next();
  }
}

/**
 * Creates a new monthly cycle for the month containing the given date.
 * @param {Date} date - A date within the target month
 * @returns {Promise<Object>} The created cycle record
 */
async function createMonthlyCycle(date) {
  const { start, end } = getMonthBounds(date);

  // Check if a cycle for this month already exists (avoid duplicates)
  const existing = await prisma.cycle.findFirst({
    where: {
      startDate: start,
      status: { in: ["ACTIVE", "CLOSED"] },
    },
  });
  if (existing) {
    // If it's closed, reactivate it (shouldn't happen in normal flow)
    if (existing.status === "CLOSED") {
      return prisma.cycle.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
    }
    return existing;
  }

  // Get expense limit from settings
  const limitSetting = await prisma.setting.findUnique({
    where: { key: "expense_limit" },
  });
  const expenseLimit = parseFloat(limitSetting?.value || "300");

  // Sum salary income for this month to populate salaryAmount
  const salaryAgg = await prisma.transaction.aggregate({
    where: {
      transactionType: "INCOME",
      category: { in: ["Salary", "salary"] },
      date: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  const salaryAmount = Number(salaryAgg._sum.amount || 0);

  const cycle = await prisma.cycle.create({
    data: {
      startDate: start,
      endDate: end,
      salaryAmount,
      expenseLimit,
      status: "ACTIVE",
    },
  });

  console.log(`[EnsureCycle] Created monthly cycle ${cycle.id} for ${start.toISOString().slice(0, 7)}`);
  return cycle;
}

module.exports = { ensureCurrentCycle, getMonthBounds, createMonthlyCycle };
