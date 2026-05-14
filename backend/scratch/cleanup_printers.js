const { poolPromise } = require("../config/db");

async function cleanup() {
    try {
        console.log("🚀 Starting Printer Cleanup...");
        const pool = await poolPromise;
        
        // 1. Deactivate redundant 'english' printer that conflicts with 'TakeAway' (Code 6)
        const result = await pool.request().query(`
            UPDATE PrintMaster 
            SET IsActive = 0
            WHERE PrinterName = 'english' AND KitchenTypeValue = 6;
        `);
        
        console.log(`✅ Cleanup Complete! Rows affected: ${result.rowsAffected}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup Failed:", err.message);
        process.exit(1);
    }
}

cleanup();
