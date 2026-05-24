const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Backing up local MySQL data...");
  
  const wallets = await prisma.wallet.findMany();
  const transactions = await prisma.transaction.findMany();
  const savingsGoals = await prisma.savingsGoal.findMany();
  const cycles = await prisma.cycle.findMany();
  const settings = await prisma.setting.findMany();
  const savingsContributions = await prisma.savingsContribution.findMany();

  const backup = {
    wallets,
    transactions,
    savingsGoals,
    cycles,
    settings,
    savingsContributions
  };

  const backupPath = path.join(__dirname, "mysql_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  
  console.log(`\n✅ Backup successfully saved to: ${backupPath}`);
  console.log("📊 Summary of backed-up records:");
  console.log(`   - Wallets: ${wallets.length}`);
  console.log(`   - Transactions: ${transactions.length}`);
  console.log(`   - Savings Goals: ${savingsGoals.length}`);
  console.log(`   - Cycles: ${cycles.length}`);
  console.log(`   - Settings: ${settings.length}`);
  console.log(`   - Savings Contributions: ${savingsContributions.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Backup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
