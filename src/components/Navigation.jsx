import { NavLink } from "react-router-dom";
import { HiViewGrid, HiTable, HiClock } from "react-icons/hi";

export default function Navigation() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
      isActive
        ? "bg-mint-600/20 text-mint-400 shadow-sm"
        : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/40"
    }`;

  return (
    <header className="border-b border-surface-800/50 bg-surface-950/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mint-500 to-mint-700 flex items-center justify-center shadow-lg shadow-mint-500/20 animate-float">
            <span className="text-lg">🌿</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-surface-50 tracking-tight">
              Mel<span className="text-mint-400">Mint</span>
            </h1>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <NavLink to="/" className={linkClass} end>
            <HiViewGrid className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/transactions" className={linkClass}>
            <HiTable className="w-4 h-4" />
            Transactions
          </NavLink>
          <NavLink to="/history" className={linkClass}>
            <HiClock className="w-4 h-4" />
            History
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
