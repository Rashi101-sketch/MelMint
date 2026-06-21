const prisma = require("../api/lib/prisma");
const { syncCycle } = require("../api/lib/cycleSync");

async function main() {
  console.log("⚙️  Running historical cycle correction...");
  
  // Get all cycles ordered by startDate asc (so changes propagate chronologically if needed)
  const cycles = await prisma.cycle.findMany({
    orderBy: { startDate: "asc" }
  });

  console.log(`Found ${cycles.length} cycles to sync.`);

  for (const cycle of cycles) {
    console.log(`\n🔄 Syncing Cycle ID ${cycle.id} (${cycle.startDate.toISOString().split("T")[0]} to ${cycle.endDate ? cycle.endDate.toISOString().split("T")[0] : "ongoing"})...`);
    await syncCycle(cycle.id);
  }

  console.log("\n✅ Historical correction complete!");
}

main()
  .catch((e) => {
    console.error("❌ Correction failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
