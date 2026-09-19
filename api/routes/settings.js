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

    // Upsert: create the setting if it doesn't exist, update if it does
    const updated = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    res.json({ success: true, data: { key: updated.key, value: updated.value } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
