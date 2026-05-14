const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// In-memory table locks
const tableLocks = new Map();

// Clear old locks every minute (older than 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const [tableId, lock] of tableLocks.entries()) {
    if (now - lock.lockedAt > 30 * 60 * 1000) {
      tableLocks.delete(tableId);
    }
  }
}, 60 * 1000);

/* ================= IN-MEMORY LOCKS ================= */
router.post("/lock", (req, res) => {
  const { tableId, userId } = req.body;
  if (!tableId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy !== userId) {
    return res.status(409).json({
      success: false,
      message: "Table is heavily occupied by another user.",
      lockedBy: existingLock.lockedBy,
    });
  }

  tableLocks.set(tableId, { lockedBy: userId, lockedAt: Date.now() });
  res.json({ success: true });
});

router.post("/unlock", (req, res) => {
  const { tableId, userId } = req.body;
  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy === userId) {
    tableLocks.delete(tableId);
  }
  res.json({ success: true });
});

router.get("/locks", (req, res) => {
  const locks = {};
  for (const [key, value] of tableLocks.entries()) {
    locks[key] = value.lockedBy;
  }
  res.json(locks);
});

/* ================= PERSISTENT TABLES ================= */
router.get("/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { section } = req.query;

    const SECTION_MAP = {
      SECTION_1: "1",
      SECTION_2: "2",
      SECTION_3: "3",
      TAKEAWAY: "4",
    };

    let query = `
      SELECT TableId AS id, CAST(TableNumber AS VARCHAR(50)) AS label,
      CAST(DiningSection AS VARCHAR(10)) AS DiningSection, LockedByName as lockedByName,
      Status, CONVERT(VARCHAR, StartTime, 126) as StartTime, ISNULL(TotalAmount, 0) as totalAmount, CurrentOrderId as currentOrderId,
      CASE 
        WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND StartTime > '2000-01-01' AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
        ELSE 0 
      END AS isOvertime,
      CASE 
        WHEN Status = 3 AND ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, ModifiedOn, GETDATE()) >= ISNULL((SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings), 30) THEN 1 
        ELSE 0 
      END AS isHoldOvertime
      FROM TableMaster
    `;

    const request = pool.request();
    if (section && SECTION_MAP[section] !== undefined) {
      request.input("DiningSection", SECTION_MAP[section]);
      query += ` WHERE CAST(DiningSection AS VARCHAR(10)) = @DiningSection`;
    }
    query += ` ORDER BY SortCode`;

    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("TABLES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/locked", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TableId as tableId, TableNumber as tableNumber, DiningSection, LockedByName as lockedByName, Status as status
      FROM TableMaster WHERE Status = 5
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/lock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId, lockedByName } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request(); // ✅ Fixed: request was not defined
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("lockedByName", sql.NVarChar, lockedByName || null);
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);

    await request.query(`
      UPDATE TableMaster 
      SET Status = 5, LockedByName = @lockedByName, TotalAmount = 0, StartTime = NULL, ModifiedBy = @ModifiedBy
      WHERE TableId = @tableId
    `);

    // ✅ Clear CartItems for this table when locked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: 5, 
        totalAmount: 0, 
        startTime: null,
        lockedByName: lockedByName || null 
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/unlock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query(`
        UPDATE TableMaster 
        SET Status = 0, LockedByName = NULL, TotalAmount = 0, StartTime = NULL, ModifiedBy = @ModifiedBy
        WHERE TableId = @tableId
      `);

    // ✅ Clear any items in CartItems for this table when unlocked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: 0, 
        totalAmount: 0,
        lockedByName: null 
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ New route to match user's snippet: PUT /api/tables/status
router.put("/status", async (req, res) => {
  const { tableId, status } = req.body;
  const userId = req.body.userId || req.body.UserId || req.body.USERID;

  try {
    const pool = await poolPromise;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });
    if (status === undefined) return res.status(400).json({ error: "status is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("status", sql.Int, Number(status));
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);

    const updateResult = await request.query(`
      UPDATE TableMaster 
      SET Status = @status,
          ModifiedBy = @ModifiedBy,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 2 OR @status = 3) AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE StartTime 
          END,
          TotalAmount = CASE 
            WHEN @status = 0 OR @status = 5 THEN 0 
            ELSE TotalAmount 
          END,
          ModifiedOn = GETDATE()
      OUTPUT 
        INSERTED.TotalAmount, 
        CONVERT(VARCHAR, INSERTED.StartTime, 126) AS StartTime,
        CASE 
          WHEN INSERTED.Status IN (1, 2, 3) AND INSERTED.StartTime IS NOT NULL AND INSERTED.StartTime > '2000-01-01' AND DATEDIFF(MINUTE, INSERTED.StartTime, GETDATE()) >= 60 THEN 1 
          ELSE 0 
        END AS isOvertime,
        CASE 
          WHEN INSERTED.Status = 3 AND INSERTED.ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, INSERTED.ModifiedOn, GETDATE()) >= ISNULL((SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings), 30) THEN 1 
          ELSE 0 
        END AS isHoldOvertime
      WHERE TableId = @tableId
    `);
    
    const row = updateResult.recordset[0];

    // ✅ Clear CartItems if status is 0 (Available) or 5 (Locked)
    if (Number(status) === 0 || Number(status) === 5) {
      await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");
    }
    const currentTotal = row?.TotalAmount || 0;
    const currentStartTime = row?.StartTime || null;
    const currentIsOvertime = row?.isOvertime || 0;

    // 🔥 Emit socket event with TotalAmount, StartTime and isOvertime
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: Number(status),
        totalAmount: currentTotal,
        startTime: currentStartTime,
        isOvertime: currentIsOvertime,
        isHoldOvertime: row?.isHoldOvertime || 0
      });
    }

    res.json({ success: true, totalAmount: currentTotal });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: "Error updating" });
  }
});

router.put("/:tableId/status", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.params;
    const { status, lockedByName } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;

    if (status === undefined) return res.status(400).json({ error: "status is required" });

    const request = pool.request();
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("status", sql.Int, Number(status));
    request.input("lockedByName", sql.NVarChar, lockedByName || null);
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);

    await request.query(`
      UPDATE TableMaster 
      SET Status = @status, 
          ModifiedBy = @ModifiedBy,
          LockedByName = CASE WHEN @status = 5 THEN @lockedByName ELSE NULL END,
          StartTime = CASE 
            -- Status 1 (Dining), 2 (Checkout), or 3 (Hold) starts/maintains the timer
            WHEN (@status = 1 OR @status = 2 OR @status = 3) AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
            -- Status 0 (Available) or 5 (Locked) resets the timer
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE StartTime 
          END,
          TotalAmount = CASE 
            WHEN @status = 0 OR @status = 5 THEN 0 
            ELSE TotalAmount 
          END
      WHERE TableId = @tableId
    `);

    // ✅ If status is 0 or 5, clear any lingering items in CartItems for this table
    if (Number(status) === 0 || Number(status) === 5) {
      await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");
    }

    // 🔥 Emit socket event for real-time sync across devices
    if (io) {
      // Get latest state for accurate broadcast
      const tableRes = await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query(`
          SELECT TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime,
          CASE 
            WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND StartTime > '2000-01-01' AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
            ELSE 0 
          END AS isOvertime,
          CASE 
            WHEN Status = 3 AND ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, ModifiedOn, GETDATE()) >= ISNULL((SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings), 30) THEN 1 
            ELSE 0 
          END AS isHoldOvertime
          FROM TableMaster WHERE TableId = @tableId
        `);
      
      const row = tableRes.recordset[0];
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: Number(status),
        totalAmount: row?.TotalAmount || 0,
        startTime: row?.StartTime || null,
        isOvertime: row?.isOvertime || 0,
        isHoldOvertime: row?.isHoldOvertime || 0
      });
    }

    res.json({ success: true, status: Number(status) });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET Single Table by ID
router.get("/:tableId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.params;
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();

    const result = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query(`
        SELECT 
          TableId AS id, 
          TableNumber AS label,
          DiningSection, 
          Status, 
          CONVERT(VARCHAR, StartTime, 126) as StartTime, 
          ISNULL(TotalAmount, 0) as totalAmount, 
          CurrentOrderId as currentOrderId,
          LockedByName as lockedByName
        FROM TableMaster
        WHERE TableId = @tableId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Table not found" });
    }

    res.json({ success: true, table: result.recordset[0] });
  } catch (err) {
    console.error("GET TABLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/diagnostic", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT TOP 10 TableId, TableNumber, DiningSection, Status,
        CAST(TableId AS VARCHAR(50)) AS TableId_AsString
        FROM TableMaster
      `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

module.exports = router;
