const { poolPromise } = require("../config/db");

async function syncPrinters() {
    try {
        console.log("🚀 Starting Final Printer Synchronization...");
        const pool = await poolPromise;
        
        // 1. Deactivate ALL current printers to start with a clean slate
        await pool.request().query("UPDATE PrintMaster SET IsActive = 0");
        console.log("   - All existing printers deactivated.");

        const targetPrinters = [
            { name: 'receipt printer', code: 0, ip: 'Receipt Printer', type: 1 },
            { name: 'beverages', code: 1, ip: '192.168.0.150', type: 2 },
            { name: 'indian', code: 2, ip: '192.168.0.150', type: 2 },
            { name: 'chinese', code: 3, ip: '192.168.0.150', type: 2 },
            { name: 'south indian kitchen', code: 5, ip: '192.168.0.150', type: 2 },
            { name: 'takeaway', code: 6, ip: '192.168.0.150', type: 3 },
            { name: 'north indian kitchen', code: 7, ip: '192.168.0.150', type: 2 }
        ];

        for (const p of targetPrinters) {
            console.log(`   - Processing: ${p.name}...`);
            // Try to update existing entry by KitchenTypeValue first
            const updateRes = await pool.request()
                .input("name", p.name)
                .input("code", p.code)
                .input("ip", p.ip)
                .input("type", p.type)
                .query(`
                    IF EXISTS (SELECT 1 FROM PrintMaster WHERE KitchenTypeValue = @code)
                    BEGIN
                        UPDATE PrintMaster 
                        SET PrinterName = @name, 
                            KitchenTypeName = @name,
                            PrinterPath = @ip, 
                            PrinterIP = @ip,
                            PrinterType = @type,
                            IsActive = 1 
                        WHERE KitchenTypeValue = @code;
                        SELECT 'UPDATED' as Action;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO PrintMaster (
                            PrinterId, PrinterName, PrinterPath, PrinterIP, 
                            PrinterType, PrintSection, KitchenTypeName, 
                            KitchenTypeValue, IsActive, PrintCopy
                        )
                        VALUES (
                            NEWID(), @name, @ip, @ip, 
                            @type, 1, @name, 
                            @code, 1, 1
                        );
                        SELECT 'INSERTED' as Action;
                    END
                `);
            console.log(`     -> ${updateRes.recordset[0].Action}`);
        }

        console.log("✅ Printer Synchronization Complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Sync Failed:", err.message);
        process.exit(1);
    }
}

syncPrinters();
