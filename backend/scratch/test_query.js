const { poolPromise } = require("../config/db");

async function testQuery() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            WITH OptimizedPrinters AS (
                SELECT *, 
                       ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as Ranker 
                FROM PrintMaster 
                WHERE IsActive = 1
            ), 
            MappedOrders AS (
                SELECT 
                    OD.OrderId, 
                    OD.DishName, 
                    OD.Quantity, 
                    ISNULL(PM.KitchenTypeName, 'KITCHEN') AS TargetKitchen, 
                    PM.PrinterPath, 
                    ISNULL(PM.KitchenTypeValue, 2) AS PrinterCode 
                FROM RestaurantOrderDetailCur OD 
                INNER JOIN DishMaster DM ON OD.DishId = DM.DishId 
                LEFT JOIN DishGroupMaster DGM ON DM.DishGroupId = DGM.DishGroupId 
                LEFT JOIN CategoryKitchenType CKT ON DGM.CategoryId = CKT.CategoryId 
                LEFT JOIN OptimizedPrinters PM ON CKT.KitchenTypeCode = PM.KitchenTypeValue AND PM.Ranker = 1 
                WHERE OD.OrderId = (SELECT TOP 1 OrderId FROM RestaurantOrderDetailCur ORDER BY CreatedOn DESC)
            ) 
            SELECT * FROM MappedOrders ORDER BY PrinterCode;
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

testQuery();
