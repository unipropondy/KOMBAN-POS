const { poolPromise } = require('../backend/config/db');

// We simulate the logic of the /dish report route
async function testReport() {
  try {
    const pool = await poolPromise;
    const filter = 'daily';
    
    // Using the exact logic from sales.js
    const appDateWhereSql = `CAST(sh.LastSettlementDate AS DATE) = CAST(GETDATE() AS DATE)`;
    const legacyDateWhereSql = `CAST(InvoiceDate AS DATE) = CAST(GETDATE() AS DATE)`;

    const query = `
        WITH AppReport AS (
          SELECT
            ISNULL(sid.DishName, ISNULL(d.Name, 'Unknown')) AS dishName,
            ISNULL(sid.CategoryName, ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
            ISNULL(sid.SubCategoryName, ISNULL(dg.DishGroupName, 'Unmapped')) AS subCategoryName,
            SUM(CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2))) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON (sid.DishId IS NOT NULL AND sid.DishId = d.DishId)
            OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(d.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE ${appDateWhereSql}
            AND ISNULL(sh.IsCancelled, 0) = 0
            AND ISNULL(sid.Qty, 0) > 0
          GROUP BY ISNULL(sid.DishName, ISNULL(d.Name, 'Unknown')), ISNULL(sid.CategoryName, ISNULL(cm.CategoryName, 'Unmapped')), ISNULL(sid.SubCategoryName, ISNULL(dg.DishGroupName, 'Unmapped'))
        ),
        LegacyReport AS (
          SELECT
            ISNULL(MAX(Dishname), 'Unmapped') AS dishName,
            ISNULL(MAX(CategoryName), 'Unmapped') AS categoryName,
            ISNULL(MAX(DishGroupname), 'Unmapped') AS subCategoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_Dishsalesreport
          WHERE ${legacyDateWhereSql}
          GROUP BY DishId, CategoryId, DishGroupId
        )
        SELECT dishName, categoryName, subCategoryName, SUM(totalQty) AS totalQty, SUM(totalAmount) AS totalAmount
        FROM (
          SELECT * FROM AppReport
          UNION ALL
          SELECT * FROM LegacyReport
        ) ReportRows
        GROUP BY dishName, categoryName, subCategoryName
        HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
        ORDER BY totalAmount DESC, totalQty DESC, dishName ASC
    `;

    const result = await pool.request().query(query);
    console.log('📡 API Output Sample:', JSON.stringify(result.recordset.slice(0, 5), null, 2));
    console.log('Total Rows:', result.recordset.length);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testReport();
