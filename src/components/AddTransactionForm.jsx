import { useState } from "react";
import { HiPlus } from "react-icons/hi";
import toast from "react-hot-toast";
import { createTransaction } from "../services/api";

const CATEGORIES = [
  "Salary", "Rent", "Groceries", "Transport", "Phone", "Education",
  "Shopping", "Dining", "Healthcare", "Electronics", "Entertainment",
  "Subscriptions", "Utilities", "Other",
];

const PAYMENT_METHODS = ["Commbank", "ING", "Cash", "Custom"];

// Format local datetime for datetime-local input (YYYY-MM-DDTHH:MM)
const getLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const initialForm = {
  date: getLocalDateTime(),
  transactionType: "EXPENSE",
  category: "",
  paymentMethod: "",
  description: "",
  amount: "",
  walletId: "",
};

export default function AddTransactionForm({ wallets, onSuccess, onSalaryAdded }) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category || !form.paymentMethod || !form.description || !form.amount || !form.walletId) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const response = await createTransaction({
        ...form,
        amount: parseFloat(form.amount),
        walletId: parseInt(form.walletId, 10),
      });

      toast.success(
        `${form.transactionType === "INCOME" ? "Income" : "Expense"} added!`
      );

      // If this was a salary, trigger the allocation modal
      if (response.cycleCreated && response.availableSavings > 0) {
        onSalaryAdded?.(response);
      }

      setForm(initialForm);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.message ||
        "Failed to add transaction"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card p-6 animate-fade-in-up-d3">
      <h2 className="text-lg font-semibold text-surface-100 mb-5 flex items-center gap-2">
        <HiPlus className="w-5 h-5 text-mint-400" />
        Add Transaction
      </h2>

      <form id="add-transaction-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Type Toggle */}
        <div className="flex gap-2 p-1 bg-surface-900/50 rounded-xl">
          {["EXPENSE", "INCOME"].map((type) => (
            <button
              key={type}
              type="button"
              id={`type-${type.toLowerCase()}`}
              onClick={() => setForm((f) => ({ ...f, transactionType: type }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                form.transactionType === type
                  ? type === "INCOME"
                    ? "bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10"
                    : "bg-red-500/20 text-red-400 shadow-lg shadow-red-500/10"
                  : "text-surface-500 hover:text-surface-300"
              }`}
            >
              {type === "INCOME" ? "💰 Income" : "💸 Expense"}
            </button>
          ))}
        </div>

        {/* Date + Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="date-input" className="block text-xs font-medium text-surface-400 mb-1.5">Date & Time</label>
            <input type="datetime-local" id="date-input" name="date" value={form.date} onChange={handleChange} className="input-field" required />
          </div>
          <div>
            <label htmlFor="amount-input" className="block text-xs font-medium text-surface-400 mb-1.5">Amount ($)</label>
            <input type="number" id="amount-input" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" min="0.01" step="0.01" className="input-field" required />
          </div>
        </div>

        {/* Category + Payment Method */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="category-select" className="block text-xs font-medium text-surface-400 mb-1.5">Category</label>
            <select id="category-select" name="category" value={form.category} onChange={handleChange} className="input-field" required>
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="payment-select" className="block text-xs font-medium text-surface-400 mb-1.5">Payment Method</label>
            <select id="payment-select" name="paymentMethod" value={form.paymentMethod} onChange={handleChange} className="input-field" required>
              <option value="">Select method</option>
              {PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
        </div>

        {/* Wallet */}
        <div>
          <label htmlFor="wallet-select" className="block text-xs font-medium text-surface-400 mb-1.5">Wallet</label>
          <select id="wallet-select" name="walletId" value={form.walletId} onChange={handleChange} className="input-field" required>
            <option value="">Select wallet</option>
            {wallets?.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="desc-input" className="block text-xs font-medium text-surface-400 mb-1.5">Description</label>
          <input type="text" id="desc-input" name="description" value={form.description} onChange={handleChange} placeholder="e.g., Coles weekly shop" className="input-field" required />
        </div>

        {/* Submit */}
        <button type="submit" id="submit-transaction" disabled={submitting} className="btn-primary w-full py-3">
          {submitting ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Adding...
            </>
          ) : (
            <><HiPlus className="w-4 h-4" /> Add {form.transactionType === "INCOME" ? "Income" : "Expense"}</>
          )}
        </button>
      </form>
    </div>
  );
}
