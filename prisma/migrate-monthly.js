/**
 * One-time migration script: Convert fortnightly cycles to monthly cycles.
 *
 * What this does:
 * 1. Creates monthly cycle records for each calendar month (Apr 2026 → Sep 2026)
 * 2. Reassigns all transactions to the monthly cycle matching their date
 * 3. Closes Cycle 16 (anomalous backfilled parental deposit cycle)
 * 4. Marks old fortnightly cycles as status "LEGACY"
 * 5. Runs syncCycle() on each new monthly cycle to recalculate allocations
 * 6. Updates the expense_limit setting to $300/month (2× $150/fortnight)
 *
 * Run: node prisma/migrate-monthly.js
 */

const prisma = require("../api/lib/prisma");
const { syncCycle } = require("../api/lib/cycleSync");

const EARNING_START = new Date("2026-04-22T00:00:00.000Z");

function getMonthBounds(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

async function main() {
  console.log("=== MelMint Monthly Cycle Migration ===\n");

  // ── Step 0: Get current state ──────────────────────────────
  const allCycles = await prisma.cycle.findMany({ orderBy: { startDate: "asc" } });
  console.log(`Found ${allCycles.length} existing cycles.`);

  const allTxs = await prisma.transaction.findMany({ orderBy: { date: "asc" } });
  console.log(`Found ${allTxs.length} total transactions.\n`);

  // ── Step 1: Get expense limit ──────────────────────────────
  const limitSetting = await prisma.setting.findUnique({ where: { key: "expense_limit" } });
  const oldLimit = parseFloat(limitSetting?.value || "150");
  const newMonthlyLimit = oldLimit * 2; // $150/fortnight → $300/month
  console.log(`Expense limit: $${oldLimit}/fortnight → $${newMonthlyLimit}/month`);

  // ── Step 2: Determine months to create ─────────────────────
  // From April 2026 (first earning month) through September 2026 (current)
  const months = [];
  const startYear = 2026;
  const startMonth = 3; // April (0-indexed)
  const endYear = 2026;
  const endMonth = 8; // September (0-indexed)

  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 0;
    const mEnd = y === endYear ? endMonth : 11;
    for (let m = mStart; m <= mEnd; m++) {
      months.push({ year: y, month: m });
    }
  }

  console.log(`\nCreating ${months.length} monthly cycles (April to September 2026)...\n`);

  // ── Step 3: Reset savings goals to zero (we'll re-sync) ────
  // First, reverse ALL existing contributions to get clean state
  const existingContributions = await prisma.savingsContribution.findMany();
  console.log(`Found ${existingContributions.length} existing contributions to reverse...`);

  // Get fresh goal data
  const goals = await prisma.savingsGoal.findMany();
  for (const goal of goals) {
    // Reset to zero — syncCycle will rebuild from contributions
    await prisma.savingsGoal.update({
      where: { id: goal.id },
      data: { savedAmount: 0 },
    });
  }

  // Delete ALL existing contributions — they'll be recreated by syncCycle
  await prisma.savingsContribution.deleteMany({});
  console.log("Reset all savings goals to $0.00 and deleted all contributions.\n");

  // ── Step 4: Create monthly cycles ──────────────────────────
  const monthlyCycles = [];

  for (const { year, month } of months) {
    const { start, end } = getMonthBounds(year, month);
    const monthLabel = start.toISOString().slice(0, 7);

    // Check for existing monthly cycle for this month
    const existing = await prisma.cycle.findFirst({
      where: {
        startDate: start,
        endDate: end,
      },
    });

    if (existing) {
      console.log(`  ${monthLabel}: Already exists (ID ${existing.id}), reusing.`);
      monthlyCycles.push(existing);
      continue;
    }

    // Determine status: current month is ACTIVE, past months are CLOSED
    const now = new Date();
    const isCurrentMonth = now >= start && now <= end;
    const status = isCurrentMonth ? "ACTIVE" : "CLOSED";

    const cycle = await prisma.cycle.create({
      data: {
        startDate: start,
        endDate: end,
        salaryAmount: 0, // Will be computed by syncCycle
        expenseLimit: newMonthlyLimit,
        status,
        rolloverAmount: 0,
      },
    });

    console.log(`  ${monthLabel}: Created cycle ID ${cycle.id} (${status})`);
    monthlyCycles.push(cycle);
  }

  // ── Step 5: Reassign transactions to monthly cycles ────────
  console.log("\nReassigning transactions to monthly cycles...");
  let reassigned = 0;
  let skippedPreEarning = 0;

  for (const tx of allTxs) {
    const txDate = new Date(tx.date);

    // Pre-earning period transactions get null cycleId
    if (txDate < EARNING_START) {
      if (tx.cycleId !== null) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { cycleId: null },
        });
      }
      skippedPreEarning++;
      continue;
    }

    // Find the monthly cycle this transaction belongs to
    const monthCycle = monthlyCycles.find((c) => {
      return txDate >= c.startDate && txDate <= c.endDate;
    });

    if (monthCycle) {
      if (tx.cycleId !== monthCycle.id) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { cycleId: monthCycle.id },
        });
        reassigned++;
      }
    } else {
      console.warn(`  ⚠ Transaction ${tx.id} (${txDate.toISOString().slice(0, 10)}) has no matching monthly cycle!`);
    }
  }

  console.log(`  Reassigned: ${reassigned} transactions`);
  console.log(`  Pre-earning (null cycle): ${skippedPreEarning} transactions`);

  // ── Step 6: Mark old fortnightly cycles as LEGACY ──────────
  console.log("\nMarking old fortnightly cycles as LEGACY...");
  const monthlyCycleIds = monthlyCycles.map((c) => c.id);

  for (const cycle of allCycles) {
    if (!monthlyCycleIds.includes(cycle.id)) {
      await prisma.cycle.update({
        where: { id: cycle.id },
        data: {
          status: "LEGACY",
          ...(cycle.endDate ? {} : { endDate: new Date("2026-04-22T23:59:59.999Z") }),
        },
      });
      console.log(`  Cycle ${cycle.id} (${cycle.startDate.toISOString().slice(0, 10)}) → LEGACY`);
    }
  }

  // ── Step 7: Sync each monthly cycle to recompute allocations
  console.log("\nSyncing monthly cycles to recompute allocations...");
  // Sync closed cycles first (in chronological order), then active
  const closedCycles = monthlyCycles.filter((c) => c.status === "CLOSED").sort((a, b) => a.startDate - b.startDate);
  const activeCycles = monthlyCycles.filter((c) => c.status === "ACTIVE");

  for (const cycle of [...closedCycles, ...activeCycles]) {
    const monthLabel = cycle.startDate.toISOString().slice(0, 7);

    // Update salary amount from actual transactions
    const salaryAgg = await prisma.transaction.aggregate({
      where: {
        cycleId: cycle.id,
        transactionType: "INCOME",
        category: { in: ["Salary", "salary"] },
      },
      _sum: { amount: true },
    });
    const salaryAmount = Number(salaryAgg._sum.amount || 0);
    await prisma.cycle.update({
      where: { id: cycle.id },
      data: { salaryAmount },
    });

    await syncCycle(cycle.id);
    console.log(`  ${monthLabel} (ID ${cycle.id}): Synced. Salary: $${salaryAmount.toFixed(2)}`);
  }

  // ── Step 8: Update expense limit setting ───────────────────
  if (limitSetting) {
    await prisma.setting.update({
      where: { key: "expense_limit" },
      data: { value: String(newMonthlyLimit) },
    });
  } else {
    await prisma.setting.create({
      data: { key: "expense_limit", value: String(newMonthlyLimit) },
    });
  }
  console.log(`\nExpense limit setting updated to $${newMonthlyLimit}/month.`);

  // ── Step 9: Final summary ──────────────────────────────────
  console.log("\n=== Migration Complete ===");
  const finalGoals = await prisma.savingsGoal.findMany();
  console.log("\nFinal savings goal balances:");
  for (const goal of finalGoals) {
    console.log(`  ${goal.name}: $${Number(goal.savedAmount).toFixed(2)}`);
  }

  const activeCycle = await prisma.cycle.findFirst({ where: { status: "ACTIVE" } });
  if (activeCycle) {
    console.log(`\nActive cycle: ${activeCycle.startDate.toISOString().slice(0, 7)} (ID ${activeCycle.id})`);
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
