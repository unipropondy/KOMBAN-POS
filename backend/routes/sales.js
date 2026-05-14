const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// Helper to generate a random 8-character hex ID (e.g. A996E780)
const generateRandomBillId = () => {
    return Math.random().toString(16).slice(2, 10).toUpperCase();
};

const normalizeReportPayModeSql = (columnName = "sts.PayMode") => `
  UPPER(ISNULL(
    (SELECT TOP 1 LTRIM(RTRIM(Description)) 
     FROM Paymode pm 
     WHERE LTRIM(RTRIM(pm.PayMode)) = LTRIM(RTRIM(ISNULL(${columnName}, '')))
        OR LTRIM(RTRIM(pm.Description)) = LTRIM(RTRIM(ISNULL(${columnName}, '')))
        OR CAST(pm.Position AS NVARCHAR(10)) = LTRIM(RTRIM(ISNULL(${columnName}, '')))
    ),
    CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('CAS', 'CASH', '', '1') THEN 'CASH'
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('CARD', 'VISA', 'MASTER', 'MASTERCARD', 'AMEX', 'DINERS') THEN 'CARD'
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('PAYNOW', 'GRAB', 'FOODPANDA', '3') OR UPPER(${columnName}) LIKE '%PAYNOW%' THEN 'PAYNOW'
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('NETS', '2') OR UPPER(${columnName}) LIKE '%NETS%' THEN 'NETS'
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('UPI', '4') OR UPPER(${columnName}) LIKE '%UPI%' OR UPPER(${columnName}) LIKE '%GPAY%' THEN 'UPI'
      ELSE UPPER(LTRIM(RTRIM(ISNULL(${columnName}, 'CASH'))))
    END
  ))
`;

const getReportDateRange = (req) => {
  const filter = (req.query.filter || "daily").toLowerCase();
  const start = new Date();
  const end = new Date();

  // Default to day boundaries
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (filter === "weekly") {
    start.setDate(start.getDate() - 6);
  } else if (filter === "monthly") {
    start.setDate(1);
    // end maintains today
  } else if (filter === "yearly") {
    start.setMonth(0, 1);
    // end maintains today
  }
  // Daily uses today's start/end

  return { start, end };
};

const getReportDateWhereSql = (filter = "daily", saleDateColumn = "sh.LastSettlementDate", date = null) => {
  // Precisely match IST (UTC+5.5) against the drifting Server clock (UTC+7.8)
  // Offset = 7.8 - 5.5 = 2.3 hours = 138 minutes
  const targetDate = date ? `'${date}'` : 'DATEADD(MINUTE, -138, GETDATE())';
  const safeTargetDate = `CAST(CAST(${targetDate} AS DATETIME) AS DATE)`;

  switch (String(filter).toLowerCase()) {
    case "weekly":
      return `${saleDateColumn} >= DATEADD(DAY, -6, CAST(${safeTargetDate} AS DATETIME)) AND ${saleDateColumn} <= DATEADD(HOUR, 36, CAST(${safeTargetDate} AS DATETIME))`;
    case "monthly":
      return `MONTH(CAST(${saleDateColumn} AS DATETIME)) = MONTH(${safeTargetDate}) AND YEAR(CAST(${saleDateColumn} AS DATETIME)) = YEAR(${safeTargetDate})`;
    case "yearly":
      return `YEAR(CAST(${saleDateColumn} AS DATETIME)) = YEAR(${safeTargetDate})`;
    case "daily":
    default:
      // Precisely match the IST day (00:00 to 23:59 IST)
      // IST 00:00 = Server 02:48 AM
      const istStart = `DATEADD(MINUTE, 168, CAST(${safeTargetDate} AS DATETIME))`;
      return `${saleDateColumn} >= ${istStart} AND ${saleDateColumn} < DATEADD(DAY, 1, ${istStart})`;
  }
};

const normalizeReportFilter = (filter = "daily") => {
  const normalized = String(filter || "daily").toLowerCase();
  return ["daily", "weekly", "monthly", "yearly"].includes(normalized) ? normalized : "daily";
};

const parseCsv = (value) => String(value || "")
  .split(",")
  .map((v) => v.trim().toUpperCase())
  .filter(Boolean);

const normalizePayMode = (paymentMethod = "CASH") => {
  const raw = String(paymentMethod || "CASH").toUpperCase().trim();
  
  if (raw.includes("CASH") || raw === "CAS") return "CASH";
  if (raw.includes("CARD") || raw.includes("VISA") || raw.includes("MASTER") || raw.includes("AMEX") || raw.includes("DINERS")) return "CARD";
  if (raw.includes("PAYNOW") || raw.includes("GRAB") || raw.includes("FOODPANDA")) return "PAYNOW";
  if (raw.includes("UPI") || raw.includes("GPAY") || raw.includes("PHONE") || raw.includes("PAYTM")) return "UPI";
  if (raw.includes("NETS")) return "NETS";
  
  return raw;
};

const toGuidOrNull = (value) => {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

const sanitizeGuid = (value, fallback = DEFAULT_GUID) => {
  return toGuidOrNull(value) || fallback;
};

const validateSalePayload = ({ totalAmount, paymentMethod, items }) => {
  if (!paymentMethod || !String(paymentMethod).trim()) {
    return "Payment mode is required";
  }

  const numericTotal = Number(totalAmount);
  if (!Number.isFinite(numericTotal) || numericTotal < 0) {
    return "Total amount must be at least zero";
  }

  if (!Array.isArray(items) || items.length === 0) {
    return "At least one sale item is required";
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {};
    const dishId = item.dishId || item.id;
    const dishName = item.dish_name || item.name;
    const qty = Number(item.qty);
    const price = Number(item.price);

    if (!dishId && !dishName) return `Item ${i + 1} is missing dish information`;
    if (!Number.isFinite(qty) || qty <= 0) return `Item ${i + 1} has invalid quantity`;
    if (!Number.isFinite(price) || price < 0) return `Item ${i + 1} has invalid price`;
  }

  return null;
};

/* ================= SALES LIST & SUMMARY ================= */
router.get("/all", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 200 
        sh.SettlementID, 
        DATEADD(MINUTE, -468, sh.LastSettlementDate) AS SettlementDate, 
        sh.BillNo AS OrderId, 
        sh.OrderType,
        sh.TableNo, 
        sh.Section, 
        sh.CashierId, 
        sh.BillNo, 
        sh.SER_NAME,
        ${normalizeReportPayModeSql("sts.PayMode")} as PayMode,
        sh.SysAmount as SysAmount,
        sh.ManualAmount as ManualAmount,
        ISNULL(sts.ReceiptCount, 0) as ReceiptCount,
        ISNULL(sh.VoidItemQty, 0) as VoidQty,
        ISNULL(sh.VoidItemAmount, 0) as VoidAmount,
        sh.IsCancelled,
        sh.CancellationReason,
        DATEADD(MINUTE, -468, sh.CancelledDate) as CancelledDate,
        sh.CancelledByUserName
      FROM SettlementHeader sh
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      ORDER BY sh.LastSettlementDate DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { startDate, endDate } = req.query;
    const result = await pool.request()
      .input("Start", sql.DateTime, startDate || new Date(new Date().setDate(new Date().getDate() - 30)))
      .input("End", sql.DateTime, endDate || new Date())
      .query(`
        SELECT sh.SettlementID, DATEADD(MINUTE, -468, sh.LastSettlementDate) as LastSettlementDate, sh.BillNo, sh.SysAmount AS TotalAmount, sts.PayMode,
        CONVERT(VARCHAR(8), DATEADD(MINUTE, -468, sh.LastSettlementDate), 112) + '-' + RIGHT('0000' + CAST(sh.OrderId AS VARCHAR(10)), 4) AS OrderId,
        sh.IsCancelled, sh.CancellationReason
        FROM SettlementHeader sh
        LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate >= DATEADD(hour, -12, CAST(@Start AS DATETIME))
        AND sh.LastSettlementDate <= DATEADD(hour, 36, CAST(@End AS DATETIME))
        ORDER BY sh.LastSettlementDate DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/range", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { startDate, endDate } = req.query;
    const result = await pool.request()
      .input("Start", sql.DateTime, startDate)
      .input("End", sql.DateTime, endDate)
      .query(`
        SELECT ISNULL(SUM(sts.SysAmount), 0) AS TotalSales, 
        COUNT(sh.SettlementID) AS TransactionCount
        FROM SettlementHeader sh
        INNER JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate >= DATEADD(hour, -12, CAST(@Start AS DATETIME))
        AND sh.LastSettlementDate <= DATEADD(hour, 36, CAST(@End AS DATETIME))
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/detail/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("Id", sql.UniqueIdentifier, req.params.id)
      .query("SELECT * FROM SettlementItemDetail WHERE SettlementID = @Id");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get("/category", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const date = req.query.date;
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate", date);
    console.log(`[REPORT API] type=category filter=${filter} date=${date || 'today'}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
            SUM(CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2))) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON sid.DishId = d.DishId
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE ${appDateWhereSql}
            AND ISNULL(sid.Qty, 0) > 0
          GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped'))
        ),
        LegacyReport AS (
          SELECT
            CAST(ISNULL(MAX(CAST(categoryname AS NVARCHAR(255))), 'Unmapped') AS NVARCHAR(255)) AS categoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_categorysalesreport
          WHERE ${legacyDateWhereSql}
          GROUP BY CategoryId
        ),
        ProfessionalReport AS (
          SELECT
            ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
            SUM(CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS decimal(18, 2))) AS totalAmount
          FROM RestaurantOrderDetail rod
          INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
          LEFT JOIN DishMaster d ON rod.DishId = d.DishId
          LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
          WHERE ${appDateWhereSql.replace(/sh\.OrderDate|sh\.LastSettlementDate/g, 'ro.OrderDateTime')}
            AND ISNULL(ro.StatusCode, 0) = 3
            AND NOT EXISTS (
              SELECT 1 FROM SettlementHeader sh_dup 
              WHERE sh_dup.BillNo = ro.OrderNumber
            )
          GROUP BY ISNULL(cm.CategoryName, 'Unmapped')
        )
        SELECT categoryName, SUM(totalQty) AS totalQty, SUM(totalAmount) AS totalAmount
        FROM (
          SELECT CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM AppReport
          UNION ALL
          SELECT CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM LegacyReport
          UNION ALL
          SELECT CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM ProfessionalReport
        ) ReportRows
        GROUP BY categoryName
        HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
        ORDER BY totalAmount DESC, totalQty DESC, categoryName ASC
      `);

    console.log(`[REPORT API] type=category filter=${filter} rows=${result.recordset.length}`);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[REPORT API] category error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dish", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const date = req.query.date;
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate", date);
    console.log(`[REPORT API] type=dish filter=${filter} date=${date || 'today'}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')) AS dishName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped')) AS subCategoryName,
            SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
            SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') = 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) ELSE 0 END) AS voidQty,
            SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON sid.DishId = d.DishId
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE ${appDateWhereSql}
          GROUP BY 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped'))
        ),
        LegacyReport AS (
          SELECT
            CAST(ISNULL(MAX(CAST(Dishname AS NVARCHAR(255))), 'Unmapped') AS NVARCHAR(255)) AS dishName,
            CAST(ISNULL(MAX(CAST(CategoryName AS NVARCHAR(255))), 'Unmapped') AS NVARCHAR(255)) AS categoryName,
            CAST(ISNULL(MAX(CAST(DishGroupname AS NVARCHAR(255))), 'Unmapped') AS NVARCHAR(255)) AS subCategoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_Dishsalesreport
          WHERE ${legacyDateWhereSql}
          GROUP BY DishId, CategoryId, DishGroupId
        ),
        ProfessionalReport AS (
          SELECT
            ISNULL(rod.DishName, 'Unknown') AS dishName,
            ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
            ISNULL(dg.DishGroupName, 'Unmapped') AS subCategoryName,
            SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
            SUM(CASE WHEN rod.StatusCode = 0 THEN CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3)) ELSE 0 END) AS voidQty,
            SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
          FROM RestaurantOrderDetail rod
          INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
          LEFT JOIN DishMaster d ON rod.DishId = d.DishId
          LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
          WHERE ${appDateWhereSql.replace(/sh\.OrderDate|sh\.LastSettlementDate/g, 'ro.OrderDateTime')}
            AND ISNULL(ro.StatusCode, 0) = 3
            AND NOT EXISTS (
              SELECT 1 FROM SettlementHeader sh_dup 
              WHERE sh_dup.BillNo = ro.OrderNumber
            )
          GROUP BY 
            ISNULL(rod.DishName, 'Unknown'), 
            ISNULL(cm.CategoryName, 'Unmapped'), 
            ISNULL(dg.DishGroupName, 'Unmapped')
        )
        SELECT dishName, categoryName, subCategoryName, SUM(totalQty) AS totalQty, SUM(voidQty) AS voidQty, SUM(totalAmount) AS totalAmount
        FROM (
          SELECT CAST(dishName AS NVARCHAR(255)) AS dishName, CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(subCategoryName AS NVARCHAR(255)) AS subCategoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(voidQty AS decimal(18,3)) AS voidQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM AppReport
          UNION ALL
          SELECT CAST(dishName AS NVARCHAR(255)) AS dishName, CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(subCategoryName AS NVARCHAR(255)) AS subCategoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(0 AS decimal(18,3)) AS voidQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM LegacyReport
          UNION ALL
          SELECT CAST(dishName AS NVARCHAR(255)) AS dishName, CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(subCategoryName AS NVARCHAR(255)) AS subCategoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(voidQty AS decimal(18,3)) AS voidQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM ProfessionalReport
        ) ReportRows
        GROUP BY dishName, categoryName, subCategoryName
        HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0 OR SUM(voidQty) > 0
        ORDER BY totalAmount DESC, totalQty DESC, dishName ASC
      `);

    console.log(`[REPORT API] type=dish filter=${filter} rows=${result.recordset.length}`);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[REPORT API] dish error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Day End Summary
router.get("/day-end-summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date().toISOString().split("T")[0];
    
    // Default to today if no dates provided
    const start = startDate || today;
    const end = endDate || today;
    
    console.log(`[DAY-END DEBUG] Fetching summary from ${start} to ${end}`);
    
    const pool = await poolPromise;

    // 0. Organization Info
    const orgRes = await pool.request().query(`
      SELECT TOP 1
        Name,
        Address1_Line1,
        Address1_Line2,
        Address1_City,
        Address1_PostalCode,
        Address1_Telephone1
      FROM Organization
    `);
    const orgInfo = orgRes.recordset[0] || {};

    // A. Paymode Detail (Aggregate all settlements in range)
    const paymodeRes = await pool.request()
      .input("start", sql.VarChar, start)
      .input("end", sql.VarChar, end)
      .query(`
        SELECT 
          Paymode,
          SUM(Amount) as Amount,
          SUM(Count) as Count
        FROM (
          SELECT 
            UPPER(ISNULL(
              (SELECT TOP 1 LTRIM(RTRIM(pm.Description)) 
               FROM Paymode pm 
               WHERE LTRIM(RTRIM(pm.PayMode)) = LTRIM(RTRIM(sd.Paymode)) 
                  OR LTRIM(RTRIM(pm.Description)) = LTRIM(RTRIM(sd.Paymode))
                  OR CAST(pm.Position AS NVARCHAR(10)) = LTRIM(RTRIM(sd.Paymode))
              ), 
              CASE 
                WHEN LTRIM(RTRIM(sd.Paymode)) = '2' THEN 'NETS'
                WHEN LTRIM(RTRIM(sd.Paymode)) = '3' THEN 'PAYNOW'
                WHEN LTRIM(RTRIM(sd.Paymode)) = '4' THEN 'UPI / GPAY'
                ELSE ISNULL(sd.Paymode, 'CASH')
              END
            )) as Paymode,
            ISNULL(sd.SysAmount, 0) as Amount,
            ISNULL(sd.ReceiptCount, 0) as Count
          FROM SettlementHeader sh
          INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
          WHERE CAST(sh.LastSettlementDate AS DATE) >= @start
            AND CAST(sh.LastSettlementDate AS DATE) <= @end
        ) RawData
        GROUP BY Paymode
      `);

    const paymodes = paymodeRes.recordset;
    console.log(`[DAY-END DEBUG] Found ${paymodes.length} paymode records`);
    console.log(`[DAY-END DEBUG] Paymodes:`, JSON.stringify(paymodes));

    // B. Detailed Sales Analysis & Void Detail
    const analysisRes = await pool.request()
      .input("start", sql.VarChar, start)
      .input("end", sql.VarChar, end)
      .query(`
        SELECT 
          SUM(ISNULL(SubTotal, 0)) as BaseSales,
          SUM(ISNULL(SysAmount, 0)) as TotalSales,
          SUM(ISNULL(TotalTax, 0)) as TotalTax,
          SUM(ISNULL(DiscountAmount, 0)) as TotalDiscount,
          SUM(ISNULL(ServiceCharge, 0)) as TotalServiceCharge,
          SUM(ISNULL(RoundedBy, 0)) as TotalRoundOff,
          COUNT(SettlementID) as TotalBills,
          SUM(ISNULL(VoidItemQty, 0)) as VoidQty,
          SUM(ISNULL(VoidItemAmount, 0)) as VoidAmount,
          MAX(TerminalCode) as TerminalCode,
          MAX(RefNo) as RefNo
        FROM SettlementHeader
        WHERE CAST(LastSettlementDate AS DATE) >= @start
          AND CAST(LastSettlementDate AS DATE) <= @end
      `);
 
    const analysis = analysisRes.recordset[0] || { 
      BaseSales: 0, TotalSales: 0, TotalTax: 0, TotalDiscount: 0, TotalServiceCharge: 0, 
      TotalRoundOff: 0, TotalBills: 0, VoidQty: 0, VoidAmount: 0
    };

    const totalSales = analysis.TotalSales || 0;
    const detailTotal = paymodes.reduce((acc, curr) => acc + (Number(curr.Amount) || 0), 0);
    const diff = totalSales - detailTotal;
    console.log(`[DAY-END DEBUG] Analysis:`, JSON.stringify(analysis));
    console.log(`[DAY-END DEBUG] totalSales: ${totalSales}, detailTotal: ${detailTotal}, diff: ${diff}`);

    // If there's a real discrepancy, surface it explicitly as "Unknown / Unrecorded"
    // and log the offending SettlementHeader rows for deeper inspection.
    if (Math.abs(diff) > 0.05) {
      const unrecordedRes = await pool.request()
        .input("start", sql.VarChar, start)
        .input("end", sql.VarChar, end)
        .query(`
          SELECT TOP 50
            sh.SettlementID,
            sh.LastSettlementDate,
            sh.SysAmount,
            sh.TotalTax,
            sh.SubTotal,
            sh.DiscountAmount,
            sh.ServiceCharge,
            sh.RoundedBy
          FROM SettlementHeader sh 
          WHERE CAST(sh.LastSettlementDate AS DATE) >= @start 
            AND CAST(sh.LastSettlementDate AS DATE) <= @end 
            AND NOT EXISTS (SELECT 1 FROM SettlementDetail sd WHERE sd.SettlementId = sh.SettlementID)
          ORDER BY sh.LastSettlementDate DESC
        `);

      const unrecordedCount = unrecordedRes.recordset.length;
      if (unrecordedCount > 0) {
        console.warn(
          "[DAY-END SUMMARY] Detected settlements without SettlementDetail rows.",
          {
            start,
            end,
            totalSales,
            detailTotal,
            diff,
            unrecordedCount,
            sampleSettlementIds: unrecordedRes.recordset
              .slice(0, 10)
              .map((r) => r.SettlementID),
          }
        );

        paymodes.push({
          Paymode: "Unknown / Unrecorded",
          Amount: diff,
          Count: unrecordedCount,
        });
      } else {
        console.warn(
          "[DAY-END SUMMARY] Total/Paymode mismatch with no header rows missing details.",
          { start, end, totalSales, detailTotal, diff }
        );
      }
    }

    const cashTotal = paymodes.filter(p => p.Paymode === 'CASH').reduce((acc, curr) => acc + (Number(curr.Amount) || 0), 0);
    const otherTotal = paymodes.filter(p => p.Paymode !== 'CASH').reduce((acc, curr) => acc + (Number(curr.Amount) || 0), 0);

    const billCount = Number(analysis.TotalBills) || 0;
    console.log(`[DAY-END DEBUG] billCount: ${billCount}`);
    
    // C. Settlement Paymode Breakdown
    console.log(`[DAY-END DEBUG] Fetching settlement breakdown...`);
    const settlementRes = await pool.request()
      .input("start", sql.VarChar, start)
      .input("end", sql.VarChar, end)
      .query(`
        SELECT 
          ISNULL((SELECT TOP 1 LTRIM(RTRIM(Description)) FROM Paymode pm WHERE LTRIM(RTRIM(pm.PayMode)) = LTRIM(RTRIM(sd.Paymode))), sd.Paymode) as Paymode,
          SUM(ISNULL(sd.SysAmount, 0)) as SysAmount,
          SUM(ISNULL(sd.ManualAmount, 0)) as ManualAmount,
          SUM(ISNULL(sd.SortageOrExces, 0)) as SortageOrExces,
          CAST(SUM(ISNULL(sd.ReceiptCount, 0)) AS INT) as ReceiptCount
        FROM SettlementHeader sh
        INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
        WHERE CAST(sh.LastSettlementDate AS DATE) >= @start
          AND CAST(sh.LastSettlementDate AS DATE) <= @end
        GROUP BY sd.Paymode
        ORDER BY SysAmount DESC
      `);

    res.json({
      success: true,
      orgInfo,
      terminalCode: analysis.TerminalCode,
      refNo: analysis.RefNo,
      paymodeDetail: paymodes,
      settlementBreakdown: settlementRes.recordset,
      settlementDetail: {
        cashTotal,
        otherTotal
      },
      salesAnalysis: {
        baseSales: analysis.BaseSales || 0,
        totalSales,
        totalTax: analysis.TotalTax || 0,
        totalDiscount: analysis.TotalDiscount || 0,
        totalServiceCharge: analysis.TotalServiceCharge || 0,
        roundOff: analysis.TotalRoundOff || 0,
        netTotal: totalSales, 
        billCount,
        avgPerBill: billCount > 0 ? (totalSales / billCount) : 0
      },
      voidDetail: {
        voidQty: analysis.VoidQty || 0,
        voidAmount: analysis.VoidAmount || 0
      }
    });
  } catch (err) {
    console.error("[DAY-END SUMMARY ERROR]", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.get("/daily/:date", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { date } = req.params;
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const result = await pool.request()
      .input("StartOfDay", sql.DateTime, startOfDay)
      .input("EndOfDay", sql.DateTime, endOfDay).query(`
        WITH NormalizedSales AS (
          SELECT sh.SettlementID, sts.SysAmount, ISNULL(sts.ReceiptCount, 0) AS ReceiptCount,
          ${normalizeReportPayModeSql("sts.PayMode")} AS PayMode
          FROM SettlementHeader sh
          INNER JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
          WHERE sh.LastSettlementDate BETWEEN @StartOfDay AND @EndOfDay
        )
        SELECT COUNT(DISTINCT SettlementID) as TotalTransactions, ISNULL(SUM(SysAmount), 0) as TotalSales,
        ISNULL(SUM(CASE WHEN PayMode = 'CASH' THEN SysAmount ELSE 0 END), 0) as CashSales,
        ISNULL(SUM(CASE WHEN PayMode = 'NETS' THEN SysAmount ELSE 0 END), 0) as NETS_Sales,
        ISNULL(SUM(CASE WHEN PayMode = 'PAYNOW' THEN SysAmount ELSE 0 END), 0) as PayNow_Sales,
        ISNULL(SUM(CASE WHEN PayMode = 'CARD' THEN SysAmount ELSE 0 END), 0) as CardSales,
        ISNULL(SUM(CASE WHEN PayMode = 'CREDIT' THEN SysAmount ELSE 0 END), 0) as MemberSales,
        ISNULL(SUM(ReceiptCount), 0) as TotalItems
        FROM NormalizedSales
      `);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily-order-count", async (req, res) => {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const result = await pool.request()
      .input("Start", sql.DateTime, startOfDay)
      .input("End", sql.DateTime, endOfDay)
      .query(`
        SELECT COUNT(SettlementID) as currentCount 
        FROM SettlementHeader 
        WHERE LastSettlementDate BETWEEN @Start AND @End
      `);
    
    const count = result.recordset[0].currentCount || 0;
    res.json({ nextNumber: count + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= SAVE SALE ================= */
router.post("/save", async (req, res) => {
  try {
    const pool = await poolPromise;
    const {
      totalAmount, paymentMethod, items, subTotal, taxAmount,
      discountAmount, discountType, roundOff, orderId, orderType, tableNo, section, memberId, cashierId, tableId,
      serverId, serverName
    } = req.body;

    const validationError = validateSalePayload({ totalAmount, paymentMethod, items });
    if (validationError) {
      console.warn(`[SAVE SALE] Validation failed: ${validationError}`);
      return res.status(400).json({ error: validationError });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const settlementIdResult = await transaction.request().query(`SELECT NEWID() AS id`);
      const settlementId = settlementIdResult.recordset[0].id;
      let billNo = ""; // Will be set to displayOrderId later

        const bizRow = await transaction.request().query(`
          SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
          UNION ALL
          SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
        `);
        let businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;

    // 2. Order ID Retrieval
    const now = new Date();
    let displayOrderId = null;
    let dailySequence = 0;

    if (tableId) {
        const tableCheck = await transaction.request()
            .input("tid", sql.UniqueIdentifier, String(tableId).replace(/^\{|\}$/g, "").trim())
            .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");
        displayOrderId = tableCheck.recordset[0]?.CurrentOrderId;
        
        if (displayOrderId && displayOrderId.includes('-')) {
            dailySequence = parseInt(displayOrderId.split('-')[1]) || 0;
        }
    }

    if (!displayOrderId) {
        // Fallback: Generate a new one if none exists (e.g., takeaway or direct pay)
        const todayStr = new Date().toLocaleDateString('en-CA'); 
        
        let seqResult = await transaction.request()
            .input("RestId", sql.UniqueIdentifier, businessUnitId)
            .input("Today", sql.Date, todayStr)
            .query(`
              UPDATE OrderSequences 
              SET LastNumber = LastNumber + 1 
              OUTPUT INSERTED.LastNumber
              WHERE RestaurantId = @RestId AND SequenceDate = @Today
            `);

        if (seqResult.recordset.length > 0) {
            dailySequence = seqResult.recordset[0].LastNumber;
        } else {
            await transaction.request()
                .input("RestId", sql.UniqueIdentifier, businessUnitId)
                .input("Today", sql.Date, todayStr)
                .query(`
                  INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber)
                  VALUES (@RestId, @Today, 1)
                `);
            dailySequence = 1;
        }
        displayOrderId = `${todayStr.replace(/-/g, '')}-${String(dailySequence).padStart(4, '0')}`;
        console.log(`[SAVE SALE] Generated NEW ID: ${displayOrderId}`);
    } else {
        console.log(`[SAVE SALE] Using EXISTING ID: ${displayOrderId} (Seq: ${dailySequence})`);
    }

    // 2.5 Fetch Voided Items from Professional Detail Tables
    let voidQty = 0;
    let voidAmount = 0;
    if (displayOrderId) {
        const voidRes = await transaction.request()
            .input("orderNo", sql.NVarChar(100), displayOrderId)
            .query(`
                SELECT SUM(d.Quantity) as VQty, SUM(d.TotalDetailLineAmount) as VAmt 
                FROM RestaurantOrderDetailCur d
                JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
                WHERE h.OrderNumber = @orderNo AND d.StatusCode = 0
            `);
        voidQty = voidRes.recordset[0]?.VQty || 0;
        voidAmount = voidRes.recordset[0]?.VAmt || 0;
        console.log(`[SAVE SALE] Voids captured from DB: Qty=${voidQty}, Amt=${voidAmount}`);
    }

    const normalizedPayMode = normalizePayMode(paymentMethod);
    const payModeCode = normalizedPayMode === "CASH" ? 1 : normalizedPayMode === "CARD" ? 2 : 3;

    const headerResult = await transaction.request()
      .input("SettlementID", sql.UniqueIdentifier, settlementId)
      .input("LastSettlementDate", sql.DateTime, now)
      .input("SubTotal", sql.Money, subTotal || 0)
      .input("TotalTax", sql.Money, taxAmount || 0)
      .input("DiscountAmount", sql.Money, discountAmount || 0)
      .input("DiscountType", sql.NVarChar(50), discountType || "fixed")
      .input("BillNo", sql.NVarChar(50), displayOrderId)
      .input("OrderType", sql.NVarChar(50), orderType || "DINE-IN")
      .input("TableNo", sql.NVarChar(50), tableNo || null)
      .input("Section", sql.NVarChar(100), section || null)
      .input("MemberId", sql.UniqueIdentifier, toGuidOrNull(memberId))
      .input("CashierID", sql.UniqueIdentifier, toGuidOrNull(cashierId))
      .input("BusinessUnitId", sql.UniqueIdentifier, sanitizeGuid(businessUnitId))
      .input("SysAmount", sql.Money, totalAmount || 0)
      .input("ManualAmount", sql.Money, totalAmount || 0)
      .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
      .input("CreatedOn", sql.DateTime, now)
      .input("SER_NAME", sql.NVarChar(255), req.body.serverName || null)
      .input("MobileNo", sql.NVarChar(50), req.body.mobileNo || req.body.MobileNo || null)
      .input("VoidItemQty", sql.Int, voidQty)
      .input("VoidItemAmount", sql.Money, voidAmount)
      .input("RoundedBy", sql.Money, roundOff || 0)
      .input("ServiceCharge", sql.Money, req.body.serviceCharge || 0)
      .input("PayModeCode", sql.Int, payModeCode)
      .query(`
        -- 1. Insert into SettlementHeader
        INSERT INTO SettlementHeader (
          SettlementID, LastSettlementDate, SubTotal, TotalTax, DiscountAmount, DiscountType, 
          BillNo, OrderType, TableNo, Section, MemberId, CashierID, BusinessUnitId, 
          SysAmount, ManualAmount, CreatedBy, CreatedOn, SER_NAME, MobileNo, 
          VoidItemQty, VoidItemAmount, RoundedBy, ServiceCharge
        ) VALUES (
          @SettlementID, GETDATE(), @SubTotal, @TotalTax, @DiscountAmount, @DiscountType, 
          @BillNo, @OrderType, @TableNo, @Section, @MemberId, @CashierID, @BusinessUnitId, 
          @SysAmount, @ManualAmount, @CreatedBy, GETDATE(), @SER_NAME, @MobileNo, 
          @VoidItemQty, @VoidItemAmount, @RoundedBy, @ServiceCharge
        );

        -- 2. Insert into RestaurantInvoice (Perfect Sync)
        INSERT INTO RestaurantInvoice (
          BusinessUnitId, RestaurantBillId, OrderId, BillNumber, OrderDateTime, TimeBilled, 
          TotalLineItemAmount, TotalTax, DiscountAmount, TotalAmount, StatusCode, 
          CreatedBy, CreatedOn, InvoiceDate, ServiceCharge, RoundedBy, TotalAmountLessFreight,
          PaymentTermCode
        ) VALUES (
          @BusinessUnitId, @SettlementID, @SettlementID, @BillNo, GETDATE(), GETDATE(),
          @SubTotal, @TotalTax, @DiscountAmount, @SysAmount, 3,
          @CreatedBy, GETDATE(), CAST(GETDATE() AS DATE), @ServiceCharge, @RoundedBy, @SubTotal,
          @PayModeCode
        );
      `);

    // 3. Insert SettlementTotalSales
    const receiptCount = Array.isArray(items) ? items.filter(i => i.status !== "VOIDED").reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : 0;

      console.log(`[SAVE SALE] Step 3: Inserting Settlement Tables (ID: ${settlementId})...`);
      
      let settlementSql = `
        INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount);

        INSERT INTO [dbo].[SettlementDetail] (SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount, 0);

        INSERT INTO SettlementTranDetail (SettlementID, PayMode, CashIn, CashOut)
        VALUES (@SettlementID, @PayMode, @SysAmount, 0);
      `;

      if (normalizedPayMode === 'CREDIT') {
        settlementSql += `
          INSERT INTO SettlementCreditSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff);
        `;
      }

      if (Number(discountAmount) > 0) {
        settlementSql += `
          INSERT INTO SettlementDiscountDetail (SettlementId, DiscountId, Description, SysAmount, ManualAmount, SortageOrExces)
          VALUES (@SettlementID, @DiscountID, @DiscountDesc, @DiscAmount, @DiscAmount, 0);
        `;
      }

      const settlementReq = transaction.request()
        .input("SettlementID", sql.UniqueIdentifier, settlementId)
        .input("PayMode", sql.VarChar(50), normalizedPayMode)
        .input("SysAmount", sql.Money, totalAmount || 0)
        .input("ManualAmount", sql.Money, totalAmount || 0)
        .input("AmountDiff", sql.Money, 0)
        .input("ReceiptCount", sql.Numeric(18, 0), receiptCount);

      if (Number(discountAmount) > 0) {
        settlementReq.input("DiscountID", sql.UniqueIdentifier, DEFAULT_GUID)
          .input("DiscountDesc", sql.VarChar(255), String(discountType || "Fixed") + " Discount")
          .input("DiscAmount", sql.Money, discountAmount);
      }

      await settlementReq.query(settlementSql);
      console.log(`[SAVE SALE] Settlement tables updated successfully.`);

      if (items && Array.isArray(items)) {
        for (const item of items) {
          console.log(`[SAVE SALE] Step 4: Item [${item.dish_name || item.name}]...`);
          const dishId = toGuidOrNull(item.dishId || item.id);
          const dishMeta = await transaction.request()
            .input("DishId", sql.UniqueIdentifier, dishId)
            .input("DishName", sql.NVarChar(255), item.dish_name || item.name || "")
            .query(`
              SELECT TOP 1 d.DishId, d.DishGroupId, dg.CategoryId, cm.CategoryName, dg.DishGroupName
              FROM DishMaster d
              LEFT JOIN DishGroupMaster dg ON CAST(d.DishGroupId AS NVARCHAR(128)) = CAST(dg.DishGroupId AS NVARCHAR(128))
              LEFT JOIN CategoryMaster cm ON CAST(dg.CategoryId AS NVARCHAR(128)) = CAST(cm.CategoryId AS NVARCHAR(128))
              WHERE (@DishId IS NOT NULL AND d.DishId = @DishId)
                 OR (@DishId IS NULL AND LTRIM(RTRIM(LOWER(d.Name))) = LTRIM(RTRIM(LOWER(@DishName))))
            `);
          const meta = dishMeta.recordset[0] || {};
          await transaction.request()
            .input("SettlementID", sql.UniqueIdentifier, settlementId)
            .input("DishId", sql.UniqueIdentifier, toGuidOrNull(meta.DishId || dishId))
            .input("DishGroupId", sql.UniqueIdentifier, toGuidOrNull(meta.DishGroupId))
            .input("SubCategoryId", sql.UniqueIdentifier, toGuidOrNull(meta.DishGroupId))
            .input("CategoryId", sql.UniqueIdentifier, toGuidOrNull(meta.CategoryId))
            .input("DishName", sql.NVarChar(255), item.dish_name || item.name || "Unknown")
            .input("CategoryName", sql.NVarChar(255), meta.CategoryName || item.categoryName || "Unmapped")
            .input("SubCategoryName", sql.NVarChar(255), meta.DishGroupName || "Unmapped")
            .input("Qty", sql.Int, item.qty || 1)
            .input("Price", sql.Decimal(18, 2), item.price || 0)
            .input("Status", sql.NVarChar(50), item.status || "NORMAL")
            .input("Spicy", sql.NVarChar(50), item.spicy || "")
            .input("Salt", sql.NVarChar(50), item.salt || "")
            .input("Oil", sql.NVarChar(50), item.oil || "")
            .input("Sugar", sql.NVarChar(50), item.sugar || "")
            .input("OrderDateTime", sql.DateTime, new Date()).query(`
              INSERT INTO SettlementItemDetail (SettlementID, DishId, DishGroupId, SubCategoryId, CategoryId, DishName, Qty, Price, OrderDateTime, CategoryName, SubCategoryName, Status, Spicy, Salt, Oil, Sugar)
              VALUES (@SettlementID, @DishId, @DishGroupId, @SubCategoryId, @CategoryId, @DishName, @Qty, @Price, @OrderDateTime, @CategoryName, @SubCategoryName, @Status, @Spicy, @Salt, @Oil, @Sugar)
            `);
        }
      }

      // 4.5 Capture and Insert VOIDED items for reporting
      if (displayOrderId) {
        try {
          const dbVoids = await transaction.request()
            .input("orderNo", sql.NVarChar(100), displayOrderId)
            .query(`
              SELECT d.DishId, d.DishName, d.Quantity, d.PricePerUnit, dish.DishGroupId, dg.CategoryId, cm.CategoryName, dg.DishGroupName
              FROM RestaurantOrderDetailCur d
              JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
              LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
              LEFT JOIN DishGroupMaster dg ON dish.DishGroupId = dg.DishGroupId
              LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
              WHERE h.OrderNumber = @orderNo AND d.StatusCode = 0
            `);
          
          for (const v of dbVoids.recordset) {
            await transaction.request()
              .input("sid", sql.UniqueIdentifier, settlementId)
              .input("dishId", sql.UniqueIdentifier, v.DishId)
              .input("dishName", sql.NVarChar(255), v.DishName)
              .input("qty", sql.Int, v.Quantity)
              .input("price", sql.Decimal(18, 2), v.PricePerUnit)
              .input("catId", sql.UniqueIdentifier, v.CategoryId)
              .input("catName", sql.NVarChar(255), v.CategoryName)
              .input("groupName", sql.NVarChar(255), v.DishGroupName)
              .query(`
                INSERT INTO SettlementItemDetail (
                  SettlementID, DishId, DishName, Qty, Price, Status, OrderDateTime,
                  CategoryId, CategoryName, SubCategoryName
                ) VALUES (
                  @sid, @dishId, @dishName, @qty, @price, 'VOIDED', GETDATE(),
                  @catId, @catName, @groupName
                )
              `);
          }
          console.log(`[SAVE SALE] Captured ${dbVoids.recordset.length} voided items for reporting.`);
        } catch (voidErr) {
          console.error("⚠️ [SAVE SALE] Void capture failed:", voidErr.message);
        }
      }

        console.log(`[SAVE SALE] Step 5: Inserting PaymentDetailCur (PayMode: ${normalizedPayMode})...`);
        const paymodeRow = await transaction.request()
          .input("PayModeCode", sql.VarChar(50), normalizedPayMode)
          .query(`SELECT TOP 1 ISNULL(Position, 1) AS Position FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = @PayModeCode`);
        const paymodePosition = paymodeRow.recordset.length > 0 ? paymodeRow.recordset[0].Position : 1;

        await transaction.request()
          .input("PaymentId", sql.UniqueIdentifier, settlementId)
          .input("RestaurantBillId", sql.UniqueIdentifier, settlementId)
          .input("BilledFor", sql.Int, 1)
          .input("PaymentCollectedOn", sql.DateTime, new Date())
          .input("PaymentType", sql.Int, 1)
          .input("Paymode", sql.Int, paymodePosition)
          .input("Amount", sql.Decimal(18, 2), totalAmount || 0)
          .input("ReferenceNumber", sql.VarChar(100), null)
          .input("Remarks", sql.VarChar(500), paymentMethod || "")
          .input("BusinessUnitId", sql.UniqueIdentifier, sanitizeGuid(businessUnitId))
          .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
          .input("CreatedOn", sql.DateTime, new Date())
          .input("ModifiedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
          .input("ModifiedOn", sql.DateTime, new Date())
          .query(`
            INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
            VALUES (@PaymentId, @RestaurantBillId, @BilledFor, @PaymentCollectedOn, @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, @CreatedBy, @CreatedOn, @ModifiedBy, @ModifiedOn)
          `);
        console.log(`[SAVE SALE] PaymentDetailCur success.`);

      if (memberId && (paymentMethod || "").toUpperCase() === "CREDIT") {
        await transaction.request()
          .input("MemberId", memberId)
          .input("Amount", totalAmount || 0)
          .query(`UPDATE MemberMaster SET CurrentBalance = CurrentBalance + @Amount WHERE MemberId = @MemberId`);
      }

      // 🚀 PROFESSIONAL ARCHIVE: Move from Cur to History
      if (displayOrderId) {
        try {
          await transaction.request()
            .input("orderNo", sql.NVarChar(50), displayOrderId)
            .query(`
              -- Move Header (History)
              INSERT INTO RestaurantOrder (OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, CreatedBy, CreatedOn, MobileNo, BusinessUnitId, isOrderClosed)
              SELECT OrderId, OrderNumber, OrderDateTime, Tableno, 3, CreatedBy, CreatedOn, MobileNo, BusinessUnitId, 1
              FROM RestaurantOrderCur WHERE OrderNumber = @orderNo;

              -- Move Details (History) with safety for Discount columns
              INSERT INTO RestaurantOrderDetail (
                OrderDetailId, OrderId, DishId, Description, DishName, Quantity, PricePerUnit, 
                ActualAmount, TotalDetailLineAmount, StatusCode, CreatedBy, CreatedOn, 
                BusinessUnitId, OrderDateTime, Spicy, Salt, Oil, Sugar, Remarks, 
                OrderConfirmQty, VoidReason, DiscountAmount, DiscountType
              )
              SELECT 
                OrderDetailId, OrderId, DishId, Description, DishName, Quantity, PricePerUnit, 
                ActualAmount, TotalDetailLineAmount, StatusCode, CreatedBy, CreatedOn, 
                BusinessUnitId, OrderDateTime, Spicy, Salt, Oil, Sugar, Remarks, 
                OrderConfirmQty, VoidReason, 
                ISNULL(DiscountAmount, 0), ISNULL(DiscountType, 'fixed')
              FROM RestaurantOrderDetailCur 
              WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo);

              -- Move Modifiers (History)
              INSERT INTO Restaurantmodifierdetail (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, Description, CreatedBy, CreatedOn)
              SELECT OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, ModifierName, CreatedBy, CreatedOn
              FROM RestaurantmodifierdetailCur WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo);

              -- Delete from Cur tables
              DELETE FROM RestaurantmodifierdetailCur WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo);
              DELETE FROM RestaurantOrderDetailCur WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo);
              DELETE FROM RestaurantOrderCur WHERE OrderNumber = @orderNo;
            `);
          console.log(`[SAVE SALE] Professional Archive complete for ${displayOrderId}`);
        } catch (archiveErr) {
          // Log but don't fail the whole transaction if archiving fails
          // This ensures the payment and main settlement are at least saved
          console.error("⚠️ [SAVE SALE] Professional Archive failed:", archiveErr.message);
        }
      }

      // 4. Cleanup Table & Cart on success
      if (tableId) {
        const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();
        console.log(`[SAVE SALE] Cleaning up table: ${cleanTableId}`);
        
        await transaction.request()
          .input("cartId", sql.NVarChar(128), cleanTableId)
          .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");
          
        await transaction.request()
          .input("tid", sql.NVarChar(128), cleanTableId)
          .query("UPDATE [dbo].[TableMaster] SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL WHERE TableId = @tid");

        const io = req.app.get("io");
        if (io) {
          io.emit("table_status_updated", { tableId: cleanTableId, status: 0, totalAmount: 0 });
          io.emit("cart_updated", { tableId: cleanTableId });
          io.emit("order_closed", { tableId: cleanTableId, tableNo: tableNo, orderId: displayOrderId });
        }

        // 🚀 GLOBAL KDS SYNC: Mark order as closed in professional tables
        await transaction.request()
          .input("orderNo", sql.NVarChar(50), displayOrderId)
          .query("UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() WHERE OrderNumber = @orderNo");
      }

      // 5. Track in servermaster (Waiter History)
      if (serverId) {
        try {
          await transaction.request()
            .input("SER_ID", sql.Int, serverId)
            .input("SER_NAME", sql.NVarChar(255), serverName)
            .input("TableNo", sql.NVarChar(50), tableNo || null)
            .input("OrderId", sql.NVarChar(50), displayOrderId)
            .input("Section", sql.NVarChar(100), section || null)
            .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
            .query(`
              INSERT INTO servermaster (SER_ID, SER_NAME, TableNo, OrderId, Section, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
              VALUES (@SER_ID, @SER_NAME, @TableNo, @OrderId, @Section, @CreatedBy, GETDATE(), @CreatedBy, GETDATE())
            `);
        } catch (serverErr) {
          console.error("⚠️ [SAVE SALE] servermaster insert failed:", serverErr.message);
        }
      }

      await transaction.commit();
      
      res.json({ success: true, settlementId, billNo: displayOrderId, orderId: displayOrderId });
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("SAVE SALE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= VALIDATION ================= */
router.get("/orders/check/:orderId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("OrderId", req.params.orderId)
      .query("SELECT SettlementID FROM SettlementHeader WHERE OrderId = @OrderId AND IsCancelled = 0");
    res.json({ exists: result.recordset.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orders/validate-cancel", async (req, res) => {
    try {
      const { settlementId } = req.body;
      const pool = await poolPromise;
      
      const result = await pool.request()
        .input("Id", settlementId)
        .query("SELECT IsCancelled FROM SettlementHeader WHERE SettlementID = @Id");
      
      if (result.recordset.length === 0) return res.status(404).json({ valid: false, message: "Order not found" });
      if (result.recordset[0].IsCancelled) return res.status(400).json({ valid: false, message: "Order is already cancelled" });
      
      res.json({ valid: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

router.get("/payment-history", async (req, res) => {
    try {
      const pool = await poolPromise;
      const limit = parseInt(req.query.limit) || 50;
      const result = await pool.request().input("Limit", sql.Int, limit).query(`
        SELECT TOP (@Limit) CAST(pdc.PaymentId AS VARCHAR(50)) as paymentId,
        CONVERT(VARCHAR(23), pdc.PaymentCollectedOn, 126) as paymentCollectedOn,
        ISNULL(pdc.Amount, 0) as amount, ISNULL(pm.Description, '') as payModeDescription
        FROM [dbo].[PaymentDetailCur] pdc
        LEFT JOIN [dbo].[Paymode] pm ON pm.Position = pdc.Paymode
        ORDER BY pdc.PaymentCollectedOn DESC
      `);
      res.json(result.recordset || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

router.get("/payment-methods", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT PayMode as payMode, Description as description, Position FROM [dbo].[Paymode] WHERE Active = 1 ORDER BY Position ASC
      `);
      res.json(result.recordset || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

router.get("/payment-detail/:payMode", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input("PayMode", req.params.payMode)
        .query("SELECT * FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = @PayMode AND Active = 1");
      res.json(result.recordset[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

/**
 * Generate comprehensive consolidated sales report PDF
 * Supports daily, weekly, monthly, yearly filters
 */
router.get("/consolidated-report/pdf", async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const filter = normalizeReportFilter(req.query.filter || 'daily');
    const date = req.query.date;
    const dateWhereClause = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);

    // Aggregate all settlement data
    const aggregateResult = await pool.request().query(`
      SELECT
        COUNT(DISTINCT sh.SettlementID) as totalOrders,
        SUM(CAST(ISNULL(sid.Qty, 0) AS DECIMAL(18,2))) as totalItems,
        SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS DECIMAL(18,2))) as netSales,
        SUM(CAST(ISNULL(sh.ServiceCharge, 0) AS DECIMAL(18,2))) as serviceCharge,
        SUM(CAST(ISNULL(sts.GSTAmount, 0) AS DECIMAL(18,2))) as taxCollected,
        SUM(CAST(ISNULL(sh.RoundedBy, 0) AS DECIMAL(18,2))) as roundedBy,
        SUM(CAST(ISNULL(sts.SysAmount, 0) AS DECIMAL(18,2))) as totalSales,
        SUM(CAST(ISNULL(sh.VoidItemQty, 0) AS INT)) as voidQty,
        SUM(CAST(ISNULL(sh.VoidItemAmount, 0) AS DECIMAL(18,2))) as voidAmount,
        ISNULL(SUM(CAST(ISNULL(sts.DiscountAmount, 0) AS DECIMAL(18,2))), 0) as totalDiscount
      FROM SettlementHeader sh
      LEFT JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      WHERE ${dateWhereClause}
    `);

    const aggregateData = aggregateResult.recordset[0] || {};

    // Get payment breakdown
    const paymentResult = await pool.request().query(`
      SELECT
        ${normalizeReportPayModeSql("sts.PayMode")} as PayMode,
        SUM(CAST(ISNULL(sts.SysAmount, 0) AS DECIMAL(18,2))) as Amount
      FROM SettlementHeader sh
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      WHERE ${dateWhereClause}
      GROUP BY ${normalizeReportPayModeSql("sts.PayMode")}
    `);

    const paymentBreakdown = {};
    if (paymentResult.recordset && paymentResult.recordset.length > 0) {
      paymentResult.recordset.forEach(row => {
        const payMode = String(row.PayMode || 'CASH').trim().toUpperCase();
        paymentBreakdown[payMode] = Number(row.Amount || 0);
      });
    }

    // Calculate total revenue
    const totalRevenue = 
      Number(aggregateData.netSales || 0) + 
      Number(aggregateData.serviceCharge || 0) + 
      Number(aggregateData.taxCollected || 0) + 
      Number(aggregateData.roundedBy || 0);

    // Format period string
    let periodStr = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    if (filter === 'daily') {
      periodStr = todayStr;
    } else if (filter === 'weekly') {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      periodStr = `${weekStartStr} to ${todayStr}`;
    } else if (filter === 'monthly') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      periodStr = `${monthStartStr} to ${todayStr}`;
    } else if (filter === 'yearly') {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearStartStr = yearStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      periodStr = `${yearStartStr} to ${todayStr}`;
    }

    // Prepare report data for PDF generation
    const reportData = {
      companyName: 'AL-HAZIMA RESTAURANT PTE LTD',
      companyAddress: 'No 6 Chiming Glen Rasta Road, SINGAPORE 589729',
      companyPhone: '+65 6840000',
      period: periodStr,
      netSales: Number(aggregateData.netSales || 0),
      serviceCharge: Number(aggregateData.serviceCharge || 0),
      taxCollected: Number(aggregateData.taxCollected || 0),
      roundedBy: Number(aggregateData.roundedBy || 0),
      totalRevenue: totalRevenue,
      totalSales: Number(aggregateData.totalSales || 0),
      totalOrders: Number(aggregateData.totalOrders || 0),
      totalItems: Number(aggregateData.totalItems || 0),
      voidQty: Number(aggregateData.voidQty || 0),
      voidAmount: Number(aggregateData.voidAmount || 0),
      totalDiscount: Number(aggregateData.totalDiscount || 0),
      paymentBreakdown: paymentBreakdown,
      currencySymbol: '$'
    };

    // Use the new PDF generator
    const { generateSalesReportPdf, createPdfBinary } = require('../utils/pdfReportGenerator');
    const docDef = generateSalesReportPdf(reportData);
    const pdfBuffer = await createPdfBinary(docDef);

    const filename = `Consolidated_Sales_Report_${filter}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[SALES/consolidated-report] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate report PDF', details: err.message });
  }
});

module.exports = router;
