const sql = require('mssql');
require('dotenv').config({ path: '../backend/.env' });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
    port: parseInt(process.env.DB_PORT) || 1433
};

async function checkTodaySales() {
    try {
        let pool = await sql.connect(config);
        console.log("Connected to DB");
        
        const result = await pool.request().query(`
            SELECT TOP 10 SettlementID, LastSettlementDate, BillNo, SysAmount
            FROM SettlementHeader
            WHERE CAST(LastSettlementDate AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY LastSettlementDate DESC
        `);
        
        console.log("Today's Sales Count:", result.recordset.length);
        console.log("Sample Data:", JSON.stringify(result.recordset, null, 2));

        const allToday = await pool.request().query(`
            SELECT COUNT(*) as count, SUM(SysAmount) as total
            FROM SettlementHeader
            WHERE CAST(LastSettlementDate AS DATE) = CAST(GETDATE() AS DATE)
        `);
        console.log("Summary:", allToday.recordset[0]);

        // Check if there are ANY sales recently
        const recent = await pool.request().query(`
            SELECT TOP 5 LastSettlementDate FROM SettlementHeader ORDER BY LastSettlementDate DESC
        `);
        console.log("Last 5 sales dates:", recent.recordset.map(r => r.LastSettlementDate));

    } catch (err) {
        console.error(err);
    } finally {
        sql.close();
    }
}

checkTodaySales();
