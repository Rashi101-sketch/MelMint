const { z } = require("zod");

// ── Transaction Schemas ─────────────────────────────────────

const createTransactionSchema = z.object({
  date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format. Use ISO 8601 (e.g., 2026-05-12)",
    }),
  transactionType: z.enum(["INCOME", "EXPENSE"], {
    errorMap: () => ({ message: "Must be either INCOME or EXPENSE" }),
  }),
  category: z
    .string()
    .min(1, "Category is required")
    .max(100, "Category must be 100 characters or less")
    .trim(),
  paymentMethod: z
    .string()
    .min(1, "Payment method is required")
    .max(100, "Payment method must be 100 characters or less")
    .trim(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(255, "Description must be 255 characters or less")
    .trim(),
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(999999999999.99, "Amount exceeds maximum"),
  walletId: z
    .number()
    .int()
    .positive("Wallet ID must be a positive integer")
    .optional(),
});

const updateTransactionSchema = z.object({
  date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    })
    .optional(),
  transactionType: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().min(1).max(100).trim().optional(),
  paymentMethod: z.string().min(1).max(100).trim().optional(),
  description: z.string().min(1).max(255).trim().optional(),
  amount: z.number().positive().max(999999999999.99).optional(),
  walletId: z.number().int().positive().optional(),
});

const queryTransactionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["date", "amount", "createdAt"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  transactionType: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  cycleId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ── Savings Schemas ─────────────────────────────────────────

const createSavingsGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(150, "Name must be 150 characters or less")
    .trim(),
  targetAmount: z
    .number()
    .min(0, "Target must be non-negative")
    .max(999999999999.99, "Amount exceeds maximum"),
  percentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0),
});

const addToSavingsGoalSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(999999999999.99, "Amount exceeds maximum"),
});

const allocateSavingsSchema = z.object({
  totalAmount: z
    .number()
    .positive("Total amount must be positive"),
  allocations: z.array(
    z.object({
      goalId: z.number().int().positive(),
      amount: z.number().min(0),
    })
  ),
});

// ── Settings Schemas ────────────────────────────────────────

const updateSettingSchema = z.object({
  value: z.string().min(1, "Value is required").max(255),
});

// ── Summary Schemas ─────────────────────────────────────────

const summaryQuerySchema = z.object({
  cycleId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

module.exports = {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
  createSavingsGoalSchema,
  addToSavingsGoalSchema,
  allocateSavingsSchema,
  updateSettingSchema,
  summaryQuerySchema,
};
