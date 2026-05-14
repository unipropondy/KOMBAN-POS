const { poolPromise } = require('../backend/config/db');

async function testReport() {
  try {
    const pool = await poolPromise;
    const date = '2026-04-26';
    const targetDate = `'${date}'`;
    
    const query = `
        WITH AppReport AS (
          SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')) AS dishName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped')) AS subCategoryName,
            SUM(CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2))) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON (sid.DishId IS NOT NULL AND sid.DishId = d.DishId)
            OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(d.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE CAST(sh.LastSettlementDate AS DATE) = CAST(${targetDate} AS DATE)
            AND ISNULL(sh.IsCancelled, 0) = 0
            AND ISNULL(sid.Qty, 0) > 0
          GROUP BY 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped'))
        ),
        LegacyReport AS (
          SELECT
            ISNULL(MAX(Dishname), 'Unmapped') AS dishName,
            ISNULL(MAX(CategoryName), 'Unmapped') AS categoryName,
            ISNULL(MAX(DishGroupname), 'Unmapped') AS subCategoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_Dishsalesreport
          WHERE CAST(InvoiceDate AS DATE) = CAST(${targetDate} AS DATE)
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
    console.log('📡 API Output Rows:', result.recordset.length);
    console.log('📡 Sample Data:', JSON.stringify(result.recordset.slice(0, 5), null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

testReport();
