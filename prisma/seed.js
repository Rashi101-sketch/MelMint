const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding MelMint database...\n");

  // ── Wallets ──────────────────────────────────────────────────
  const setupFund = await prisma.wallet.upsert({
    where: { name: "Setup Fund" },
    update: {},
    create: {
      name: "Setup Fund",
      balance: 2717.31,
      description: "Pre-existing money, acts as a backup fund",
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

  console.log("✅ Wallets created:");
  console.log(`   - ${setupFund.name}: $2,717.31 (ID: ${setupFund.id})`);
  console.log(`   - ${salaryAccount.name}: $0.00 (ID: ${salaryAccount.id})`);

  // ── Savings Goals ────────────────────────────────────────────
  // Priority: 1 = most important (receives surplus savings)
  //           3 = least important (receives deductions for shortfall/overspend)
  const goals = [
    { name: "University Fees", targetAmount: 5000, percentage: 50, priority: 1 },
    { name: "Flight Home", targetAmount: 2000, percentage: 30, priority: 3 },
    { name: "Emergency", targetAmount: 1000, percentage: 20, priority: 2 },
  ];

  for (const goal of goals) {
    await prisma.savingsGoal.upsert({
      where: { name: goal.name },
      update: { percentage: goal.percentage, priority: goal.priority },
      create: {
        name: goal.name,
        targetAmount: goal.targetAmount,
        savedAmount: 0,
        percentage: goal.percentage,
        priority: goal.priority,
      },
    });
  }

  console.log("\n✅ Savings Goals created:");
  goals.forEach((g) => console.log(`   - ${g.name} (${g.percentage}%, priority ${g.priority})`));

  // ── Settings ─────────────────────────────────────────────────
  // Note: fixed_rent is removed — rent is now dynamically fetched
  //       from transactions where category = 'Rent'
  const settings = [
    { key: "expense_limit", value: "150" },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  // Clean up old fixed_rent setting if it exists
  await prisma.setting.deleteMany({ where: { key: "fixed_rent" } });

  console.log("\n✅ Settings created:");
  settings.forEach((s) => console.log(`   - ${s.key} = ${s.value}`));
  console.log("   - fixed_rent removed (rent is now dynamic)");

  console.log("\n🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
