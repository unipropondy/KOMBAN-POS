const sql = require("mssql");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function check() {
  try {
    const pool = await sql.connect(dbConfig);
    const res = await pool.request().query("SELECT TOP 5 ItemId, CartId, OrderNo, Status FROM CartItems ORDER BY DateCreated DESC");
    console.log("CartItems Sample:");
    console.table(res.recordset);
    
    const res2 = await pool.request().query("SELECT TOP 5 TableId, CurrentOrderId, Status FROM TableMaster WHERE Status <> 0");
    console.log("TableMaster Active:");
    console.table(res2.recordset);
    
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

check();
