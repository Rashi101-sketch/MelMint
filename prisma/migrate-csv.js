/**
 * MelMint — CSV Data Migration Script (v2)
 *
 * Parses historical CSV data and imports it into the database
 * following the user's updated financial rules:
 *
 *   Phase 0: Initialize Setup Fund at $2,717.31
 *   Phase 1: Pre-salary expenses (before Apr 8) → Setup Fund, no cycles
 *   Phase 2: First salary edge case — Cycle 1 expense limit = sum of all INCOME in cycle
 *            Rent paid from Setup Fund. Dynamic rent (not hardcoded).
 *   Phase 3: Standard salary cycles with priority-based routing:
 *            1. Reserve expense limit
 *            2. Pay dynamic rent from remaining salary
 *            3. If shortfall → deduct from least-important goal (Flight Home, p3)
 *            4. End-of-cycle: saved → University Fees (p1), overspent → deduct from Flight Home (p3)
 *            5. Log all automated actions to cycle_notes
 *
 * Usage:  node prisma/migrate-csv.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["warn", "error"] });

// ── Constants ────────────────────────────────────────────────
const SETUP_FUND_OPENING = 7506.0;
const EXPENSE_LIMIT = 150.0;
const FIRST_SALARY_DATE = "2026-04-08";

// ── Category Mapping (CSV "Type" → app category) ────────────
const CATEGORY_MAP = {
  "Cab Charge": "Transport",
  "Vodaphone recharge": "Phone",
  "Coles": "Groceries",
  "Optus Sim": "Phone",
  "Mykey Card": "Transport",
  "Laptop": "Electronics",
  "Aldi": "Groceries",
  "Rent+Bond": "Rent",
  "Rent": "Rent",
  "Kmart": "Shopping",
  "Ind Grocery": "Groceries",
  "Rusu Membership": "Education",
  "RSA Course": "Education",
  "Rmit uni": "Education",
  "Apna Desi": "Groceries",
  "Ashwini Uncle": "Shopping",
  "Salary": "Salary",
  "Sarawan spices": "Groceries",
  "Ind Restaurant": "Dining",
  "Big W": "Shopping",
  "Wrong Payment": "Other",
  "Terry White Chemmart": "Healthcare",
  "Dockland": "Dining",
  "Mahima": "Shopping",
  "Woolsworth": "Groceries",
  "Party": "Entertainment",
};

// ── Payment Method Mapping (CSV "Bank" → dropdown value) ────
const PAYMENT_MAP = {
  "Cash": "Cash",
  "Online papa": "Custom",
  "Commbank": "Commbank",
  "Paid by Aunty": "Custom",
  "ING bank": "ING",
  "ING bank Savings": "ING",
};

// ── CSV Parser ───────────────────────────────────────────────
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    if (values.length >= 6) {
      rows.push({
        sno: parseInt(values[0], 10),
        date: values[1],
        type: values[2],
        bank: values[3],
        item: values[4],
        amount: parseFloat(values[5]),
      });
    }
  }

  return rows;
}

// ── Determine transaction type ───────────────────────────────
function getTransactionType(row) {
  if (row.type === "Salary") return "INCOME";
  if (row.type === "Wrong Payment") return "INCOME"; // refund
  return "EXPENSE";
}

// ── Build description with store name context ────────────────
function buildDescription(row) {
  const category = CATEGORY_MAP[row.type] || "Other";
  if (category !== row.type && row.type !== "Salary" && row.type !== "Rent") {
    return `${row.type}: ${row.item}`;
  }
  return row.item;
}

// ── Print final summary (reusable) ───────────────────────────
async function printFinalSummary() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  CURRENT DATABASE STATE");
  console.log("═══════════════════════════════════════════════════\n");

  const finalWallets = await prisma.wallet.findMany();
  console.log("   Wallets:");
  for (const w of finalWallets) {
    console.log(`      ${w.name}: $${Number(w.balance).toFixed(2)}`);
  }

  const finalGoals = await prisma.savingsGoal.findMany();
  console.log("\n   Savings Goals:");
  for (const g of finalGoals) {
    console.log(`      ${g.name} (p${g.priority}): $${Number(g.savedAmount).toFixed(2)} / $${Number(g.targetAmount).toFixed(2)} (${g.percentage}%)`);
  }

  const finalCycles = await prisma.cycle.findMany({ orderBy: { startDate: "asc" } });
  console.log("\n   Cycles:");
  for (const c of finalCycles) {
    const end = c.endDate ? c.endDate.toISOString().split("T")[0] : "ongoing";
    console.log(`      ${c.startDate.toISOString().split("T")[0]} – ${end}  |  salary=$${Number(c.salaryAmount).toFixed(2)}  limit=$${Number(c.expenseLimit).toFixed(2)}  [${c.status}]`);
  }

  const txCount = await prisma.transaction.count();
  console.log(`\n   Total transactions: ${txCount}\n`);
}

// ══════════════════════════════════════════════════════════════
// MAIN MIGRATION
// ══════════════════════════════════════════════════════════════
async function migrate() {
  const csvPath = path.join(__dirname, "data.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("❌ data.csv not found in prisma/ directory");
    process.exit(1);
  }

  const rows = parseCSV(csvPath);
  console.log(`📄 Parsed ${rows.length} rows from CSV\n`);

  // ── Step 0: Check for existing data (NEVER clear) ──────────
  const existingTxCount = await prisma.transaction.count();
  if (existingTxCount > 0) {
    console.log(`⚠️  Database already has ${existingTxCount} transactions.`);
    console.log("   Skipping CSV import to protect existing data.");
    console.log("   To force a fresh import, manually truncate the tables first.\n");
    
    // Still print final summary
    await printFinalSummary();
    return;
  }

  console.log("   Database is empty — proceeding with CSV import.\n");

  // ── Phase 0: Initialize wallets, goals, settings ───────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 0 — Wallet & Reference Data Init");
  console.log("═══════════════════════════════════════════════════\n");

  const setupFund = await prisma.wallet.upsert({
    where: { name: "Setup Fund" },
    update: {},
    create: {
      name: "Setup Fund",
      balance: SETUP_FUND_OPENING,
      description: "Pre-existing money ($1500 + $6006), acts as backup",
    },
  });

  const salaryAccount = await prisma.wallet.upsert({
    where: { name: "Salary Account" },
    update: {},
    create: {
      name: "Salary Account",
      balance: 0,
      description: "Active income and budget tracking",
    },
  });

  console.log(`   ✅ Setup Fund    → $${SETUP_FUND_OPENING.toFixed(2)} (ID: ${setupFund.id})`);
  console.log(`   ✅ Salary Account → $0.00 (ID: ${salaryAccount.id})`);

  // Savings goals with priority and user's current preferences:
  //   P1 = most important (University Fees — receives surplus savings)
  //   P2 = medium (Emergency)
  //   P3 = least important (Flight Home — receives deductions)
  const goalsData = [
    { name: "University Fees", targetAmount: 17500, percentage: 70, priority: 1 },
    { name: "Flight Home", targetAmount: 3000, percentage: 20, priority: 3 },
    { name: "Emergency", targetAmount: 1500, percentage: 10, priority: 2 },
  ];
  const goalsMap = {};

  for (const g of goalsData) {
    const goal = await prisma.savingsGoal.upsert({
      where: { name: g.name },
      update: {},
      create: { name: g.name, targetAmount: g.targetAmount, savedAmount: 0, percentage: g.percentage, priority: g.priority },
    });
    goalsMap[g.name] = goal;
    console.log(`   ✅ Goal: ${g.name} (${g.percentage}%, priority ${g.priority}) → target $${g.targetAmount}`);
  }

  // Settings — no fixed_rent; rent is dynamic
  const existingLimit = await prisma.setting.findUnique({ where: { key: "expense_limit" } });
  if (!existingLimit) {
    await prisma.setting.create({ data: { key: "expense_limit", value: String(EXPENSE_LIMIT) } });
  }
  console.log(`   ✅ Settings: expense_limit=$${EXPENSE_LIMIT}`);
  console.log(`   ℹ️  Rent is now dynamically fetched (no fixed_rent setting)\n`);

  // ── Separate rows into phases ──────────────────────────────
  const salaryRows = rows.filter((r) => r.type === "Salary");
  const firstSalaryDate = FIRST_SALARY_DATE;

  // Phase 1: everything before April 8 salary date (rows 1-28)
  const phase1Rows = rows.filter(
    (r) => r.date < firstSalaryDate && r.type !== "Salary"
  );

  // Rent on April 8 (row 29) — same day as salary, but per rules goes to Setup Fund
  const firstDayRent = rows.find(
    (r) => r.date === firstSalaryDate && r.type === "Rent"
  );

  // Remaining rows after first salary (row 30 onwards)
  const postFirstSalaryRows = rows.filter(
    (r) => r.sno >= 30 // from first salary onward
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 1 — Pre-Salary Transactions (Setup Fund)
  // ══════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 1 — Pre-Salary Expenses (→ Setup Fund)");
  console.log("═══════════════════════════════════════════════════\n");

  let setupFundBalance = SETUP_FUND_OPENING;
  let phase1Total = 0;

  for (const row of phase1Rows) {
    const category = CATEGORY_MAP[row.type] || "Other";
    const paymentMethod = PAYMENT_MAP[row.bank] || "Custom";
    const txType = getTransactionType(row);
    const desc = buildDescription(row);

    await prisma.transaction.create({
      data: {
        date: new Date(row.date),
        transactionType: txType,
        category,
        paymentMethod,
        description: desc,
        amount: row.amount,
        walletId: setupFund.id,
        cycleId: null, // no cycle in Phase 1
      },
    });

    setupFundBalance -= row.amount;
    phase1Total += row.amount;
    console.log(`   #${row.sno}  ${row.date}  ${category.padEnd(12)} -$${row.amount.toFixed(2).padStart(9)}  →  SF: $${setupFundBalance.toFixed(2)}`);
  }

  console.log(`\n   📊 Phase 1 total: $${phase1Total.toFixed(2)}`);
  console.log(`   📊 Setup Fund balance: $${setupFundBalance.toFixed(2)}\n`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2 — First Salary Edge Case (Cycle 1)
  // Cycle 1 Exception: Expense limit = sum of all INCOME in cycle
  // Rent paid from Setup Fund (salary < rent)
  // ══════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 2 — First Salary (Cycle 1 Exception)");
  console.log("═══════════════════════════════════════════════════\n");

  // Row 29: Rent on salary day → Setup Fund (salary < rent)
  if (firstDayRent) {
    await prisma.transaction.create({
      data: {
        date: new Date(firstDayRent.date),
        transactionType: "EXPENSE",
        category: "Rent",
        paymentMethod: PAYMENT_MAP[firstDayRent.bank] || "Commbank",
        description: firstDayRent.item,
        amount: firstDayRent.amount,
        walletId: setupFund.id,
        cycleId: null, // rent pre-cycle from Setup Fund
      },
    });

    setupFundBalance -= firstDayRent.amount;
    console.log(`   #${firstDayRent.sno}  Rent $${firstDayRent.amount.toFixed(2)} → Setup Fund (salary < rent)`);
    console.log(`   📊 Setup Fund balance: $${setupFundBalance.toFixed(2)}`);
  }

  // Update Setup Fund wallet balance in DB
  await prisma.wallet.update({
    where: { id: setupFund.id },
    data: { balance: setupFundBalance },
  });

  // First salary row
  const firstSalary = salaryRows[0]; // $146.59
  let salaryBalance = 0;

  // Identify Cycle 1 expense rows (between first and second salary)
  const secondSalaryIdx = postFirstSalaryRows.findIndex(
    (r) => r.type === "Salary" && r.sno > firstSalary.sno
  );
  const cycle1Expenses = postFirstSalaryRows.filter(
    (r) => r.sno > firstSalary.sno &&
           r.sno < (secondSalaryIdx >= 0 ? postFirstSalaryRows[secondSalaryIdx].sno : Infinity) &&
           r.type !== "Salary"
  );

  // Calculate total INCOME for Cycle 1 (salary + refunds)
  // This determines the Cycle 1 expense limit
  let cycle1Income = firstSalary.amount;
  for (const row of cycle1Expenses) {
    const txType = getTransactionType(row);
    if (txType === "INCOME") {
      cycle1Income += row.amount;
    }
  }

  const cycle1Limit = cycle1Income; // Expense limit = total income in cycle
  console.log(`\n   💡 Cycle 1 income total: $${cycle1Income.toFixed(2)} (salary $${firstSalary.amount.toFixed(2)} + refunds)`);
  console.log(`   💡 Cycle 1 expense limit set to: $${cycle1Limit.toFixed(2)}`);

  // Create Cycle 1
  const cycle1 = await prisma.cycle.create({
    data: {
      startDate: new Date(firstSalary.date),
      salaryAmount: firstSalary.amount,
      expenseLimit: cycle1Limit, // sum of all income in cycle
      rolloverAmount: 0,
      status: "ACTIVE",
    },
  });

  console.log(`   ✅ Cycle 1 created: ${firstSalary.date}, limit=$${cycle1Limit.toFixed(2)}`);
  console.log(`      (No savings — salary $${firstSalary.amount} < rent)\n`);

  // Insert the salary transaction → Salary Account
  await prisma.transaction.create({
    data: {
      date: new Date(firstSalary.date),
      transactionType: "INCOME",
      category: "Salary",
      paymentMethod: PAYMENT_MAP[firstSalary.bank] || "ING",
      description: firstSalary.item,
      amount: firstSalary.amount,
      walletId: salaryAccount.id,
      cycleId: cycle1.id,
    },
  });
  salaryBalance += firstSalary.amount;
  console.log(`   #${firstSalary.sno}  Salary +$${firstSalary.amount.toFixed(2)} → Salary Account`);

  // Process Cycle 1 expense transactions
  let cycle1TotalExpenses = 0;

  for (const row of cycle1Expenses) {
    const category = CATEGORY_MAP[row.type] || "Other";
    const paymentMethod = PAYMENT_MAP[row.bank] || "Custom";
    const txType = getTransactionType(row);
    const desc = buildDescription(row);

    await prisma.transaction.create({
      data: {
        date: new Date(row.date),
        transactionType: txType,
        category,
        paymentMethod,
        description: desc,
        amount: row.amount,
        walletId: salaryAccount.id,
        cycleId: cycle1.id,
      },
    });

    if (txType === "EXPENSE") {
      salaryBalance -= row.amount;
      cycle1TotalExpenses += row.amount;
      console.log(`   #${row.sno}  ${row.date}  ${category.padEnd(12)} -$${row.amount.toFixed(2).padStart(9)}  →  SA: $${salaryBalance.toFixed(2)}`);
    } else {
      // Refund (Wrong Payment)
      salaryBalance += row.amount;
      console.log(`   #${row.sno}  ${row.date}  ${category.padEnd(12)} +$${row.amount.toFixed(2).padStart(9)}  →  SA: $${salaryBalance.toFixed(2)}  (refund)`);
    }
  }

  console.log(`\n   📊 Cycle 1 expenses (EXPENSE-type only): $${cycle1TotalExpenses.toFixed(2)}`);
  console.log(`   📊 Cycle 1 income (expense limit): $${cycle1Limit.toFixed(2)}`);
  console.log(`   📊 Salary Account: $${salaryBalance.toFixed(2)}`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 3 — Standard Salary Cycles (Cycle 2+)
  // Priority-based routing + end-of-cycle smart adjustments
  // ══════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 3 — Standard Salary Cycles (Priority Routing)");
  console.log("═══════════════════════════════════════════════════");

  // Collect salary indices from postFirstSalaryRows
  const salaryIndices = [];
  for (let i = 0; i < postFirstSalaryRows.length; i++) {
    if (postFirstSalaryRows[i].type === "Salary" && postFirstSalaryRows[i].sno > firstSalary.sno) {
      salaryIndices.push(i);
    }
  }

  let prevCycleId = cycle1.id;
  let prevCycleLimit = cycle1Limit;
  let prevCycleExpenses = cycle1TotalExpenses;

  for (let si = 0; si < salaryIndices.length; si++) {
    const salaryIdx = salaryIndices[si];
    const salaryRow = postFirstSalaryRows[salaryIdx];
    const nextSalaryIdx = si + 1 < salaryIndices.length ? salaryIndices[si + 1] : postFirstSalaryRows.length;

    console.log(`\n   ─── Cycle ${si + 2} ─── Salary: $${salaryRow.amount.toFixed(2)} on ${salaryRow.date} ───`);

    // ── Close previous cycle with smart adjustments ──────────
    const remaining = prevCycleLimit - prevCycleExpenses;
    const cycleNotes = [];

    if (remaining > 0) {
      // SAVED: Transfer surplus to Most Important Goal (University Fees, p1)
      const mostImportantGoal = goalsMap["University Fees"];
      const newSaved = Number(mostImportantGoal.savedAmount) + remaining;
      await prisma.savingsGoal.update({
        where: { id: mostImportantGoal.id },
        data: { savedAmount: newSaved },
      });
      goalsMap["University Fees"].savedAmount = newSaved;
      cycleNotes.push(`Saved $${remaining.toFixed(2)}, added to University Fees`);
      console.log(`   ✨ Saved $${remaining.toFixed(2)} → University Fees (now $${newSaved.toFixed(2)})`);
    } else if (remaining < 0) {
      // OVERSPENT: Deduct from Least Important Goal (Flight Home, p3)
      const overspend = Math.abs(remaining);
      const leastImportantGoal = goalsMap["Flight Home"];
      const available = Number(leastImportantGoal.savedAmount);
      const deductAmount = Math.min(overspend, available);
      const newSaved = available - deductAmount;
      await prisma.savingsGoal.update({
        where: { id: leastImportantGoal.id },
        data: { savedAmount: Math.max(0, newSaved) },
      });
      goalsMap["Flight Home"].savedAmount = Math.max(0, newSaved);
      cycleNotes.push(`Overspent by $${overspend.toFixed(2)}, deducted from Flight Home`);
      console.log(`   ⚠️  Overspent $${overspend.toFixed(2)} → deducted from Flight Home (now $${Math.max(0, newSaved).toFixed(2)})`);
      if (deductAmount < overspend) {
        const unrecoverable = overspend - deductAmount;
        cycleNotes.push(`$${unrecoverable.toFixed(2)} unrecoverable (Flight Home insufficient)`);
        console.log(`   ❌ $${unrecoverable.toFixed(2)} unrecoverable`);
      }
    } else {
      cycleNotes.push("Broke even — no adjustment needed");
      console.log(`   ➡️  Broke even`);
    }

    // Close the previous cycle
    await prisma.cycle.update({
      where: { id: prevCycleId },
      data: {
        endDate: new Date(salaryRow.date),
        status: "CLOSED",
        rolloverAmount: Math.max(0, remaining),
        cycleNotes: cycleNotes.join(" | "),
      },
    });

    console.log(`   📦 Closed previous cycle: limit=$${prevCycleLimit.toFixed(2)}, spent=$${prevCycleExpenses.toFixed(2)}, notes="${cycleNotes.join(" | ")}"`);

    // ── Process new salary with priority routing ──────────────
    // Step 1: Reserve expense limit
    const afterLimit = salaryRow.amount - EXPENSE_LIMIT;
    console.log(`   💰 Salary $${salaryRow.amount.toFixed(2)} − Expense Limit $${EXPENSE_LIMIT.toFixed(2)} = $${afterLimit.toFixed(2)} remaining`);

    // Step 2: Get dynamic rent for this cycle (from CSV rows in this cycle)
    const cycleRows = postFirstSalaryRows.slice(salaryIdx + 1, nextSalaryIdx).filter(
      (r) => r.type !== "Salary"
    );
    const rentRows = cycleRows.filter((r) => (CATEGORY_MAP[r.type] || "Other") === "Rent");
    const dynamicRent = rentRows.reduce((sum, r) => sum + r.amount, 0);

    console.log(`   🏠 Dynamic rent: $${dynamicRent.toFixed(2)} (${rentRows.length} rent transaction(s))`);

    // Step 3: Pay rent from remaining salary
    const newCycleNotes = [];
    let rentShortfall = 0;

    if (afterLimit >= dynamicRent) {
      console.log(`   ✅ Rent covered: $${afterLimit.toFixed(2)} >= $${dynamicRent.toFixed(2)}`);
    } else if (afterLimit > 0) {
      rentShortfall = dynamicRent - afterLimit;
      // Deduct shortfall from Flight Home (least important, p3)
      const leastGoal = goalsMap["Flight Home"];
      const available = Number(leastGoal.savedAmount);
      const deduct = Math.min(rentShortfall, available);
      const newGoalSaved = available - deduct;
      await prisma.savingsGoal.update({
        where: { id: leastGoal.id },
        data: { savedAmount: Math.max(0, newGoalSaved) },
      });
      goalsMap["Flight Home"].savedAmount = Math.max(0, newGoalSaved);
      newCycleNotes.push(`Rent shortfall $${rentShortfall.toFixed(2)}, deducted from Flight Home`);
      console.log(`   ⚠️  Rent shortfall $${rentShortfall.toFixed(2)} → deducted from Flight Home (now $${Math.max(0, newGoalSaved).toFixed(2)})`);
    } else {
      // Entire salary went to expense limit, no salary left for rent
      rentShortfall = dynamicRent;
      const leastGoal = goalsMap["Flight Home"];
      const available = Number(leastGoal.savedAmount);
      const deduct = Math.min(rentShortfall, available);
      const newGoalSaved = available - deduct;
      await prisma.savingsGoal.update({
        where: { id: leastGoal.id },
        data: { savedAmount: Math.max(0, newGoalSaved) },
      });
      goalsMap["Flight Home"].savedAmount = Math.max(0, newGoalSaved);
      newCycleNotes.push(`Rent shortfall $${rentShortfall.toFixed(2)} (salary < limit), deducted from Flight Home`);
      console.log(`   ⚠️  Full rent shortfall $${rentShortfall.toFixed(2)} → deducted from Flight Home`);
    }

    // ── Create new cycle ──────────────────────────────────────
    const newCycle = await prisma.cycle.create({
      data: {
        startDate: new Date(salaryRow.date),
        salaryAmount: salaryRow.amount,
        expenseLimit: EXPENSE_LIMIT,
        rolloverAmount: Math.max(0, remaining),
        status: "ACTIVE",
        cycleNotes: newCycleNotes.length > 0 ? newCycleNotes.join(" | ") : null,
      },
    });
    prevCycleId = newCycle.id;
    prevCycleLimit = EXPENSE_LIMIT;

    // ── Salary transaction → Salary Account ───────────────────
    await prisma.transaction.create({
      data: {
        date: new Date(salaryRow.date),
        transactionType: "INCOME",
        category: "Salary",
        paymentMethod: PAYMENT_MAP[salaryRow.bank] || "ING",
        description: salaryRow.item,
        amount: salaryRow.amount,
        walletId: salaryAccount.id,
        cycleId: newCycle.id,
      },
    });
    salaryBalance += salaryRow.amount;
    console.log(`   #${salaryRow.sno}  Salary +$${salaryRow.amount.toFixed(2)} → Salary Account`);

    // ── Savings Distribution ──────────────────────────────────
    const availableSavings = Math.max(0, salaryRow.amount - dynamicRent - EXPENSE_LIMIT + rentShortfall);
    // Note: if there was a shortfall, we've already deducted from Flight Home,
    // so available savings is reduced by the amount actually covered by salary

    if (availableSavings > 0) {
      const distributions = [
        { name: "University Fees", pct: 70 },
        { name: "Flight Home", pct: 20 },
        { name: "Emergency", pct: 10 },
      ];

      console.log(`   💰 Available savings: $${salaryRow.amount.toFixed(2)} - $${dynamicRent.toFixed(2)} - $${EXPENSE_LIMIT.toFixed(2)} = $${availableSavings.toFixed(2)}`);

      for (const d of distributions) {
        const alloc = parseFloat(((d.pct / 100) * availableSavings).toFixed(2));
        const goal = goalsMap[d.name];
        const newSaved = Number(goal.savedAmount) + alloc;
        await prisma.savingsGoal.update({
          where: { id: goal.id },
          data: { savedAmount: newSaved },
        });
        goalsMap[d.name].savedAmount = newSaved;
        console.log(`      ${d.name} (${d.pct}%): +$${alloc.toFixed(2)} → total $${newSaved.toFixed(2)}`);
      }
    } else {
      console.log(`   ⚠️  No savings available (salary $${salaryRow.amount.toFixed(2)} ≤ rent+limit $${(dynamicRent + EXPENSE_LIMIT).toFixed(2)})`);
    }

    // ── Process cycle's expense transactions ──────────────────
    let cycleExpenses = 0;

    for (const row of cycleRows) {
      const category = CATEGORY_MAP[row.type] || "Other";
      const paymentMethod = PAYMENT_MAP[row.bank] || "Custom";
      const txType = getTransactionType(row);
      const desc = buildDescription(row);

      // Rent comes from Salary Account in standard cycles
      await prisma.transaction.create({
        data: {
          date: new Date(row.date),
          transactionType: txType,
          category,
          paymentMethod,
          description: desc,
          amount: row.amount,
          walletId: salaryAccount.id,
          cycleId: newCycle.id,
        },
      });

      if (txType === "EXPENSE") {
        salaryBalance -= row.amount;
        if (category !== "Rent") {
          cycleExpenses += row.amount; // only regular expenses for limit tracking
        }
        console.log(`   #${row.sno}  ${row.date}  ${category.padEnd(12)} -$${row.amount.toFixed(2).padStart(9)}  →  SA: $${salaryBalance.toFixed(2)}`);
      } else {
        salaryBalance += row.amount;
        console.log(`   #${row.sno}  ${row.date}  ${category.padEnd(12)} +$${row.amount.toFixed(2).padStart(9)}  →  SA: $${salaryBalance.toFixed(2)}  (refund)`);
      }
    }

    prevCycleExpenses = cycleExpenses;
    console.log(`   📊 Cycle ${si + 2} regular expenses (excl. rent): $${cycleExpenses.toFixed(2)}`);
  }

  // ── Final wallet balance updates ───────────────────────────
  await prisma.wallet.update({
    where: { id: salaryAccount.id },
    data: { balance: salaryBalance },
  });

  // ══════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════════
  await printFinalSummary();
  console.log("🎉 Migration complete!\n");
}

// ── Run ──────────────────────────────────────────────────────
migrate()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
