const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany();
  const goals = await prisma.savingsGoal.findMany();
  const transactions = await prisma.transaction.findMany();

  console.log("--- DATABASE BALANCES ---");
  const setupFund = wallets.find(w => w.name === "Setup Fund");
  const salaryAccount = wallets.find(w => w.name === "Salary Account");
  
  const setupFundBal = setupFund ? Number(setupFund.balance) : 0;
  const salaryAccountBal = salaryAccount ? Number(salaryAccount.balance) : 0;
  const totalWallets = setupFundBal + salaryAccountBal;
  
  const uniFees = Number(goals.find(g => g.name === "University Fees")?.savedAmount || 0);
  const emergency = Number(goals.find(g => g.name === "Emergency")?.savedAmount || 0);
  const flightHome = Number(goals.find(g => g.name === "Flight Home")?.savedAmount || 0);
  const totalGoals = uniFees + emergency + flightHome;

  console.log(`Setup Fund Balance: $${setupFundBal.toFixed(2)}`);
  console.log(`Salary Account Balance: $${salaryAccountBal.toFixed(2)}`);
  console.log(`Total in Wallets (Physical Assets): $${totalWallets.toFixed(2)}`);
  console.log(`Total in Savings Goals: $${totalGoals.toFixed(2)}`);

  console.log("\n--- CALCULATING COMBINATIONS ---");
  console.log(`1. Wallets + Goals: $${(totalWallets + totalGoals).toFixed(2)}`);
  console.log(`2. Setup Fund + Goals: $${(setupFundBal + totalGoals).toFixed(2)}`);
  console.log(`3. Setup Fund + Salary Account + Goals: $${(setupFundBal + salaryAccountBal + totalGoals).toFixed(2)}`);

  // Let's do a transaction flow analysis.
  // Starting Setup Fund balance is 7506.00.
  // Let's sum all incomes and subtract all expenses from transactions.
  let totalIncome = 0;
  let totalExpense = 0;
  for (const tx of transactions) {
    const amt = Number(tx.amount);
    if (tx.transactionType === "INCOME") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
    }
  }
  
  const startingBalance = 7506.00;
  const calculatedTotal = startingBalance + totalIncome - totalExpense;
  console.log(`\n--- TRANSACTION FLOW ANALYSIS ---`);
  console.log(`Starting Balance (Setup Fund opening): $${startingBalance.toFixed(2)}`);
  console.log(`Total Income from Transactions: $${totalIncome.toFixed(2)}`);
  console.log(`Total Expense from Transactions: $${totalExpense.toFixed(2)}`);
  console.log(`Calculated Net Money (Start + Income - Expense): $${calculatedTotal.toFixed(2)}`);
  
  // Wait! Is there an unallocated balance that wasn't rolled over?
  // Let's see: if we look at the difference:
  // Calculated total is 5088.64.
  // But wait, the database wallet balances show 5219.64.
  // What is the difference? 5219.64 - 5088.64 = 131.00.
  // Where does 131.00 come from?
  // Let's print the transaction counts by category and wallet.
  const setupFundTxs = transactions.filter(t => t.walletId === setupFund.id);
  const salaryAccountTxs = transactions.filter(t => t.walletId === salaryAccount.id);
  console.log(`\nSetup Fund transactions: ${setupFundTxs.length}`);
  console.log(`Salary Account transactions: ${salaryAccountTxs.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
