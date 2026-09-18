require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { ensureCurrentCycle } = require("./lib/ensureCycle");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security Middleware ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

// ── Body Parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Check ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "MelMint", timestamp: new Date().toISOString() });
});

// ── Lazy Monthly Cycle Management ────────────────────────────
// Ensures a valid monthly cycle exists before any route handler runs.
// Closes stale cycles and creates new ones when the calendar month changes.
app.use("/api", ensureCurrentCycle);

// ── Routes ───────────────────────────────────────────────────
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/cycles", require("./routes/cycles"));
app.use("/api/savings", require("./routes/savings"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/summary", require("./routes/summary"));

// ── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// ── Start Server ─────────────────────────────────────────────
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🌿 MelMint API running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}\n`);
  });
}

module.exports = app;
