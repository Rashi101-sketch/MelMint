import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Navigation from "./components/Navigation";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid rgba(20,184,166,0.15)",
            borderRadius: "0.75rem",
            fontSize: "0.875rem",
          },
          success: { iconTheme: { primary: "#14b8a6", secondary: "#1e293b" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#1e293b" } },
        }}
      />

      <div className="min-h-screen">
        <Navigation />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>

        <footer className="border-t border-surface-800/50 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-surface-600">
            <span className="text-mint-600">Mel</span><span className="text-surface-500">Mint</span> — Personal Finance Tracker
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
