const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function checkCols(tableName) {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("table", sql.VarChar, tableName)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @table
      `);
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkCols(process.argv[2] || "TableMaster");
