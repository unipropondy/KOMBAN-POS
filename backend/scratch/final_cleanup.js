const { poolPromise } = require("../config/db");

async function cleanupPrinters() {
    try {
        console.log("🚀 Starting Printer Cleanup (Removing Unset IPs & Duplicates)...");
        const pool = await poolPromise;
        
        // 1. Clear IPs for all kitchen printers (since the user says they haven't given any yet)
        // We leave 'receipt printer' as is if it has a special path, but kitchen ones get cleared.
        await pool.request().query(`
            UPDATE PrintMaster 
            SET PrinterPath = '', 
                PrinterIP = ''
            WHERE KitchenTypeValue > 0;
        `);
        console.log("   - Kitchen printer IPs cleared.");

        // 2. Properly handle duplicates for Code 6 (TakeAway)
        // We only want ONE active entry for each KitchenTypeValue
        await pool.request().query(`
            WITH CTE AS (
                SELECT *,
                       ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn
                FROM PrintMaster
                WHERE IsActive = 1
            )
            UPDATE PrintMaster
            SET IsActive = 0
            WHERE PrinterId IN (SELECT PrinterId FROM CTE WHERE rn > 1);
        `);
        console.log("   - Duplicate kitchen printers deactivated.");

        // 3. Remove completely unnecessary/broken entries (IsActive=0 and no valid code)
        await pool.request().query(`
            DELETE FROM PrintMaster 
            WHERE (KitchenTypeValue IS NULL OR KitchenTypeValue = 8787)
            AND IsActive = 0;
        `);
        console.log("   - Cleaned up broken/test entries.");

        console.log("✅ Printer Table Cleaned Successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup Failed:", err.message);
        process.exit(1);
    }
}

cleanupPrinters();
