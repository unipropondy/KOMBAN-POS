const express = require("express");
const compression = require("compression");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { poolPromise } = require("./config/db");
const { initDB } = require("./config/init");
const dbCheck = require("./middleware/dbCheck");

// Import Routes
const authRoutes = require("./routes/auth");
const tableRoutes = require("./routes/tables");
const menuRoutes = require("./routes/menu");
const salesRoutes = require("./routes/sales");
const memberRoutes = require("./routes/members");
const attendanceRoutes = require("./routes/attendance");
const adminRoutes = require("./routes/admin");
const orderRoutes = require("./routes/orders");
const serverRoutes = require("./routes/servers");
const settingsRoutes = require("./routes/settings");
const companySettingsRoutes = require("./routes/companySettings");
const uploadRoutes = require("./routes/upload");
const exportRoutes = require("./routes/export");

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  perMessageDeflate: true,
});

const PORT = process.env.PORT || 3000;

// Expose io to routes
app.set("io", io);

// Socket.io Connection
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  // Broadcast new orders to other clients (e.g. KDS screens)
  socket.on("new_order", (data) => {
    console.log("📦 [Server] New order event received:", data.orderId);
    socket.broadcast.emit("new_order", data);
  });

  // 🚀 INSTANT SYNC: Relay cart changes between tablets without DB lag
  socket.on("cart_change", (data) => {
    console.log("🛒 [Server] Cart change relay:", data.tableId);
    socket.broadcast.emit("cart_change", data);
  });

  // Broadcast status updates (e.g. order completed, items voided)
  socket.on("order_status_update", (data) => {
    console.log("🔄 [Server] Order status update received:", data.orderId);
    socket.broadcast.emit("order_status_update", data);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected:", socket.id);
  });
});

// ✅ Global Middleware
app.use(compression()); // Compress all responses
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: '1d',
  immutable: true
}));

// 🔄 Database Connection Check (for all API routes)
app.use("/api", dbCheck);

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", salesRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/export", exportRoutes);

// Root Endpoints
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; padding: 40px; text-align: center;">
      <h1 style="color: #4CAF50;">🚀 UCS Modular POS Backend is LIVE</h1>
      <p>Status: ✅ Connected to Database</p>
      <p>Time: ${new Date().toLocaleString()}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666;">Ready for Waiter & KDS Sync</p>
    </div>
  `);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Legacy support (redirects to ensure existing frontend calls don't break)
app.post("/api/checkout", (req, res) =>
  res.redirect(307, "/api/orders/checkout"),
);
app.get("/tables", (req, res) => res.redirect("/api/tables/all"));
app.get("/kitchens", (req, res) => res.redirect("/api/menu/kitchens"));
app.get("/dishgroups/:id", (req, res) =>
  res.redirect(`/api/menu/dishgroups/${req.params.id}`),
);
app.get("/dishes/:id", (req, res) =>
  res.redirect(`/api/menu/dishes/group/${req.params.id}`),
);
app.get("/api/dishes/all", (req, res) => res.redirect("/api/menu/dishes/all"));
app.get("/api/discounts", (req, res) => res.redirect("/api/admin/discounts"));
app.get("/modifiers/:id", (req, res) =>
  res.redirect(`/api/menu/modifiers/${req.params.id}`),
);
app.get("/image/:id", (req, res) =>
  res.redirect(`/api/menu/image/${req.params.id}`),
);

// 🧹 JANITOR HEARTBEAT: Professional Ghost Cleanup (Every 5 minutes)
// This safety net closes any orphan orders belonging to available tables.
setInterval(async () => {
  try {
    const pool = await poolPromise;
    if (!pool || !pool.connected) return;
    
    // 1. Close orders for tables that are marked as Available (Status 0)
    const result = await pool.request().query(`
      UPDATE RestaurantOrderCur 
      SET isOrderClosed = 1, ModifiedOn = GETDATE()
      WHERE (isOrderClosed = 0 OR isOrderClosed IS NULL)
      AND LTRIM(RTRIM(Tableno)) IN (
        SELECT LTRIM(RTRIM(TableNumber)) 
        FROM TableMaster 
        WHERE Status = 0
      )
      AND DATEDIFF(MINUTE, CreatedOn, GETDATE()) > 5; -- 5 min buffer to prevent race conditions
    `);
    
    if (result.rowsAffected[0] > 0) {
      console.log(`🧹 [Janitor] Cleared ${result.rowsAffected[0]} orphan orders.`);
      io.emit("cart_updated", { tableId: "GLOBAL_CLEANUP" });
    }

    // 2. Ensure items in DetailCur are also marked served if their parent order is closed
    await pool.request().query(`
      UPDATE RestaurantOrderDetailCur
      SET StatusCode = 4, ModifiedOn = GETDATE()
      WHERE StatusCode IN (1, 2, 3, 5)
      AND OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE isOrderClosed = 1)
    `);
  } catch (err) {
    console.error("🧹 [Janitor] Cleanup failed:", err.message);
  }
}, 5 * 60 * 1000); // 5 Minutes

/* ================= START SERVER ================= */
httpServer.listen(PORT, async () => {
  console.log(`🚀 Modular Server running on port ${PORT}`);

  try {
    const pool = await poolPromise;
    if (pool) {
      await initDB(pool);
      // ✅ One-time migration: Fix any active tables with NULL StartTime
      await pool.request().query("UPDATE TableMaster SET StartTime = GETDATE() WHERE StartTime IS NULL AND Status IN (1, 2, 3, 4)");
      console.log("✅ Database initialized and ready.");
    }
  } catch (err) {
    console.error("⚠️ Initial DB setup failed:", err.message);
  }
});
