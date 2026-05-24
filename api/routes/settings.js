const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const validate = require("../middleware/validate");
const { updateSettingSchema } = require("../validators/schemas");

// ─────────────────────────────────────────────────────────────
// GET /api/settings — Get all settings
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const settings = await prisma.setting.findMany();

    // Convert to object for easy frontend consumption
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    res.json({ success: true, data: settingsMap });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/settings/:key — Update a specific setting
// ─────────────────────────────────────────────────────────────
router.put("/:key", validate(updateSettingSchema, "body"), async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Setting "${key}" not found` });
    }

    const updated = await prisma.setting.update({
      where: { key },
      data: { value },
    });

    res.json({ success: true, data: { key: updated.key, value: updated.value } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
