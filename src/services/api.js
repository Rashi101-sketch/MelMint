import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// ── Transactions ────────────────────────────────────────────
export async function getTransactions(params = {}) {
  const res = await api.get("/transactions", { params });
  return res.data;
}

export async function createTransaction(data) {
  const res = await api.post("/transactions", data);
  return res.data;
}

export async function updateTransaction(id, data) {
  const res = await api.put(`/transactions/${id}`, data);
  return res.data;
}

export async function deleteTransaction(id) {
  const res = await api.delete(`/transactions/${id}`);
  return res.data;
}

// ── Wallets ─────────────────────────────────────────────────
export async function getWallets() {
  const res = await api.get("/wallets");
  return res.data;
}

// ── Cycles ──────────────────────────────────────────────────
export async function getCurrentCycle() {
  const res = await api.get("/cycles/current");
  return res.data;
}

export async function getCycles() {
  const res = await api.get("/cycles");
  return res.data;
}

export async function updateCycleLimit(id, limit, applyToAll) {
  const res = await api.put(`/cycles/${id}/limit`, { limit, applyToAll });
  return res.data;
}

export async function getCycleById(id) {
  const res = await api.get(`/cycles/${id}`);
  return res.data;
}

// ── Savings Goals ───────────────────────────────────────────
export async function getSavingsGoals() {
  const res = await api.get("/savings");
  return res.data;
}

export async function createSavingsGoal(data) {
  const res = await api.post("/savings", data);
  return res.data;
}

export async function addToSavingsGoal(id, amount) {
  const res = await api.patch(`/savings/${id}`, { amount });
  return res.data;
}

export async function updateSavingsGoal(id, data) {
  const res = await api.put(`/savings/${id}`, data);
  return res.data;
}

export async function allocateSavings(data) {
  const res = await api.post("/savings/allocate", data);
  return res.data;
}

export async function deleteSavingsGoal(id) {
  const res = await api.delete(`/savings/${id}`);
  return res.data;
}

export async function getSavingsContributions(id) {
  const res = await api.get(`/savings/${id}/contributions`);
  return res.data;
}

// ── Settings ────────────────────────────────────────────────
export async function getSettings() {
  const res = await api.get("/settings");
  return res.data;
}

export async function updateSetting(key, value) {
  const res = await api.put(`/settings/${key}`, { value: String(value) });
  return res.data;
}

// ── Summary ─────────────────────────────────────────────────
export async function getSummary(params = {}) {
  const res = await api.get("/summary", { params });
  return res.data;
}

// ── Cash Flow ───────────────────────────────────────────────
export async function getCashFlow(params = {}) {
  const res = await api.get("/cashflow", { params });
  return res.data;
}

export default api;
