const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");

// ================= GET USER =================
router.post("/getUser", async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "Username is required" });
    }

    const pool = await poolPromise;
    const result = await pool.request().input("UserName", sql.VarChar, userName)
      .query(`
        SELECT UserId, UserName, FullName, UserPassword, IsDisabled
        FROM Vw_UserMaster
        WHERE UserName = @UserName
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.recordset[0];

    if (user.IsDisabled) {
      return res.status(403).json({ message: "User account is disabled" });
    }

    res.json({
      UserId: user.UserId,
      UserName: user.UserName,
      FullName: user.FullName,
    });
  } catch (err) {
    console.error("GET USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= VALIDATE PASSWORD =================
router.post("/validatePassword", async (req, res) => {
  try {
    const { userName, password } = req.body;

    if (!userName || !password) {
      return res
        .status(400)
        .json({ message: "Username and password required" });
    }

    const pool = await poolPromise;
    const result = await pool.request().input("UserName", sql.VarChar, userName)
      .query(`
        SELECT UserId, UserName, FullName, UserPassword
        FROM Vw_UserMaster
        WHERE UserName = @UserName AND IsDisabled = 0
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.recordset[0];

    // Decode base64 password (same as auth.js)
    let storedPassword = user.UserPassword;
    try {
      storedPassword = Buffer.from(user.UserPassword, "base64").toString("utf8");
    } catch (e) {
      storedPassword = user.UserPassword;
    }

    if (storedPassword !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.json({
      success: true,
      message: "Password validated",
      userId: user.UserId,
      fullName: user.FullName,
    });
  } catch (err) {
    console.error("VALIDATE PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= GET TODAY'S SUMMARY =================
router.get("/summary/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const pool = await poolPromise;

    const entries = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT 
          status,
          ClockinTime,
          CreatedOn
        FROM TimeEntry
        WHERE Userid = @UserId 
        AND CreatedOn >= CAST(GETDATE() AS DATE)
        AND CreatedOn < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
        ORDER BY CreatedOn ASC
      `);

    let totalWorkMs = 0;
    let totalBreakMs = 0;
    let lastClockIn = null;
    let lastBreakIn = null;
    let isOnBreak = false;
    let hasClockIn = false;
    let lastClockOutTime = null;
    let firstClockInTime = null;

    for (const entry of entries.recordset) {
      const entryTime = new Date(entry.ClockinTime).getTime();
      
      if (entry.status === 1) {
        // IN
        lastClockIn = entryTime;
        if (!firstClockInTime) firstClockInTime = entry.ClockinTime;
        hasClockIn = true;
        isOnBreak = false;
        lastClockOutTime = null;
      } else if (entry.status === 0 && lastClockIn) {
        // OUT
        totalWorkMs += (entryTime - lastClockIn);
        lastClockIn = null;
        lastClockOutTime = entry.ClockinTime;
      } else if (entry.status === 3) {
        // BREAK IN
        lastBreakIn = entryTime;
        isOnBreak = true;
      } else if (entry.status === 4 && lastBreakIn) {
        // BREAK OUT
        totalBreakMs += (entryTime - lastBreakIn);
        lastBreakIn = null;
        isOnBreak = false;
      }
    }

    // If currently clocked in (no closing OUT entry for the last IN), 
    // add elapsed time to totalWorkMs for real-time netHours calc
    let activeWorkMs = totalWorkMs;
    if (lastClockIn && !lastClockOutTime) {
      // Use DB time if possible, or current time
      const now = new Date().getTime();
      if (now > lastClockIn) {
        activeWorkMs += (now - lastClockIn);
      }
    }

    const totalHoursResult = activeWorkMs / (1000 * 60 * 60);
    const netHoursResult = (activeWorkMs - totalBreakMs) / (1000 * 60 * 60);
    const lastStatusValue = entries.recordset.length > 0 ? entries.recordset[entries.recordset.length - 1].status : null;

    res.json({
      summary: {
        clockedIn: hasClockIn && !lastClockOutTime,
        shiftCompleted: hasClockIn && !!lastClockOutTime,
        lastStatus: lastStatusValue,
        clockInTime: firstClockInTime ? new Date(firstClockInTime).toISOString() : null,
        clockOutTime: lastClockOutTime ? new Date(lastClockOutTime).toISOString() : null,
        totalHours: parseFloat(totalHoursResult.toFixed(2)),
        totalBreakMinutes: Math.round(totalBreakMs / (1000 * 60)),
        netHours: parseFloat(netHoursResult.toFixed(2)),
        isOnBreak: isOnBreak,
        canClockIn: !hasClockIn || (lastStatusValue === 0), 
        canClockOut: hasClockIn && !lastClockOutTime && !isOnBreak,
        canStartBreak: hasClockIn && !lastClockOutTime && !isOnBreak,
        canEndBreak: isOnBreak
      },
    });
  } catch (err) {
    console.error("GET SUMMARY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= TIME ENTRY SAVE =================
router.post("/save", async (req, res) => {
  try {
    const { userId, status, userName, password, timestamp } = req.body;

    if (!userId || status === undefined) {
      return res.status(400).json({ message: "UserId and status required" });
    }

    const pool = await poolPromise;
    const currentTime = timestamp ? new Date(timestamp) : new Date();

    // Verify user credentials
    const userCheck = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId).query(`
        SELECT UserName, UserPassword, FullName
        FROM Vw_UserMaster
        WHERE UserId = @UserId AND IsDisabled = 0
      `);

    if (userCheck.recordset.length === 0) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    const user = userCheck.recordset[0];

    // Decode base64 password (same as auth.js)
    let storedPassword = user.UserPassword;
    try {
      storedPassword = Buffer.from(user.UserPassword, "base64").toString("utf8");
    } catch (e) {
      storedPassword = user.UserPassword;
    }

    if (storedPassword !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Get today's entries using server-side date (avoids timezone drift)
    const existingEntries = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT status, ClockinTime
        FROM TimeEntry
        WHERE Userid = @UserId 
        AND CreatedOn >= CAST(GETDATE() AS DATE)
        AND CreatedOn < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
        ORDER BY CreatedOn ASC
      `);

    const entries = existingEntries.recordset;
    let hasClockIn = false;
    let hasClockOut = false;
    let isOnBreak = false;
    let lastBreakIn = null;

    for (const entry of entries) {
      const s = parseInt(entry.status);
      if (s == 1) {
        hasClockIn = true;
        isOnBreak = false;
      } else if (s == 0) {
        hasClockOut = true;
        isOnBreak = false;
      } else if (s == 3) {
        isOnBreak = true;
        lastBreakIn = entry.ClockinTime;
      } else if (s == 4) {
        isOnBreak = false;
        lastBreakIn = null;
      }
    }

    // Validation based on action
    if (status == 1) {
      // IN
      if (hasClockIn && !hasClockOut) {
        return res.status(400).json({
          message: "Already clocked in today. Please clock out first.",
        });
      }
      if (hasClockOut) {
        return res
          .status(400)
          .json({ message: "Already completed your shift today." });
      }
    } else if (status == 0) {
      // OUT
      if (!hasClockIn) {
        return res
          .status(400)
          .json({ message: "No clock in found. Please clock in first." });
      }
      if (hasClockOut) {
        return res.status(400).json({ message: "Already clocked out today." });
      }
      if (isOnBreak) {
        return res.status(400).json({
          message: "Cannot clock out while on break. Please end break first.",
        });
      }
    } else if (status == 3) {
      // BREAK IN
      if (!hasClockIn || hasClockOut) {
        return res
          .status(400)
          .json({ message: "Must be clocked in to take a break." });
      }
      if (isOnBreak) {
        return res
          .status(400)
          .json({ message: "Already on break. Please end break first." });
      }
    } else if (status == 4) {
      // BREAK OUT
      if (!isOnBreak) {
        return res
          .status(400)
          .json({ message: "Not on break. Please start break first." });
      }
    }

    // Insert time entry
    await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("Status", sql.Int, status)
      .input("ClockTime", sql.DateTime, currentTime)
      .input("BusinessUnitId", sql.UniqueIdentifier, "00000000-0000-0000-0000-000000000001")
      .input("CreatedBy", sql.UniqueIdentifier, userId).query(`
        INSERT INTO TimeEntry
        (Userid, ClockinTime, status, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
        VALUES
        (@UserId, @ClockTime, @Status, @BusinessUnitId, @CreatedBy, GETDATE(), @CreatedBy, GETDATE())
      `);

    // --- SYNC WITH DailyAttendance ---
    try {
      if (status == 1) {
        // IN: Create or Update DailyAttendance
        await pool.request()
          .input("UserId", sql.UniqueIdentifier, userId)
          .input("Now", sql.DateTime, currentTime)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM DailyAttendance WHERE DeliveryPersonId = @UserId AND CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE))
            BEGIN
              INSERT INTO DailyAttendance (DeliveryPersonId, StartDateTime, BusinessUnitId, CreatedBy, CreatedOn)
              VALUES (@UserId, @Now, '00000000-0000-0000-0000-000000000001', @UserId, GETDATE())
            END
            ELSE
            BEGIN
              UPDATE DailyAttendance SET StartDateTime = @Now, EndDateTime = NULL WHERE DeliveryPersonId = @UserId AND CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE)
            END
          `);
      } else if (status == 3) {
        // BREAK IN
        await pool.request()
          .input("UserId", sql.UniqueIdentifier, userId)
          .input("Now", sql.DateTime, currentTime)
          .query(`UPDATE DailyAttendance SET BreakInTime = @Now WHERE DeliveryPersonId = @UserId AND CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE)`);
      } else if (status == 4) {
        // BREAK OUT
        await pool.request()
          .input("UserId", sql.UniqueIdentifier, userId)
          .input("Now", sql.DateTime, currentTime)
          .query(`UPDATE DailyAttendance SET BreakOutTime = @Now WHERE DeliveryPersonId = @UserId AND CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE)`);
      } else if (status == 0) {
        // OUT
        await pool.request()
          .input("UserId", sql.UniqueIdentifier, userId)
          .input("Now", sql.DateTime, currentTime)
          .query(`
            UPDATE DailyAttendance 
            SET EndDateTime = @Now,
                NoofHours = DATEDIFF(SECOND, StartDateTime, @Now) / 3600.0
            WHERE DeliveryPersonId = @UserId AND CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE)
          `);
      }
    } catch (syncErr) {
      console.error("DailyAttendance Sync Error:", syncErr.message);
      // Don't fail the whole request if sync fails
    }

    const actionNames = { 1: "IN", 0: "OUT", 3: "BREAK IN", 4: "BREAK OUT" };
    const actionName = actionNames[status] || "ACTION";

    res.json({
      success: true,
      message: `${actionName} recorded successfully at ${currentTime.toLocaleTimeString()}`,
    });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= SYNC OFFLINE ENTRIES =================
router.post("/sync", async (req, res) => {
  try {
    const { entries } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ message: "Invalid entries array" });
    }

    const pool = await poolPromise;
    let synced = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        // Verify user credentials for each entry
        const userCheck = await pool
          .request()
          .input("UserId", sql.UniqueIdentifier, entry.userId)
          .query(
            `SELECT UserPassword FROM Vw_UserMaster WHERE UserId = @UserId AND IsDisabled = 0`,
          );

        if (userCheck.recordset.length === 0) {
          failed++;
          continue;
        }

        if (userCheck.recordset[0].UserPassword !== entry.password) {
          failed++;
          continue;
        }

        // Insert the entry
        await pool
          .request()
          .input("UserId", sql.UniqueIdentifier, entry.userId)
          .input("Status", sql.Int, entry.status)
          .input("ClockTime", sql.DateTime, new Date(entry.timestamp))
          .input("BusinessUnitId", sql.UniqueIdentifier, "00000000-0000-0000-0000-000000000001")
          .input("CreatedBy", sql.UniqueIdentifier, entry.userId).query(`
            INSERT INTO TimeEntry
            (Userid, ClockinTime, status, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
            VALUES
            (@UserId, @ClockTime, @Status, @BusinessUnitId, @CreatedBy, GETDATE(), @CreatedBy, GETDATE())
          `);

        synced++;
      } catch (err) {
        console.error("Error syncing entry:", err);
        failed++;
      }
    }

    res.json({
      success: true,
      synced: synced,
      failed: failed,
      message: `Synced ${synced} entries, ${failed} failed`,
    });
  } catch (err) {
    console.error("SYNC ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= GET TODAY'S ENTRIES =================
router.get("/today/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const pool = await poolPromise;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("StartDate", sql.DateTime, today)
      .input("EndDate", sql.DateTime, tomorrow).query(`
        SELECT 
          status,
          ClockinTime,
          CreatedOn,
          CASE 
            WHEN status = 1 THEN 'IN'
            WHEN status = 0 THEN 'OUT'
            WHEN status = 3 THEN 'BREAK IN'
            WHEN status = 4 THEN 'BREAK OUT'
          END as ActionName
        FROM TimeEntry
        WHERE Userid = @UserId 
        AND CreatedOn >= @StartDate 
        AND CreatedOn < @EndDate
        ORDER BY CreatedOn DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("GET TODAY ENTRIES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= CHECK CURRENT STATUS =================
router.get("/status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const pool = await poolPromise;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("StartDate", sql.DateTime, today)
      .input("EndDate", sql.DateTime, tomorrow).query(`
        SELECT TOP 1
          status,
          ClockinTime
        FROM TimeEntry
        WHERE Userid = @UserId 
        AND CreatedOn >= @StartDate 
        AND CreatedOn < @EndDate
        ORDER BY CreatedOn DESC
      `);

    if (result.recordset.length === 0) {
      return res.json({
        status: "NOT_CLOCKED_IN",
        clockedIn: false,
        onBreak: false,
        message: "No attendance record for today",
      });
    }

    const lastEntry = result.recordset[0];
    let currentStatus = "NOT_CLOCKED_IN";
    let clockedIn = false;
    let onBreak = false;

    if (lastEntry.status === 1) {
      currentStatus = "CLOCKED_IN";
      clockedIn = true;
    } else if (lastEntry.status === 3) {
      currentStatus = "ON_BREAK";
      clockedIn = true;
      onBreak = true;
    } else if (lastEntry.status === 0) {
      currentStatus = "COMPLETED";
    }

    res.json({
      status: currentStatus,
      clockedIn,
      onBreak,
      lastAction: lastEntry.status,
      lastTime: lastEntry.ClockinTime,
    });
  } catch (err) {
    console.error("GET STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
