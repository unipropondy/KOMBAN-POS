const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

router.get("/cancel-reasons", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CRCode, CRName FROM [dbo].[CancelRemarksMaster] WHERE IsActive = 1 ORDER BY CRName ASC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/discounts", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CAST(DiscountId AS NVARCHAR(50)) AS DiscountId, DiscountCode, Description, DiscountPercentage, isGuestMeal, DiscountAmount FROM [dbo].[Discount] WHERE isActive = 1 ORDER BY DiscountPercentage DESC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
