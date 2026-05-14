const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// 🔹 GET Settings
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    // 1. Try to get specific settings
    let result = await pool.request()
      .input("Id", sql.NVarChar, id)
      .query("SELECT * FROM CompanySettings WHERE Id = @Id");
    
    // 2. Fallback: If not found OR if the found record has NO NAME (empty shell)
    if (result.recordset.length === 0 || !result.recordset[0].CompanyName || result.recordset[0].CompanyName.trim() === '') {
      // ✅ Improved Fallback: Try to get Master Settings (ID 1) first
      const masterResult = await pool.request()
        .query("SELECT * FROM CompanySettings WHERE Id = '1'");
      
      if (masterResult.recordset.length > 0) {
        result = masterResult;
      } else {
        // Final Fallback: Get the most recently updated record that ACTUALLY HAS A NAME
        result = await pool.request()
          .query("SELECT TOP 1 * FROM CompanySettings WHERE CompanyName IS NOT NULL AND CompanyName <> '' ORDER BY UpdatedOn DESC");
      }
    }
    
    if (result.recordset.length > 0) {
      res.json({ success: true, settings: result.recordset[0] });
    } else {
      res.status(404).json({ success: false, message: "Settings not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST Settings (Upsert)
router.post("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const s = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("Id", sql.NVarChar, id)
      .input("CompanyName", sql.NVarChar, s.CompanyName)
      .input("Address", sql.NVarChar, s.Address)
      .input("GSTNo", sql.NVarChar, s.GSTNo)
      .input("GSTPercentage", sql.Decimal(18, 2), s.GSTPercentage)
      .input("Phone", sql.NVarChar, s.Phone)
      .input("Email", sql.NVarChar, s.Email)
      .input("CashierName", sql.NVarChar, s.CashierName)
      .input("Currency", sql.NVarChar, s.Currency)
      .input("CurrencySymbol", sql.NVarChar, s.CurrencySymbol)
      .input("CompanyLogoUrl", sql.NVarChar(sql.MAX), s.CompanyLogoUrl)
      .input("HalalLogoUrl", sql.NVarChar(sql.MAX), s.HalalLogoUrl)
      .input("PrinterIP", sql.NVarChar, s.PrinterIP) // ✅ ADDED
      .input("ShowCompanyLogo", sql.Bit, s.ShowCompanyLogo)
      .input("ShowHalalLogo", sql.Bit, s.ShowHalalLogo)
      .input("TaxMode", sql.NVarChar, s.TaxMode || 'exclusive')
      .input("WaiterRequired", sql.Bit, s.WaiterRequired !== undefined ? s.WaiterRequired : 0)
      .input("HoldOvertimeMinutes", sql.Int, s.HoldOvertimeMinutes || 30)
      .query(`
        IF EXISTS (SELECT 1 FROM CompanySettings WHERE Id = @Id)
        BEGIN
          UPDATE CompanySettings SET
            CompanyName = @CompanyName,
            Address = @Address,
            GSTNo = @GSTNo,
            GSTPercentage = @GSTPercentage,
            Phone = @Phone,
            Email = @Email,
            CashierName = @CashierName,
            Currency = @Currency,
            CurrencySymbol = @CurrencySymbol,
            CompanyLogoUrl = @CompanyLogoUrl,
            HalalLogoUrl = @HalalLogoUrl,
            PrinterIP = @PrinterIP,
            ShowCompanyLogo = @ShowCompanyLogo,
            ShowHalalLogo = @ShowHalalLogo,
            TaxMode = @TaxMode,
            WaiterRequired = @WaiterRequired,
            HoldOvertimeMinutes = @HoldOvertimeMinutes,
            UpdatedOn = GETDATE()
          WHERE Id = @Id
        END
        ELSE
        BEGIN
          INSERT INTO CompanySettings (Id, CompanyName, Address, GSTNo, GSTPercentage, Phone, Email, CashierName, Currency, CurrencySymbol, CompanyLogoUrl, HalalLogoUrl, PrinterIP, ShowCompanyLogo, ShowHalalLogo, TaxMode, WaiterRequired, HoldOvertimeMinutes)
          VALUES (@Id, @CompanyName, @Address, @GSTNo, @GSTPercentage, @Phone, @Email, @CashierName, @Currency, @CurrencySymbol, @CompanyLogoUrl, @HalalLogoUrl, @PrinterIP, @ShowCompanyLogo, @ShowHalalLogo, @TaxMode, @WaiterRequired, @HoldOvertimeMinutes)
        END
      `);

    res.json({ success: true, message: "Settings saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE Settings
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input("Id", sql.NVarChar, id)
      .query("DELETE FROM CompanySettings WHERE Id = @Id");
    res.json({ success: true, message: "Settings deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
