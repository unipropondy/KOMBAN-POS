const { poolPromise, sql } = require("../backend/config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("🔍 Fetching CategoryKitchenType table...");
    const result = await pool.request().query("SELECT * FROM CategoryKitchenType");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
