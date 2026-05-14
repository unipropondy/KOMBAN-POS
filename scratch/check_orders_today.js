const sql = require("mssql");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

async function checkOrders() {
    try {
        const pool = await sql.connect(config);
        const today = new Date().toISOString().split("T")[0];
        
        console.log(`Checking orders for ${today}...`);
        
        const result = await pool.request()
            .input("today", sql.VarChar, today)
            .query(`
                SELECT SettlementID, BillNo, LastSettlementDate, SysAmount, IsCancelled 
                FROM SettlementHeader 
                WHERE CAST(LastSettlementDate AS DATE) = @today
                ORDER BY LastSettlementDate DESC
            `);
            
        console.table(result.recordset);
        
        const stsCount = await pool.request().query("SELECT COUNT(*) as count FROM SettlementTotalSales");
        console.log(`Total SettlementTotalSales records: ${stsCount.recordset[0].count}`);
        
        const shCount = await pool.request().query("SELECT COUNT(*) as count FROM SettlementHeader");
        console.log(`Total SettlementHeader records: ${shCount.recordset[0].count}`);

        await pool.close();
    } catch (err) {
        console.error(err);
    }
}

checkOrders();
