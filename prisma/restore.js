const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const backupPath = path.join(__dirname, "mysql_backup.json");
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Backup file not found at: ${backupPath}`);
    process.exit(1);
  }

  console.log("📖 Loading backup data...");
  const data = JSON.parse(fs.readFileSync(backupPath, "utf-8"));

  console.log("⚡ Connecting to PostgreSQL/Supabase and inserting records...");

  // 1. Wallets
  console.log("   🔌 Migrating Wallets...");
  for (const item of data.wallets) {
    await prisma.wallet.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        name: item.name,
        balance: item.balance,
        description: item.description,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt)
      }
    });
  }

  // 2. Savings Goals
  console.log("   🔌 Migrating Savings Goals...");
  for (const item of data.savingsGoals) {
    await prisma.savingsGoal.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        name: item.name,
        targetAmount: item.targetAmount,
        savedAmount: item.savedAmount,
        percentage: item.percentage,
        priority: item.priority,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt)
      }
    });
  }

  // 3. Settings
  console.log("   🔌 Migrating Settings...");
  for (const item of data.settings) {
    await prisma.setting.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        key: item.key,
        value: item.value
      }
    });
  }

  // 4. Cycles
  console.log("   🔌 Migrating Cycles...");
  for (const item of data.cycles) {
    await prisma.cycle.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        startDate: new Date(item.startDate),
        endDate: item.endDate ? new Date(item.endDate) : null,
        salaryAmount: item.salaryAmount,
        expenseLimit: item.expenseLimit,
        rolloverAmount: item.rolloverAmount,
        status: item.status,
        cycleNotes: item.cycleNotes,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt)
      }
    });
  }

  // 5. Transactions
  console.log("   🔌 Migrating Transactions...");
  for (const item of data.transactions) {
    await prisma.transaction.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        date: new Date(item.date),
        transactionType: item.transactionType,
        category: item.category,
        paymentMethod: item.paymentMethod,
        description: item.description,
        amount: item.amount,
        walletId: item.walletId,
        cycleId: item.cycleId,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt)
      }
    });
  }

  // 6. Savings Contributions
  console.log("   🔌 Migrating Savings Contributions...");
  for (const item of data.savingsContributions) {
    await prisma.savingsContribution.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        amount: item.amount,
        source: item.source,
        cycleId: item.cycleId,
        goalId: item.goalId,
        createdAt: new Date(item.createdAt)
      }
    });
  }

  console.log("🔄 Resetting auto-increment sequences in PostgreSQL...");
  const tables = [
    { name: "wallets", seq: "wallets_id_seq" },
    { name: "savings_goals", seq: "savings_goals_id_seq" },
    { name: "settings", seq: "settings_id_seq" },
    { name: "cycles", seq: "cycles_id_seq" },
    { name: "transactions", seq: "transactions_id_seq" },
    { name: "savings_contributions", seq: "savings_contributions_id_seq" }
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table.name}"', 'id'), coalesce(max(id), 1), max(id) IS NOT NULL) FROM "${table.name}";`
      );
      console.log(`   ✅ Sequence reset for table: ${table.name}`);
    } catch (err) {
      console.warn(`   ⚠️  Could not reset sequence for ${table.name} (using manual setval fallback):`, err.message);
      try {
        await prisma.$executeRawUnsafe(
          `SELECT setval('${table.seq}', COALESCE((SELECT MAX(id)+1 FROM "${table.name}"), 1), false);`
        );
        console.log(`   ✅ Manual sequence fallback reset for table: ${table.name}`);
      } catch (errFallback) {
        console.error(`   ❌ Failed sequence reset for ${table.name}:`, errFallback.message);
      }
    }
  }

  console.log("\n🎉 Data restore/migration to Supabase complete!");
}

main()
  .catch((e) => {
    console.error("❌ Data restore failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
