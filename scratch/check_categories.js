const { poolPromise, sql } = require("../backend/config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("🔍 Fetching Category table...");
    const result = await pool.request().query("SELECT CategoryId, CategoryName, KitchenTypeCode, KitchenTypeName, PrinterIP FROM Category");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
