import { HiCreditCard } from "react-icons/hi";

const WALLET_STYLES = {
  "Setup Fund": {
    icon: "🏦",
    gradient: "from-indigo-500/15 to-purple-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-400",
    glow: "hover:shadow-indigo-500/10",
  },
  "Salary Account": {
    icon: "💳",
    gradient: "from-mint-500/15 to-emerald-500/10",
    border: "border-mint-500/20",
    text: "text-mint-400",
    glow: "hover:shadow-mint-500/10",
  },
};

export default function WalletCards({ wallets, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 bg-surface-700/20 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {wallets.map((wallet) => {
        const style = WALLET_STYLES[wallet.name] || {
          icon: "💰",
          gradient: "from-surface-500/15 to-surface-600/10",
          border: "border-surface-500/20",
          text: "text-surface-300",
          glow: "",
        };

        const isSetupFund = wallet.name === "Setup Fund";

        return (
          <div
            key={wallet.id}
            className={`glass-card p-5 bg-gradient-to-br ${style.gradient} border ${style.border} hover:shadow-xl ${style.glow} transition-all animate-fade-in-up`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{style.icon}</span>
                <div>
                  <h3 className={`text-sm font-bold ${style.text}`}>{wallet.name}</h3>
                  <p className="text-[10px] text-surface-500 mt-0.5">{wallet.description}</p>
                </div>
              </div>
              <HiCreditCard className={`w-5 h-5 ${style.text} opacity-30`} />
            </div>
            <div className="mt-3">
              <p className={`text-2xl font-bold text-surface-100`}>
                ${wallet.balance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </p>
              {/* Show breakdown for transparency */}
              {wallet.openingBalance !== undefined && (
                <p className="text-[9px] text-surface-600 mt-1">
                  {isSetupFund
                    ? `Opening: $${wallet.openingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })} • Spent: $${wallet.totalExpense.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                    : `Income: $${wallet.totalIncome.toLocaleString("en-AU", { minimumFractionDigits: 2 })} • Spent: $${wallet.totalExpense.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
