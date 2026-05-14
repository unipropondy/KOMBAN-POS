const { poolPromise } = require("../config/db");

async function syncMappings() {
    try {
        console.log("🚀 Starting Category Mapping Synchronization...");
        const pool = await poolPromise;
        
        const mappings = [
            { id: 'AD194EAB-34F3-4864-AD02-0BEAC300E8B9', name: 'chinese', code: 3 },
            { id: 'D75C65A3-9076-49E3-A82E-285D2CA47104', name: 'south indian kitchen', code: 5 },
            { id: 'F69A00EE-A8BA-470D-92DE-4028B521EC09', name: 'indian', code: 2 },
            { id: 'AA466936-3E41-46C4-BB13-4AEEB1D701BB', name: 'beverages', code: 1 },
            { id: '384EFE71-2246-42DB-A2E8-C50830A14FC9', name: 'north indian kitchen', code: 7 }
        ];

        for (const m of mappings) {
            console.log(`   - Mapping: ${m.name}...`);
            await pool.request()
                .input("cid", m.id)
                .input("name", m.name)
                .input("code", m.code)
                .query(`
                    IF EXISTS (SELECT 1 FROM CategoryKitchenType WHERE CategoryId = @cid)
                    BEGIN
                        UPDATE CategoryKitchenType 
                        SET KitchenTypeCode = @code, 
                            KitchenTypeName = @name
                        WHERE CategoryId = @cid;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO CategoryKitchenType (CategoryId, KitchenTypeCode, KitchenTypeName)
                        VALUES (@cid, @code, @name);
                    END
                `);
        }

        console.log("✅ Category Mapping Synchronization Complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Mapping Failed:", err.message);
        process.exit(1);
    }
}

syncMappings();
