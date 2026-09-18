import { useState, useRef, useEffect } from "react";
import { HiTrash, HiChevronUp, HiChevronDown, HiChevronLeft, HiChevronRight, HiPlus, HiSearch, HiCheck, HiX } from "react-icons/hi";
import toast from "react-hot-toast";
import { updateTransaction, deleteTransaction, createTransaction } from "../services/api";

const DEFAULT_CATEGORIES = [
  "Salary", "Rent", "Groceries", "Transport", "Phone", "Education",
  "Shopping", "Dining", "Healthcare", "Electronics", "Entertainment",
  "Subscriptions", "Utilities", "Other",
];

const DEFAULT_PAYMENT_METHODS = ["Commbank", "ING", "Cash"];

const CUSTOM_VALUE = "__CUSTOM__";

const EMPTY_ROW = {
  date: new Date().toISOString().split("T")[0],
  transactionType: "EXPENSE",
  category: "",
  paymentMethod: "",
  description: "",
  amount: "",
};

/**
 * Inline-editable transaction data grid with add row, filters, and search.
 * CommBank-style fully user-editable table.
 */
export default function TransactionTable({
  transactions, pagination, loading,
  onPageChange, onSortChange, sortBy, sortOrder, onRefresh,
}) {
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState({ ...EMPTY_ROW });
  const [addingRow, setAddingRow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [customInputMode, setCustomInputMode] = useState(null); // 'category' | 'paymentMethod' | 'edit-category' | 'edit-paymentMethod'
  const inputRef = useRef(null);
  const customRef = useRef(null);

  // Build dynamic category/payment lists from existing transactions + defaults
  const allCategories = [...new Set([
    ...DEFAULT_CATEGORIES,
    ...transactions.map((tx) => tx.category).filter(Boolean),
  ])];
  const allPaymentMethods = [...new Set([
    ...DEFAULT_PAYMENT_METHODS,
    ...transactions.map((tx) => tx.paymentMethod).filter(Boolean),
  ])];

  useEffect(() => {
    if (customInputMode && customRef.current) {
      customRef.current.focus();
    }
  }, [customInputMode]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editingCell]);

  // ── Inline Edit ─────────────────────────────────────────────
  const startEdit = (tx, field) => {
    let value;
    switch (field) {
      case "date":
        value = new Date(tx.date).toISOString().split("T")[0];
        break;
      case "amount":
        value = String(Number(tx.amount));
        break;
      default:
        value = tx[field] || "";
    }
    setEditingCell({ id: tx.id, field });
    setEditValue(value);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;

    let payload = {};
    if (field === "amount") {
      const num = parseFloat(editValue);
      if (isNaN(num) || num <= 0) {
        toast.error("Invalid amount");
        cancelEdit();
        return;
      }
      payload.amount = num;
    } else if (field === "date") {
      if (!editValue || isNaN(Date.parse(editValue))) {
        toast.error("Invalid date");
        cancelEdit();
        return;
      }
      payload.date = editValue;
    } else {
      if (!editValue.trim()) {
        toast.error(`${field} cannot be empty`);
        cancelEdit();
        return;
      }
      payload[field] = editValue.trim();
    }

    setSavingId(id);
    try {
      await updateTransaction(id, payload);
      toast.success("Updated", { duration: 1500 });
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    } finally {
      setSavingId(null);
      cancelEdit();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    setDeletingId(id);
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      onSortChange(field, sortOrder === "asc" ? "desc" : "asc");
    } else {
      onSortChange(field, "desc");
    }
  };

  // ── Add Row ─────────────────────────────────────────────────
  const handleAddRow = async () => {
    if (!newRow.category || !newRow.paymentMethod || !newRow.description || !newRow.amount) {
      toast.error("Please fill in all fields");
      return;
    }

    setAddingRow(true);
    try {
      await createTransaction({
        ...newRow,
        amount: parseFloat(newRow.amount),
      });
      toast.success(`${newRow.transactionType === "INCOME" ? "Income" : "Expense"} added!`);
      setNewRow({ ...EMPTY_ROW });
      setShowAddRow(false);
      onRefresh?.();
    } catch (err) {
      toast.error(
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.message ||
        "Failed to add"
      );
    } finally {
      setAddingRow(false);
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === "Enter") handleAddRow();
    if (e.key === "Escape") {
      setShowAddRow(false);
      setNewRow({ ...EMPTY_ROW });
    }
  };

  // ── Helpers ─────────────────────────────────────────────────
  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <HiChevronUp className="w-3 h-3 opacity-30" />;
    return sortOrder === "asc" ? (
      <HiChevronUp className="w-3.5 h-3.5 text-mint-400" />
    ) : (
      <HiChevronDown className="w-3.5 h-3.5 text-mint-400" />
    );
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

  const formatAmount = (amount, type) => {
    const prefix = type === "INCOME" ? "+" : "-";
    return `${prefix}$${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
  };

  const isEditing = (txId, field) => editingCell?.id === txId && editingCell?.field === field;

  // Filter transactions locally
  const filteredTransactions = transactions.filter((tx) => {
    if (searchTerm && !tx.description?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterType && tx.transactionType !== filterType) return false;
    if (filterCategory && tx.category !== filterCategory) return false;
    return true;
  });

  const renderEditableCell = (tx, field, displayContent, inputType = "text") => {
    if (isEditing(tx.id, field)) {
      if (field === "category") {
        if (customInputMode === "edit-category") {
          return (
            <input
              ref={customRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => { setCustomInputMode(null); saveEdit(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setCustomInputMode(null); saveEdit(); }
                if (e.key === "Escape") { setCustomInputMode(null); cancelEdit(); }
              }}
              placeholder="Type custom category..."
              className="inline-input"
            />
          );
        }
        return (
          <select
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM_VALUE) {
                setEditValue("");
                setCustomInputMode("edit-category");
              } else {
                setEditValue(e.target.value);
              }
            }}
            onBlur={saveEdit}
            className="inline-input"
          >
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={CUSTOM_VALUE}>✚ Add new...</option>
          </select>
        );
      }
      if (field === "paymentMethod") {
        if (customInputMode === "edit-paymentMethod") {
          return (
            <input
              ref={customRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => { setCustomInputMode(null); saveEdit(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setCustomInputMode(null); saveEdit(); }
                if (e.key === "Escape") { setCustomInputMode(null); cancelEdit(); }
              }}
              placeholder="Type custom method..."
              className="inline-input"
            />
          );
        }
        return (
          <select
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM_VALUE) {
                setEditValue("");
                setCustomInputMode("edit-paymentMethod");
              } else {
                setEditValue(e.target.value);
              }
            }}
            onBlur={saveEdit}
            className="inline-input"
          >
            {allPaymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value={CUSTOM_VALUE}>✚ Add new...</option>
          </select>
        );
      }
      if (field === "transactionType") {
        return (
          <select
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            className="inline-input"
          >
            <option value="INCOME">INCOME</option>
            <option value="EXPENSE">EXPENSE</option>
          </select>
        );
      }
      return (
        <input
          ref={inputRef}
          type={inputType}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="inline-input"
          step={field === "amount" ? "0.01" : undefined}
        />
      );
    }

    return (
      <span
        className="editable-cell"
        onClick={() => startEdit(tx, field)}
        title="Click to edit"
      >
        {displayContent}
      </span>
    );
  };

  return (
    <div className="glass-card overflow-hidden animate-fade-in-up-d4">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-700/50 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-100">Transactions</h2>
        <div className="flex items-center gap-3">
          {savingId && (
            <span className="text-[10px] text-mint-400 animate-pulse font-semibold">Saving...</span>
          )}
          {pagination && (
            <span className="text-xs text-surface-500">
              {pagination.total} record{pagination.total !== 1 ? "s" : ""}
            </span>
          )}
          <button
            id="add-transaction-row"
            onClick={() => setShowAddRow(!showAddRow)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              showAddRow
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-mint-600/20 text-mint-400 border border-mint-500/20 hover:bg-mint-600/30"
            }`}
          >
            {showAddRow ? (
              <><HiX className="w-3 h-3" /> Cancel</>
            ) : (
              <><HiPlus className="w-3 h-3" /> Add</>
            )}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="flex items-center gap-1.5">
          <HiSearch className="w-3.5 h-3.5 text-surface-500" />
          <input
            id="search-transactions"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search description..."
            className="filter-input"
          />
        </div>
        <select
          id="filter-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>
        <select
          id="filter-category"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(searchTerm || filterType || filterCategory) && (
          <button
            onClick={() => { setSearchTerm(""); setFilterType(""); setFilterCategory(""); }}
            className="text-[10px] text-mint-400 hover:text-mint-300 font-semibold cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table id="transactions-table" className="w-full">
          <thead>
            <tr className="border-b border-surface-700/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider w-10">#</th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider cursor-pointer hover:text-surface-200 transition-colors"
                onClick={() => handleSort("date")}
              >
                <span className="flex items-center gap-1">Date <SortIcon field="date" /></span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Payment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Description</th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-surface-400 uppercase tracking-wider cursor-pointer hover:text-surface-200 transition-colors"
                onClick={() => handleSort("amount")}
              >
                <span className="flex items-center justify-end gap-1">Amount <SortIcon field="amount" /></span>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {/* Add Row */}
            {showAddRow && (
              <tr className="add-row">
                <td className="px-4 py-2.5 text-sm text-mint-400 font-mono">+</td>
                <td className="px-4 py-2.5">
                  <input
                    type="date"
                    value={newRow.date}
                    onChange={(e) => setNewRow((r) => ({ ...r, date: e.target.value }))}
                    onKeyDown={handleAddKeyDown}
                    className="add-row-input"
                    id="new-row-date"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={newRow.transactionType}
                    onChange={(e) => setNewRow((r) => ({ ...r, transactionType: e.target.value }))}
                    className="add-row-select"
                    id="new-row-type"
                  >
                    <option value="EXPENSE">EXPENSE</option>
                    <option value="INCOME">INCOME</option>
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  {customInputMode === "category" ? (
                    <input
                      ref={customRef}
                      type="text"
                      value={newRow.category}
                      onChange={(e) => setNewRow((r) => ({ ...r, category: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setCustomInputMode(null); setNewRow((r) => ({ ...r, category: "" })); }
                        if (e.key === "Enter") handleAddRow();
                      }}
                      onBlur={() => { if (!newRow.category) setCustomInputMode(null); }}
                      placeholder="Type custom category..."
                      className="add-row-input"
                      id="new-row-category-custom"
                    />
                  ) : (
                    <select
                      value={newRow.category}
                      onChange={(e) => {
                        if (e.target.value === CUSTOM_VALUE) {
                          setNewRow((r) => ({ ...r, category: "" }));
                          setCustomInputMode("category");
                        } else {
                          setNewRow((r) => ({ ...r, category: e.target.value }));
                        }
                      }}
                      className="add-row-select"
                      id="new-row-category"
                    >
                      <option value="">Select...</option>
                      {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value={CUSTOM_VALUE}>✚ Add new...</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {customInputMode === "paymentMethod" ? (
                    <input
                      ref={customRef}
                      type="text"
                      value={newRow.paymentMethod}
                      onChange={(e) => setNewRow((r) => ({ ...r, paymentMethod: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setCustomInputMode(null); setNewRow((r) => ({ ...r, paymentMethod: "" })); }
                        if (e.key === "Enter") handleAddRow();
                      }}
                      onBlur={() => { if (!newRow.paymentMethod) setCustomInputMode(null); }}
                      placeholder="Type custom method..."
                      className="add-row-input"
                      id="new-row-payment-custom"
                    />
                  ) : (
                    <select
                      value={newRow.paymentMethod}
                      onChange={(e) => {
                        if (e.target.value === CUSTOM_VALUE) {
                          setNewRow((r) => ({ ...r, paymentMethod: "" }));
                          setCustomInputMode("paymentMethod");
                        } else {
                          setNewRow((r) => ({ ...r, paymentMethod: e.target.value }));
                        }
                      }}
                      className="add-row-select"
                      id="new-row-payment"
                    >
                      <option value="">Select...</option>
                      {allPaymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value={CUSTOM_VALUE}>✚ Add new...</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={newRow.description}
                    onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value }))}
                    onKeyDown={handleAddKeyDown}
                    placeholder="Description..."
                    className="add-row-input"
                    id="new-row-description"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    value={newRow.amount}
                    onChange={(e) => setNewRow((r) => ({ ...r, amount: e.target.value }))}
                    onKeyDown={handleAddKeyDown}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    className="add-row-input text-right"
                    id="new-row-amount"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    id="save-new-row"
                    onClick={handleAddRow}
                    disabled={addingRow}
                    className="p-1.5 rounded-lg bg-mint-600/20 text-mint-400 hover:bg-mint-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {addingRow ? (
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <HiCheck className="w-3.5 h-3.5" />
                    )}
                  </button>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 bg-surface-700/50 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-surface-500">
                  <p className="text-lg mb-1">No transactions found</p>
                  <p className="text-sm">
                    {searchTerm || filterType || filterCategory
                      ? "Try adjusting your filters"
                      : "Click + Add to create your first transaction!"}
                  </p>
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx, idx) => (
                <tr key={tx.id} className="hover:bg-surface-800/30 transition-colors group">
                  <td className="px-4 py-3.5 text-sm text-surface-500 font-mono">
                    {((pagination?.page || 1) - 1) * (pagination?.limit || 20) + idx + 1}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-200 whitespace-nowrap">
                    {renderEditableCell(tx, "date", formatDate(tx.date), "date")}
                  </td>
                  <td className="px-4 py-3.5">
                    {renderEditableCell(
                      tx,
                      "transactionType",
                      <span className={`badge ${tx.transactionType === "INCOME" ? "badge-income" : "badge-expense"}`}>
                        {tx.transactionType}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-300">
                    {renderEditableCell(tx, "category", tx.category)}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-400">
                    {renderEditableCell(tx, "paymentMethod", tx.paymentMethod)}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-300 max-w-[200px] truncate">
                    {renderEditableCell(tx, "description", tx.description)}
                  </td>
                  <td className={`px-4 py-3.5 text-sm font-semibold text-right whitespace-nowrap ${
                    tx.transactionType === "INCOME" ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {renderEditableCell(tx, "amount", formatAmount(tx.amount, tx.transactionType), "number")}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      id={`delete-tx-${tx.id}`}
                      onClick={() => handleDelete(tx.id)}
                      disabled={deletingId === tx.id}
                      className="btn-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {deletingId === tx.id ? (
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <HiTrash className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t border-surface-700/50 flex items-center justify-between">
          <p className="text-xs text-surface-500">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              id="prev-page"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg bg-surface-800/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <HiChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="next-page"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-lg bg-surface-800/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
