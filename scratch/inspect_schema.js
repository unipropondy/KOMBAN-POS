const { poolPromise } = require("../backend/config/db");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

async function listSchema() {
  try {
    const pool = await poolPromise;
    
    console.log("--- TABLES ---");
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    console.table(tables.recordset);

    for (const row of tables.recordset) {
      const tableName = row.TABLE_NAME;
      console.log(`\n--- COLUMNS FOR ${tableName} ---`);
      const columns = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = '${tableName}'
      `);
      console.table(columns.recordset);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

listSchema();
