const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

const NOTE_KEYS = ["note", "Note", "notes", "Notes", "remarks", "Remarks"];
const TAKEAWAY_KEYS = ["isTakeaway", "IsTakeaway", "isTakeAway", "IsTakeAway"];
const SPICY_KEYS = ["spicy", "Spicy"];
const SALT_KEYS = ["salt", "Salt"];
const OIL_KEYS = ["oil", "Oil"];
const SUGAR_KEYS = ["sugar", "Sugar"];
 
const toGuidOrNull = (value) => {
  if (!value) return null;
  const s = String(value).trim().replace(/^\{|\}$/g, "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
};

function resolveItemTextField(item = {}, keys = []) {
  const itemKeys = Object.keys(item || {});
  for (const k of keys) {
    const actualKey = itemKeys.find(ik => ik.toLowerCase() === k.toLowerCase());
    if (actualKey !== undefined) {
      const raw = item[actualKey];
      if (raw !== undefined && raw !== null) return { hasExplicitValue: true, value: String(raw) };
    }
  }
  return { hasExplicitValue: false, value: "" };
}

function resolveItemNote(item = {}) { return resolveItemTextField(item, NOTE_KEYS); }
function resolveItemTakeaway(item = {}) {
  const result = resolveItemTextField(item, TAKEAWAY_KEYS);
  const val = result.value.toLowerCase();
  return { 
    hasExplicitTakeaway: result.hasExplicitValue, 
    value: result.hasExplicitValue ? (val === "true" || val === "1") : false 
  };
}

/**
 * Get or Generate Order ID for a table
 * Returns existing ID if table is active, otherwise generates a new one.
 */
let cachedBusinessUnitId = null;

async function getOrGenerateOrderId(req, tableId) {
  const pool = await poolPromise;
  const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
  if (!tableId || tableId === "undefined" || tableId === "null") return "NEW";

  try {
    // 1. GHOST CLEANUP: Force close any stale open orders for this table first
    // 🛡️ Fail-safe: Wrap in nested try to prevent crashing if DB is busy
    try {
      await pool.request()
        .input("tid", sql.UniqueIdentifier, cleanId)
        .query(`
          DECLARE @TableNo VARCHAR(20), @CurrentOID NVARCHAR(50);
          SELECT @TableNo = LTRIM(RTRIM(TableNumber)), @CurrentOID = CurrentOrderId FROM TableMaster WHERE TableId = @tid;

          IF @TableNo IS NOT NULL
          BEGIN
            UPDATE RestaurantOrderCur 
            SET isOrderClosed = 1, ModifiedOn = GETDATE() 
            WHERE LTRIM(RTRIM(Tableno)) = @TableNo 
            AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
            AND (OrderNumber <> @CurrentOID OR @CurrentOID IS NULL);
          END
        `);
    } catch (cleanupErr) {
      console.warn("⚠️ [Cart] Ghost cleanup non-critical failure:", cleanupErr.message);
    }

    // 2. Instant check for existing ID
    const quickCheck = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");
    
    let existingId = quickCheck.recordset[0]?.CurrentOrderId;
    if (existingId && existingId !== "NEW" && existingId !== "#NEW" && !existingId.startsWith("TEMP-") && existingId.length > 5) {
      console.log(`✅ [Cart] Reusing existing OrderID: ${existingId}`);
      return existingId;
    }

    // 2. Optimized Business Unit ID Retrieval (Cached)
    if (!cachedBusinessUnitId) {
      const bizRow = await pool.request().query("SELECT TOP 1 BusinessUnitId FROM [dbo].[RestaurantOrderCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'");
      cachedBusinessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;
    }

    const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const todayStr = istDate.toISOString().split('T')[0];
    const datePrefix = todayStr.replace(/-/g, '');
    
    let dailySequence = 1;
    
    // 3. ATOMIC ATTEMPT: Use MERGE or Transaction for Sequence
    const seqResult = await pool.request()
      .input("RestId", sql.UniqueIdentifier, String(cachedBusinessUnitId))
      .input("Today", sql.Date, todayStr)
      .query(`
        BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM OrderSequences WHERE RestaurantId = @RestId AND SequenceDate = @Today)
        BEGIN
            INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber) VALUES (@RestId, @Today, 0);
        END
        UPDATE OrderSequences SET LastNumber = LastNumber + 1 OUTPUT INSERTED.LastNumber
        WHERE RestaurantId = @RestId AND SequenceDate = @Today;
        COMMIT TRANSACTION;
      `);
    
    dailySequence = seqResult.recordset[0]?.LastNumber || 1;

    const displayOrderId = `${datePrefix}-${String(dailySequence).padStart(4, '0')}`;
    
    // 4. Atomic Update of Table Status
    await pool.request()
      .input("tid", sql.VarChar(50), cleanId)
      .input("oid", sql.NVarChar(50), displayOrderId)
      .query("UPDATE TableMaster SET CurrentOrderId = @oid, StartTime = ISNULL(StartTime, GETDATE()) WHERE TableId = @tid");
    
    return displayOrderId;
  } catch (err) { 
    console.error("🔥 [Critical] OrderID Generation Failed:", err.message);
    // FALLBACK: Use count as emergency instead of returning "NEW"
    const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const datePrefix = istDate.toISOString().split('T')[0].replace(/-/g, '');
    const countRes = await pool.request().query(`SELECT (COUNT(*) + 1) as LastNumber FROM RestaurantOrderCur WHERE OrderNumber LIKE '${datePrefix}%'`);
    const emergencySeq = countRes.recordset[0]?.LastNumber || 1;
    return `${datePrefix}-EM${String(emergencySeq).padStart(3, '0')}`;
  }
}

/**
 * Professional Table Sync Helper
 * Syncs CartItems to RestaurantOrderCur and RestaurantOrderDetailCur
 */
async function syncToProfessionalTables(transaction, tableId, displayOrderId, items, userId) {
  const isTakeaway = (!tableId || tableId === "undefined" || tableId === "null");
  const cleanTableId = isTakeaway ? null : String(tableId).replace(/^\{|\}$/g, "").trim();
  const cleanOrderNo = String(displayOrderId || "PENDING").replace(/^\{|\}$/g, "").trim();

  // 🚀 OPTIMIZATION 1: Combined Initial Lookups (TableNo, BizId, OrderHeader)
  const initRes = await transaction.request()
    .input("orderNo", sql.NVarChar(50), cleanOrderNo)
    .input("tableId", sql.VarChar(50), cleanTableId)
    .query(`
      DECLARE @ActualTableNo VARCHAR(20) = 'TAKEAWAY';
      IF @tableId IS NOT NULL 
        SELECT TOP 1 @ActualTableNo = LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tableId;

      -- 🛡️ SHIELD: Find the DEFINITIVE active order for this table/number
      SELECT TOP 1 OrderId, Tableno, BusinessUnitId, OrderNumber
      FROM RestaurantOrderCur WITH (UPDLOCK)
      WHERE OrderNumber = @orderNo 
      OR (LTRIM(RTRIM(Tableno)) = @ActualTableNo AND (isOrderClosed = 0 OR isOrderClosed IS NULL)) 
      ORDER BY 
        CASE WHEN OrderNumber = @orderNo THEN 0 ELSE 1 END,
        CreatedOn DESC;

      SELECT TOP 1 BusinessUnitId FROM [dbo].[RestaurantOrderCur] 
      WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000';
      
      SELECT @ActualTableNo as ActualTableNo;
    `);

  const header = initRes.recordsets[0][0];
  const bizId = initRes.recordsets[1][0]?.BusinessUnitId || DEFAULT_GUID;
  const actualTableNo = initRes.recordsets[2][0]?.ActualTableNo || "TAKEAWAY";

  let orderGuid;
  let finalUserId = userId;
  if (!finalUserId || finalUserId.length < 10) finalUserId = DEFAULT_GUID;

  if (header) {
    orderGuid = header.OrderId;
    await transaction.request()
      .input("orderId", sql.UniqueIdentifier, orderGuid)
      .input("orderNo", sql.NVarChar(50), cleanOrderNo)
      .query(`
        UPDATE RestaurantOrderCur 
        SET OrderNumber = @orderNo 
        WHERE OrderId = @orderId 
        AND (OrderNumber IS NULL OR OrderNumber = '' OR OrderNumber = 'PENDING' OR OrderNumber = 'NEW' OR OrderNumber = '#NEW' OR OrderNumber LIKE 'TEMP-%')
      `);
  } else {
    orderGuid = require("crypto").randomUUID();
    await transaction.request()
      .input("orderId", sql.UniqueIdentifier, orderGuid)
      .input("orderNo", sql.NVarChar(50), cleanOrderNo)
      .input("tableNo", sql.VarChar(20), actualTableNo)
      .input("userId", sql.UniqueIdentifier, finalUserId)
      .input("bizId", sql.UniqueIdentifier, bizId)
      .query("INSERT INTO RestaurantOrderCur (OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, CreatedBy, CreatedOn, isOrderClosed, BusinessUnitId) VALUES (@orderId, @orderNo, GETDATE(), @tableNo, 1, @userId, GETDATE(), 0, @bizId)");
  }

  // 🛡️ GHOST SHIELD: Force-close any OTHER open orders for the same table number to prevent "popping" items.
  if (actualTableNo && actualTableNo !== 'undefined') {
    await transaction.request()
      .input("orderGuid", sql.UniqueIdentifier, orderGuid)
      .input("tableNo", sql.VarChar(20), actualTableNo)
      .query(`
        UPDATE RestaurantOrderCur 
        SET isOrderClosed = 1, ModifiedOn = GETDATE() 
        WHERE LTRIM(RTRIM(Tableno)) = @tableNo 
        AND (isOrderClosed = 0 OR isOrderClosed IS NULL) 
        AND OrderId <> @orderGuid
      `);
  }

  // 🚀 OPTIMIZATION 2: Batch Item Processing
  // Instead of per-item queries, we build a single SQL command with multiple statements
  const itemRequest = transaction.request();
  itemRequest.input("orderId", sql.VarChar(50), orderGuid);
  itemRequest.input("userId", sql.VarChar(50), finalUserId);
  itemRequest.input("bizId", sql.VarChar(50), bizId);
  itemRequest.input("orderNo", sql.NVarChar(100), cleanOrderNo);

  let batchSql = "";
  const statusCodes = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };

  items.forEach((item, idx) => {
    const cleanProdId = String(item.id || item.ProductId || DEFAULT_GUID).replace(/^\{|\}$/g, "").trim();
    const finalProdId = cleanProdId.length < 10 ? DEFAULT_GUID : cleanProdId;
    const lineItemId = (item.lineItemId && item.lineItemId.length > 10) ? item.lineItemId : require("crypto").randomUUID();
    const currentStatusCode = statusCodes[item.status || item.Status] || 2;
    const dishName = (item.name || item.ProductName || 'Dish').substring(0, 200);
    const unitPrice = item.price || item.Cost || 0;
    const noteInfo = resolveItemNote(item);
    const takeawayInfo = resolveItemTakeaway(item);
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    const modsJSON = JSON.stringify(modifiers);

    const p_id = `id${idx}`, p_dish = `dish${idx}`, p_qty = `qty${idx}`, p_cost = `cost${idx}`, 
          p_status = `st${idx}`, p_name = `name${idx}`, p_note = `note${idx}`, p_mods = `mods${idx}`, 
          p_tw = `tw${idx}`;

    itemRequest.input(p_id, sql.VarChar(50), lineItemId);
    itemRequest.input(p_dish, sql.VarChar(50), finalProdId);
    itemRequest.input(p_qty, sql.Int, item.qty || 1);
    itemRequest.input(p_cost, sql.Decimal(18, 2), unitPrice);
    itemRequest.input(p_status, sql.Int, currentStatusCode);
    itemRequest.input(p_name, sql.NVarChar(200), dishName);
    itemRequest.input(p_note, sql.NVarChar(300), noteInfo.value);
    itemRequest.input(p_mods, sql.NVarChar(sql.MAX), modsJSON);
    itemRequest.input(p_tw, sql.Bit, takeawayInfo.value ? 1 : 0);

    batchSql += `
      -- Process Item ${idx}
      IF EXISTS (SELECT 1 FROM RestaurantOrderDetailCur WHERE OrderDetailId = @${p_id})
      BEGIN
        UPDATE RestaurantOrderDetailCur SET 
          Quantity = @${p_qty}, PricePerUnit = @${p_cost}, ActualAmount = @${p_cost} * @${p_qty}, 
          TotalDetailLineAmount = @${p_cost} * @${p_qty}, 
          StatusCode = CASE WHEN @${p_status} = 0 THEN 0 ELSE (CASE WHEN @${p_status} > StatusCode THEN @${p_status} ELSE StatusCode END) END, 
          Description = @${p_name}, DishName = @${p_name}, ModifiedBy = @userId, ModifiedOn = GETDATE(), 
          ModifiersJSON = @${p_mods}, OrderNumber = @orderNo, Remarks = @${p_note}, isTakeAway = @${p_tw} 
        WHERE OrderDetailId = @${p_id};
      END
      ELSE
      BEGIN
        INSERT INTO RestaurantOrderDetailCur (OrderDetailId, OrderId, DishId, Description, DishName, Quantity, PricePerUnit, ActualAmount, TotalDetailLineAmount, StatusCode, CreatedBy, CreatedOn, ModifiersJSON, OrderNumber, Remarks, isTakeAway, BusinessUnitId, OrderDateTime)
        VALUES (@${p_id}, @orderId, @${p_dish}, @${p_name}, @${p_name}, @${p_qty}, @${p_cost}, @${p_cost} * @${p_qty}, @${p_cost} * @${p_qty}, @${p_status}, @userId, GETDATE(), @${p_mods}, @orderNo, @${p_note}, @${p_tw}, @bizId, GETDATE());
      END

      -- Sync Modifiers for Item ${idx}
      DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @${p_id};
    `;

    const modItems = [...modifiers];
    if (noteInfo.value) modItems.push({ ModifierId: '00000000-0000-0000-0000-000000000001', ModifierName: "INSTR: " + noteInfo.value, Price: 0, qty: item.qty || 1 });
    
    if (modItems.length > 0) {
      batchSql += `INSERT INTO RestaurantmodifierdetailCur (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, CreatedBy, CreatedOn) VALUES `;
      modItems.forEach((mod, midx) => {
        const pm_id = `mId${idx}_${midx}`, pm_qty = `mQty${idx}_${midx}`, pm_amt = `mAmt${idx}_${midx}`, pm_name = `mName${idx}_${midx}`;
        
        // 🛡️ SAFE GUID: Ensure we have a valid-looking GUID or use a dummy
        const safeModId = (mod.ModifierId && mod.ModifierId.length > 30) 
          ? mod.ModifierId 
          : '00000000-0000-0000-0000-000000000001';

        itemRequest.input(pm_id, sql.VarChar(50), safeModId);
        itemRequest.input(pm_qty, sql.Int, mod.qty || 1);
        itemRequest.input(pm_amt, sql.Decimal(18, 2), mod.Price || 0);
        itemRequest.input(pm_name, sql.NVarChar(800), (mod.ModifierName || "").substring(0, 800));
        batchSql += `(@${p_id}, @orderId, @${p_dish}, @${pm_id}, @${pm_qty}, @${pm_amt}, @${pm_name}, @userId, GETDATE())${midx === modItems.length - 1 ? ";" : ","}`;
      });
    }
  });

  // 🚀 OPTIMIZATION 3: Smart Removal in the same batch
  const incomingIds = items.map(i => i.lineItemId).filter(id => !!id && id.length > 5);
  const idList = incomingIds.length > 0 ? incomingIds.map(id => `'${id}'`).join(',') : "''";

  console.log(`[DB] Syncing Order ${cleanOrderNo} (${orderGuid}): Processing ${items.length} items, keeping ${incomingIds.length} IDs.`);

  batchSql += `
    -- Smart Removal: Delete unsent items that are no longer in the cart
    DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId IN (SELECT OrderDetailId FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode = 1 AND OrderDetailId NOT IN (${idList}));
    DELETE FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode = 1 AND OrderDetailId NOT IN (${idList});
    
    -- Smart Void: Void sent items that were removed (not common for unsent cart but for safety)
    UPDATE RestaurantOrderDetailCur SET StatusCode = 0, ModifiedBy = @userId, ModifiedOn = GETDATE() 
    WHERE OrderId = @orderId AND StatusCode NOT IN (0, 1) AND OrderDetailId NOT IN (${idList});

    -- Final Header Total Update
    UPDATE RestaurantOrderCur SET TotalAmount = (SELECT ISNULL(SUM(ActualAmount), 0) FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode <> 0) WHERE OrderId = @orderId;
  `;

  if (batchSql || items.length === 0) {
    if (items.length === 0) console.log(`[DB] CLEARING ALL UNSENT for Order ${cleanOrderNo}`);
    await itemRequest.query(batchSql);
  }
}

async function syncTableStatus(req, tableId) {
  if (!tableId || tableId === "undefined" || tableId === "null") return null;
  const pool = await poolPromise;
  const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
  const res = await pool.request().input("tid", sql.VarChar(50), cleanId).query(`
    DECLARE @ActualOrderId UNIQUEIDENTIFIER, @ActualOrderNo NVARCHAR(50), @TableNo VARCHAR(20), @count INT, @total DECIMAL(18,2);
    
    SELECT TOP 1 @TableNo = LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tid;

    SELECT TOP 1 @ActualOrderId = OrderId, @ActualOrderNo = OrderNumber
    FROM RestaurantOrderCur 
    WHERE LTRIM(RTRIM(Tableno)) = @TableNo
    AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
    ORDER BY CreatedOn DESC;

    -- Calculate Totals strictly
    SELECT @count = COUNT(*), @total = ISNULL(SUM(ActualAmount), 0) 
    FROM RestaurantOrderDetailCur 
    WHERE OrderId = @ActualOrderId AND StatusCode <> 0;

    -- 🛡️ SHIELD 1: ATOMIC SYNC - If no items, force close the order to prevent ghosts
    IF @count = 0 AND @ActualOrderId IS NOT NULL
    BEGIN
        UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() WHERE OrderId = @ActualOrderId;
        SET @ActualOrderNo = NULL;
    END

    -- Update TableMaster with DEFINITIVE state
    UPDATE TableMaster 
    SET Status = CASE 
        WHEN Status = 2 THEN 2 
        WHEN Status = 3 THEN 3
        WHEN @count > 0 THEN 1 
        ELSE 0 
    END, 
        TotalAmount = @total, 
        StartTime = CASE 
                         -- 🚀 NEW ORDER RESET: If the Order ID is changing, reset the timer to fresh
                         WHEN @ActualOrderNo IS NOT NULL AND @ActualOrderNo <> ISNULL(CurrentOrderId, '') THEN GETDATE()
                         -- INITIAL SET: If it was NULL/Invalid and we now have items
                         WHEN (@count > 0 OR Status IN (2, 3)) AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
                         -- Strictly CLEAR StartTime if table is becoming Available
                         WHEN @count = 0 AND Status NOT IN (2, 3) THEN NULL 
                         ELSE StartTime 
                    END,
        CurrentOrderId = @ActualOrderNo,
        ModifiedOn = GETDATE()
    WHERE TableId = @tid;

    SELECT 
      Status, TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime, 
      CurrentOrderId, TableNumber as tableNo, DiningSection as section,
      CASE 
        WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
        ELSE 0 
      END AS isOvertime,
      CASE 
        WHEN Status = 3 AND ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, ModifiedOn, GETDATE()) >= ISNULL((SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings), 30) THEN 1 
        ELSE 0 
      END AS isHoldOvertime,
      CONVERT(VARCHAR, ModifiedOn, 126) as ModifiedOn
    FROM TableMaster WHERE TableId = @tid;
  `);

  const updated = res.recordset[0];
  const now = Date.now();
  console.log(`[TRACE] [${now}] [TABLE_STATUS_UPDATE] Table: ${tableId} | Status: ${updated?.Status} | Total: ${updated?.TotalAmount}`);
  if (updated) {
    const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
    const cleanOrderId = updated.CurrentOrderId || "EMPTY";
    
    console.log(`[TRACE] [${Date.now()}] [SOCKET_EMIT] table_status_updated | Table: ${cleanId} | Status: ${updated.Status}`);
    req.app.get("io")?.emit("table_status_updated", { 
      tableId: cleanId.toLowerCase(), 
      status: Number(updated.Status),
      totalAmount: Number(updated.TotalAmount) || 0,
      startTime: updated.StartTime,
      currentOrderId: cleanOrderId,
      tableNo: updated.tableNo,
      section: sectionMap[String(updated.section)] || updated.section,
      modifiedOn: updated.ModifiedOn,
      isOvertime: updated.isOvertime || 0,
      isHoldOvertime: updated.isHoldOvertime || 0
    });
  }
  return updated;
}

// Routes
router.post("/save-cart", async (req, res) => {
  try {
    const { tableId, items, userId, orderId, lastUpdate, version } = req.body;
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    const now = Date.now();

    console.log(`[TRACE] [${now}] [SAVE-CART] Table: ${cleanId} | Items: ${items?.length || 0} | Version: ${version || 'NONE'} | Update: ${lastUpdate || 'NONE'}`);
    
    // 🚀 UNIFIED ID: Only generate a professional ID if we actually have items to save
    // 🚀 UNIFIED ID: Use existing orderId if available, even for empty carts
    let currentOrderId = orderId;
    const hasItems = items && items.length > 0;

    if (hasItems && (!currentOrderId || currentOrderId === "NEW" || currentOrderId === "#NEW" || currentOrderId === "PENDING" || currentOrderId.length < 10)) {
      currentOrderId = await getOrGenerateOrderId(req, cleanId);
    } else if (!hasItems) {
      // 🚀 NUCLEAR CLEAR: If saving an empty cart, we should clear EVERY open order for this table
      // and reset the table status completely to prevent ghosts.
      console.log(`[TRACE] [${now}] [SAVE-CART] NUCLEAR CLEAR for Table ${cleanId}`);
      await pool.request()
        .input("tid", sql.VarChar(50), cleanId)
        .query(`
          DECLARE @TableNo VARCHAR(20);
          SELECT TOP 1 @TableNo = LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tid;

          IF @TableNo IS NOT NULL
          BEGIN
            -- Delete all unsent items for ALL open orders on this table
            DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId IN (
              SELECT OrderDetailId FROM RestaurantOrderDetailCur WHERE OrderId IN (
                SELECT OrderId FROM RestaurantOrderCur WHERE LTRIM(RTRIM(Tableno)) = @TableNo AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
              ) AND StatusCode = 1
            );
            DELETE FROM RestaurantOrderDetailCur WHERE OrderId IN (
              SELECT OrderId FROM RestaurantOrderCur WHERE LTRIM(RTRIM(Tableno)) = @TableNo AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
            ) AND StatusCode = 1;

            -- Force close all orders
            UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() 
            WHERE LTRIM(RTRIM(Tableno)) = @TableNo AND (isOrderClosed = 0 OR isOrderClosed IS NULL);
          END

          -- Reset table status
          UPDATE TableMaster SET Status = 0, CurrentOrderId = NULL, StartTime = NULL WHERE TableId = @tid;
        `);
      currentOrderId = null;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 🚀 ALWAYS SYNC: Even if items is empty, we need to run syncToProfessionalTables 
      // to ensure any existing items in the DB are voided/cleaned up.
      await syncToProfessionalTables(transaction, cleanId, currentOrderId, items || [], userId);
      
      // 🚀 CRITICAL: Update TableMaster INSIDE the same transaction 
      await transaction.request()
        .input("tid", sql.VarChar(50), cleanId)
        .input("oid", sql.NVarChar(50), currentOrderId)
        .query(`
          UPDATE TableMaster 
          SET Status = CASE WHEN @oid IS NOT NULL THEN 1 ELSE 0 END, 
              CurrentOrderId = @oid,
              StartTime = CASE WHEN @oid IS NOT NULL AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
                               WHEN @oid IS NULL THEN NULL 
                               ELSE StartTime END
          WHERE TableId = @tid
        `);

      await transaction.commit();
      
      res.json({ success: true, orderId: currentOrderId });
      
      // 🔥 LIVE SYNC: Notify all other devices that this table's cart has changed
      const io = req.app.get("io");
      if (io) {
        io.emit("cart_updated", { tableId: cleanId.toLowerCase(), orderId: currentOrderId });
      }

      syncTableStatus(req, cleanId).catch(() => {});
    } catch (e) { 
      if (transaction._isStarted) await transaction.rollback(); 
      console.error("❌ SaveCart SQL Error:", e.message);
      res.status(500).json({ error: "DB_ERROR: " + e.message }); 
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/send", async (req, res) => {
  try {
    const { tableId, orderId, items, userId } = req.body;
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. 🚀 GENERATE PROFESSIONAL ID NOW (At the moment of sending)
      const finalOrderId = await getOrGenerateOrderId(req, cleanId);

      // 2. FORCE SENT STATUS — use items from client, or fall back to DB items
      let clientItems = items || [];
      if (clientItems.length === 0) {
        // 🔥 SAFETY NET: Frontend forgot to send items. Fetch from DB.
        console.warn("⚠️ [Send] No items received from client - fetching from DB as fallback");
        const dbItems = await pool.request()
          .input("tableNo", sql.VarChar(20), cleanId)
          .query(`SELECT 
            d.OrderDetailId as lineItemId, d.DishId as id, dish.Name as name,
            d.Quantity as qty, d.PricePerUnit as price, d.StatusCode, 
            d.ModifiersJSON, d.Remarks as note, d.isTakeAway as isTakeaway,
            ISNULL(ckt.KitchenTypeCode, '2') as KitchenTypeCode, 
            ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
            pm.PrinterPath as PrinterIP
            FROM RestaurantOrderDetailCur d
            JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
            LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
            LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
            LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
            LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
            LEFT JOIN (
              SELECT *, ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn 
              FROM PrintMaster WHERE IsActive = 1
            ) pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.rn = 1
            WHERE (LTRIM(RTRIM(h.Tableno)) = (SELECT LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tableNo)
              OR LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(@tableNo))) 
              AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL) 
              AND d.StatusCode <> 0`);
        clientItems = dbItems.recordset;
      }
      const sentItems = clientItems.map(item => ({
        ...item,
        status: (item.status === 'VOIDED' || item.StatusCode === 0) ? 'VOIDED' : 'SENT'
      }));

      // 3. FORCE SYNC with the new Professional ID
      await syncToProfessionalTables(transaction, cleanId, finalOrderId, sentItems, userId);

      // 4. Lock Table to the new ID
      await transaction.request()
        .input("tid", sql.VarChar(50), cleanId)
        .input("oid", sql.NVarChar(50), finalOrderId)
        .query(`
          UPDATE TableMaster 
          SET Status = 1, 
              CurrentOrderId = @oid,
              StartTime = CASE WHEN StartTime IS NULL OR StartTime < '2000-01-01' THEN GETDATE() ELSE StartTime END,
              ModifiedOn = GETDATE()
          WHERE TableId = @tid
        `);

      await transaction.commit();
      
      res.json({ success: true, orderId: finalOrderId });

      // 🔥 REAL-TIME BROADCAST: Notify KDS and all other Waiter devices
      const io = req.app.get("io");
      if (io) {
        io.emit("new_order", {
          orderId: finalOrderId,
          context: {
            orderType: "DINE_IN",
            tableId: cleanId,
            tableNo: (await pool.request().input("tid", sql.VarChar(50), cleanId).query("SELECT TableNumber FROM TableMaster WHERE TableId = @tid")).recordset[0]?.TableNumber,
            section: "SECTION_1" // Fallback, will be refined by store
          },
          items: sentItems,
          createdAt: Date.now()
        });
        io.emit("cart_updated", { tableId: cleanId.toLowerCase(), orderId: finalOrderId });
        io.emit("kot_printed", { tableId: cleanId, orderId: finalOrderId });
      }

      // 5. Refresh totals and notify instantly
      syncTableStatus(req, cleanId).catch(() => {});
    } catch (e) { 
      await transaction.rollback(); 
      console.error("❌ SendOrder SQL Error:", e.message);
      res.status(500).json({ error: "SEND_ERROR: " + e.message }); 
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/cart/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    if (!tableId || tableId === "undefined" || tableId === "null" || tableId.length < 5) {
      return res.json({ items: [], currentOrderId: null });
    }
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    // Get table info (TableNumber + CurrentOrderId)
    const tableInfo = await pool.request()
      .input("tid", sql.VarChar(50), cleanId)
      .query("SELECT TableNumber, CurrentOrderId FROM TableMaster WHERE TableId = @tid");
    
    const tableRow = tableInfo.recordset[0];
    const tableNumber = tableRow?.TableNumber;
    const currentOrderId = tableRow?.CurrentOrderId;

    // Fetch items: prioritize by CurrentOrderId, fall back to open order by TableNumber
    // 💡 LIVE SYNC: Allow TEMP- IDs so other devices can see the draft cart items!
    const isRealOrderId = currentOrderId && 
      currentOrderId !== 'PENDING' &&
      currentOrderId !== 'NEW';

    const result = await pool.request()
      .input("tid", sql.VarChar(50), cleanId)
      .input("tableNo", sql.VarChar(20), String(tableNumber || ""))
      .input("orderNo", sql.NVarChar(50), isRealOrderId ? currentOrderId : "__NONE__")
      .query(`
        SELECT 
          d.OrderDetailId as lineItemId, d.DishId as id, d.Quantity as qty, 
          d.PricePerUnit as price, 
          ISNULL(dish.Name, d.DishName) as name, 
          d.ModifiersJSON, d.Remarks as note, d.isTakeAway as isTakeaway,
          CASE d.StatusCode 
            WHEN 1 THEN 'NEW' WHEN 2 THEN 'SENT' WHEN 3 THEN 'READY' 
            WHEN 4 THEN 'SERVED' WHEN 5 THEN 'HOLD' WHEN 0 THEN 'VOIDED' 
            ELSE 'SENT' 
          END as status,
          ISNULL(ckt.KitchenTypeCode, '2') as KitchenTypeCode, 
          ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
          pm.PrinterPath as PrinterIP
        FROM RestaurantOrderDetailCur d 
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
        LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
        LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
        LEFT JOIN (
          SELECT *, ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn 
          FROM PrintMaster WHERE IsActive = 1
        ) pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.rn = 1
        WHERE 
          h.isOrderClosed = 0
          AND d.StatusCode <> 0 -- 🚀 SHIELD: Never fetch voided items back into the active cart
          AND (
            h.OrderNumber = @orderNo
            OR (
              @orderNo = '__NONE__' AND 
              h.OrderId = (SELECT TOP 1 OrderId FROM RestaurantOrderCur WHERE Tableno = @tableNo AND isOrderClosed = 0 ORDER BY CreatedOn DESC)
            )
          )
        ORDER BY d.CreatedOn ASC
      `);

    const items = result.recordset.map((i) => ({
      ...i,
      modifiers: i.ModifiersJSON ? (() => { try { return JSON.parse(i.ModifiersJSON); } catch { return []; } })() : []
    }));

    res.json({ items, currentOrderId: isRealOrderId ? currentOrderId : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/cancel", async (req, res) => {
  try {
    const { orderId, tableId, reason, userId, userName } = req.body;
    const pool = await poolPromise;
    const cleanTid = String(tableId).replace(/^\{|\}$/g, "").trim();
    
    // 1. Fetch Order Data for Reporting
    const orderData = await pool.request()
      .input("oid", sql.NVarChar(100), orderId)
      .query(`
        SELECT h.OrderId, h.OrderNumber, h.Tableno, h.BusinessUnitId, h.CreatedBy, h.MobileNo,
               tm.DiningSection, tm.TableId
        FROM RestaurantOrderCur h
        LEFT JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
        WHERE h.OrderNumber = @oid AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      `);
    
    const header = orderData.recordset[0];
    if (!header) {
      return res.status(404).json({ error: "Order not found or already closed" });
    }

    const itemsData = await pool.request()
      .input("orderId", sql.UniqueIdentifier, header.OrderId)
      .query(`
        SELECT d.*, dish.DishGroupId, dg.CategoryId, cm.CategoryName, dg.DishGroupName
        FROM RestaurantOrderDetailCur d
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        LEFT JOIN DishGroupMaster dg ON dish.DishGroupId = dg.DishGroupId
        LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
        WHERE d.OrderId = @orderId
      `);
    
    const items = itemsData.recordset;
    const subTotal = items.reduce((sum, item) => sum + (item.ActualAmount || 0), 0);
    const voidQty = items.reduce((sum, item) => sum + (item.Quantity || 0), 0);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const settlementId = crypto.randomUUID();
      
      // 2. Insert into SettlementHeader (Cancelled Status)
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("oid", sql.NVarChar(50), orderId)
        .input("tableNo", sql.NVarChar(50), header.Tableno)
        .input("section", sql.NVarChar(100), header.DiningSection)
        .input("userId", sql.UniqueIdentifier, toGuidOrNull(userId))
        .input("userName", sql.NVarChar(255), userName || "User")
        .input("reason", sql.NVarChar(500), reason || "Manual Cancellation")
        .input("bizId", sql.UniqueIdentifier, header.BusinessUnitId || DEFAULT_GUID)
        .input("subTotal", sql.Money, subTotal)
        .input("voidQty", sql.Int, voidQty)
        .input("voidAmt", sql.Money, subTotal)
        .input("mobile", sql.NVarChar(50), header.MobileNo)
        .query(`
          INSERT INTO SettlementHeader (
            SettlementID, LastSettlementDate, BillNo, OrderType, TableNo, Section, 
            CashierID, BusinessUnitId, SysAmount, ManualAmount, CreatedBy, CreatedOn, 
            IsCancelled, CancellationReason, CancelledDate, CancelledByUserName, 
            SubTotal, TotalTax, DiscountAmount, MobileNo, VoidItemQty, VoidItemAmount
          ) VALUES (
            @sid, GETDATE(), @oid, 'DINE-IN', @tableNo, @section, 
            @userId, @bizId, 0, 0, @userId, GETDATE(), 
            1, @reason, GETDATE(), @userName, 
            @subTotal, 0, 0, @mobile, @voidQty, @voidAmt
          )
        `);

      // 3. Insert Items into SettlementItemDetail (Marked as VOIDED)
      for (const item of items) {
        await transaction.request()
          .input("sid", sql.UniqueIdentifier, settlementId)
          .input("dishId", sql.UniqueIdentifier, item.DishId)
          .input("dishName", sql.NVarChar(255), item.DishName)
          .input("qty", sql.Int, item.Quantity)
          .input("price", sql.Decimal(18, 2), item.PricePerUnit)
          .input("catId", sql.UniqueIdentifier, item.CategoryId)
          .input("catName", sql.NVarChar(255), item.CategoryName)
          .input("groupName", sql.NVarChar(255), item.DishGroupName)
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

      // 4. Insert into supporting Settlement tables for reporting (Audit Trail)
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("oid", sql.NVarChar(50), orderId)
        .input("bizId", sql.UniqueIdentifier, header.BusinessUnitId || DEFAULT_GUID)
        .input("userId", sql.UniqueIdentifier, toGuidOrNull(userId))
        .input("subTotal", sql.Money, subTotal)
        .input("voidQty", sql.Int, voidQty)
        .query(`
          -- Insert into SettlementTotalSales (Zeroed)
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@sid, 'VOID', 0, 0, 0, @voidQty);

          -- Insert into SettlementDetail (Zeroed)
          INSERT INTO SettlementDetail (SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected)
          VALUES (@sid, 'VOID', 0, 0, 0, @voidQty, 0);

          -- Insert into SettlementTranDetail (Zeroed)
          INSERT INTO SettlementTranDetail (SettlementID, PayMode, CashIn, CashOut)
          VALUES (@sid, 'VOID', 0, 0);

          -- Insert into RestaurantInvoice (Cancelled Status 4)
          INSERT INTO RestaurantInvoice (
            BusinessUnitId, RestaurantBillId, OrderId, BillNumber, OrderDateTime, TimeBilled, 
            TotalLineItemAmount, TotalTax, DiscountAmount, TotalAmount, StatusCode, 
            CreatedBy, CreatedOn, InvoiceDate, ServiceCharge, RoundedBy, TotalAmountLessFreight,
            PaymentTermCode
          ) VALUES (
            @bizId, @sid, @sid, @oid, GETDATE(), GETDATE(),
            @subTotal, 0, 0, 0, 4,
            @userId, GETDATE(), CAST(GETDATE() AS DATE), 0, 0, @subTotal,
            0
          );
        `);

      // 5. Update Current Tables (StatusCode 4 = Cancelled)
      await transaction.request()
        .input("oid", sql.NVarChar(50), orderId)
        .query(`
          UPDATE RestaurantOrderCur SET StatusCode = 4, isOrderClosed = 1, ModifiedOn = GETDATE() WHERE OrderNumber = @oid;
          UPDATE RestaurantOrderDetailCur SET StatusCode = 0, ModifiedOn = GETDATE() WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @oid);
        `);

      await transaction.request()
        .input("tid", sql.VarChar(50), cleanTid)
        .query("UPDATE TableMaster SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL, ModifiedOn = GETDATE() WHERE TableId = @tid");

      await transaction.commit();
      
      await syncTableStatus(req, cleanTid);
      req.app.get("io")?.emit("order_closed", { tableId: cleanTid, orderId: orderId });
      
      res.json({ success: true });
    } catch (e) { 
      await transaction.rollback(); 
      console.error("❌ Cancel Error:", e.message);
      res.status(500).json({ error: e.message }); 
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/complete", async (req, res) => {
  try {
    const { tableId, userId } = req.body;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;
    
    // Final atomic update: Close the professional order and release the table
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() 
        WHERE LTRIM(RTRIM(Tableno)) = (SELECT TOP 1 LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tid) 
        AND (isOrderClosed = 0 OR isOrderClosed IS NULL);
        
        UPDATE TableMaster SET Status = 0, CurrentOrderId = NULL, StartTime = NULL, TotalAmount = 0, ModifiedOn = GETDATE() WHERE TableId = @tid;
      `);

    const updated = await syncTableStatus(req, cleanId);
    
    // 🔥 UNIFIED SIGNAL: Use order_status_update for consistency
    const io = req.app.get("io");
    if (io) {
      const lid = cleanId.toLowerCase();
      io.emit("order_closed", { tableId: lid });
      io.emit("order_status_update", { 
        tableId: lid, 
        action: "CLOSE",
        orderId: updated?.CurrentOrderId 
      });
    }
    res.json({ success: true, ...updated });
  } catch (err) { 
    console.error("❌ Complete Error:", err.message);
    res.status(500).json({ error: err.message }); 
  }
});

router.post("/hold", async (req, res) => {
  try {
    const { tableId } = req.body;
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    // Set status to 3 (Hold)
    await pool.request()
      .input("tid", sql.VarChar(50), cleanId)
      .query(`
        UPDATE TableMaster 
        SET Status = 3, 
            ModifiedOn = GETDATE() 
        WHERE TableId = @tid
      `);

    const updated = await syncTableStatus(req, cleanId);
    res.json({ success: true, ...updated });
  } catch (err) {
    console.error("❌ Hold Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;
    
    // Step 1: Move table to Payment Pending (Status 2) and mark items as SERVED (4)
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        -- 1. Update Table Status to Checkout (2)
        UPDATE TableMaster SET Status = 2, ModifiedOn = GETDATE() WHERE TableId = @tid;

        -- 2. Mark all active items for this table as SERVED (4) so they leave KDS
        UPDATE d
        SET d.StatusCode = 4, d.ModifiedOn = GETDATE()
        FROM RestaurantOrderDetailCur d
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
        JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
        WHERE tm.TableId = @tid 
        AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
        AND d.StatusCode IN (1, 2, 3, 5);

        -- 3. Expire VOIDED items (StatusCode 0) from KDS instantly
        UPDATE d
        SET d.ModifiedOn = DATEADD(MINUTE, -10, GETDATE())
        FROM RestaurantOrderDetailCur d
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
        JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
        WHERE tm.TableId = @tid 
        AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
        AND d.StatusCode = 0;
      `);

    const updated = await syncTableStatus(req, cleanId);
    
    // 🔥 KDS & GLOBAL SYNC: Harmonized signals
    const io = req.app.get("io");
    if (io) {
      const lid = cleanId.toLowerCase();
      io.emit("order_closed", { 
        tableId: lid, 
        tableNo: updated?.tableNo,
        section: updated?.section 
      });
      io.emit("order_status_update", {
        tableId: lid,
        action: "CLOSE",
        orderId: updated?.CurrentOrderId
      });
    }

    res.json({ success: true, ...updated });
  } catch (err) { 
    console.error("❌ Checkout Error:", err.message);
    res.status(500).json({ error: err.message }); 
  }
});

router.post("/remove-item", async (req, res) => {
  try {
    const { tableId, itemId, qtyToVoid, reason, version } = req.body;
    const userId = req.body.userId || DEFAULT_GUID;
    const pool = await poolPromise;
    const now = Date.now();
    console.log(`[TRACE] [${now}] [REMOVE-ITEM] Table: ${tableId} | ItemID: ${itemId} | Version: ${version || 'NONE'}`);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 🚀 SMART REMOVAL: Delete if NEW, Void if SENT
      await transaction.request()
        .input("itemId", sql.VarChar(50), itemId)
        .input("userId", sql.VarChar(50), userId)
        .input("reason", sql.NVarChar(255), reason || "")
        .query(`
          DECLARE @CurrentStatus INT;
          SELECT @CurrentStatus = StatusCode FROM RestaurantOrderDetailCur WHERE OrderDetailId = @itemId;

          IF @CurrentStatus = 1
          BEGIN
            -- Hard delete unsent items
            DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @itemId;
            DELETE FROM RestaurantOrderDetailCur WHERE OrderDetailId = @itemId;
          END
          ELSE
          BEGIN
            -- Void sent items
            UPDATE RestaurantOrderDetailCur 
            SET StatusCode = 0, ModifiedBy = @userId, ModifiedOn = GETDATE(), 
                Remarks = ISNULL(Remarks, '') + ' (VOID: ' + @reason + ')'
            WHERE OrderDetailId = @itemId;
          END
        `);
      await transaction.commit();
      
      // 🚀 Refresh total immediately
      syncTableStatus(req, tableId).catch(() => {});

      req.app.get("io")?.emit("cart_updated", { tableId: String(tableId || "").toLowerCase() });
      res.json({ success: true });
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/update-item-status", async (req, res) => {
  try {
    const { lineItemId, status, tableId } = req.body;
    const pool = await poolPromise;
    const statusMap = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };
    
    // Fetch orderNumber first so we can emit it
    const orderRes = await pool.request()
      .input("id", sql.UniqueIdentifier, lineItemId)
      .query("SELECT h.OrderNumber FROM RestaurantOrderDetailCur d JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId WHERE d.OrderDetailId = @id");
    
    const orderId = orderRes.recordset[0]?.OrderNumber;

    await pool.request()
      .input("id", sql.VarChar(50), lineItemId)
      .input("code", sql.Int, statusMap[status] || 2)
      .query("UPDATE RestaurantOrderDetailCur SET StatusCode = @code, ModifiedOn = GETDATE() WHERE OrderDetailId = @id");
    
    req.app.get("io")?.emit("item_status_updated", { 
      lineItemId, 
      status, 
      tableId: String(tableId || "").toLowerCase(), 
      orderId 
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/active-kitchen", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        d.OrderDetailId as lineItemId, d.DishId as id, d.Quantity as qty, d.StatusCode, 
        h.OrderNumber as orderId, dish.Name as name, LTRIM(RTRIM(h.Tableno)) as tableNo, 
        d.Remarks as note, d.ModifiersJSON, d.isTakeAway, DATEDIFF(SECOND, d.CreatedOn, GETDATE()) as elapsedSeconds,
        ISNULL(ckt.KitchenTypeCode, '0') as KitchenTypeCode, 
        ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
        pm.PrinterPath as PrinterIP,
        tm.TableId, tm.DiningSection
      FROM RestaurantOrderDetailCur d 
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
      LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
      LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
      LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
      LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
      LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50))
      LEFT JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
      WHERE (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      AND (d.StatusCode IN (2,3,5) OR (d.StatusCode = 0 AND DATEDIFF(MINUTE, d.ModifiedOn, GETDATE()) < 3))
      AND h.OrderNumber IS NOT NULL
      AND h.OrderNumber NOT LIKE 'TEMP-%'
      AND h.OrderNumber NOT IN ('PENDING', 'NEW', '#NEW', '')
      ORDER BY d.CreatedOn ASC
    `);
    const orders = {};
    result.recordset.forEach(row => {
      if (!orders[row.orderId]) {
        const isTakeaway = !row.tableNo || row.tableNo === 'TAKEAWAY' || String(row.tableNo).startsWith('TW');
        orders[row.orderId] = { 
          orderId: row.orderId, 
          context: { 
            orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
            tableId: row.TableId,
            tableNo: isTakeaway ? null : row.tableNo,
            section: row.DiningSection || "",
            takeawayNo: isTakeaway ? (row.tableNo === 'TAKEAWAY' ? row.orderId.slice(-4) : row.tableNo) : null
          }, 
          items: [], 
          createdAt: Date.now() - (row.elapsedSeconds * 1000) 
        };
      }
      const statusMap = { 0:'VOIDED', 1:'NEW', 2:'SENT', 3:'READY', 4:'SERVED', 5:'HOLD' };
      orders[row.orderId].items.push({ 
        ...row, 
        status: statusMap[row.StatusCode], 
        modifiers: row.ModifiersJSON ? JSON.parse(row.ModifiersJSON) : [] 
      });
    });
    res.json({ serverTime: Date.now(), orders: Object.values(orders) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/log-print", async (req, res) => {
  try {
    const { orderId, orderNumber, printType } = req.body;
    const pool = await poolPromise;
    await pool.request().input("oid", sql.UniqueIdentifier, orderId && orderId.length > 30 ? orderId : null).input("ono", sql.VarChar(50), orderNumber).input("pt", sql.Int, printType || 1).query("INSERT INTO PrintReport (OrderId, Ordernumber, PrintType, orderDate) VALUES (@oid, @ono, @pt, GETDATE())");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
