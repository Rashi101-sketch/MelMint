import { useState, useEffect, useCallback } from "react";
import TransactionTable from "../components/TransactionTable";
import { getTransactions, getWallets } from "../services/api";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [wallets, setWallets] = useState([]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTransactions({ page, limit: 20, sortBy, sortOrder });
      setTransactions(res.data || []);
      setPagination(res.pagination || null);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder]);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await getWallets();
      setWallets(res.data || []);
    } catch (err) {
      console.error("Failed to fetch wallets:", err);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold text-surface-50 mb-1">All Transactions</h2>
        <p className="text-sm text-surface-500">
          Click any cell to edit inline. Click + Add to create new entries. Changes save automatically.
        </p>
      </div>

      <TransactionTable
        transactions={transactions}
        pagination={pagination}
        loading={loading}
        onPageChange={(p) => setPage(p)}
        onSortChange={(field, order) => { setSortBy(field); setSortOrder(order); setPage(1); }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onRefresh={() => { setPage(1); fetchTransactions(); }}
        wallets={wallets}
      />
    </div>
  );
}
