const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

// ── Opening balances (known constants) ─────────────────────
const OPENING_BALANCES = {
  "Setup Fund": 7506.0,
  "Salary Account": 0,
};

// ─────────────────────────────────────────────────────────────
// GET /api/wallets — List all wallets with COMPUTED balances
// Balance = openingBalance + SUM(INCOME) - SUM(EXPENSE)
// This is the single source of truth — never drifts.
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const wallets = await prisma.wallet.findMany({
      orderBy: { id: "asc" },
    });

    const walletsWithComputedBalance = await Promise.all(
      wallets.map(async (wallet) => {
        const openingBalance = OPENING_BALANCES[wallet.name] ?? Number(wallet.balance);

        const [incomeAgg, expenseAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: { walletId: wallet.id, transactionType: "INCOME" },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { walletId: wallet.id, transactionType: "EXPENSE" },
            _sum: { amount: true },
          }),
        ]);

        const totalIncome = Number(incomeAgg._sum.amount || 0);
        const totalExpense = Number(expenseAgg._sum.amount || 0);
        const computedBalance = openingBalance + totalIncome - totalExpense;

        return {
          ...wallet,
          balance: computedBalance,
          openingBalance,
          totalIncome,
          totalExpense,
        };
      })
    );

    res.json({ success: true, data: walletsWithComputedBalance });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/wallets/:id — Get a specific wallet (computed)
// ─────────────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid wallet ID" });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ success: false, message: `Wallet ${id} not found` });
    }

    const openingBalance = OPENING_BALANCES[wallet.name] ?? Number(wallet.balance);

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { walletId: wallet.id, transactionType: "INCOME" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { walletId: wallet.id, transactionType: "EXPENSE" },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount || 0);
    const totalExpense = Number(expenseAgg._sum.amount || 0);
    const computedBalance = openingBalance + totalIncome - totalExpense;

    res.json({
      success: true,
      data: { ...wallet, balance: computedBalance, openingBalance, totalIncome, totalExpense },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
