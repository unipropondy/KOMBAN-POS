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

async function check() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TableMaster' AND COLUMN_NAME IN ('Status', 'StartTime')
        `);
        console.log('--- SCHEMA ---');
        console.log(result.recordset);
        
        const data = await pool.request().query(`
            SELECT TOP 5 TableNumber, Status, StartTime FROM TableMaster WHERE Status > 0
        `);
        console.log('--- ACTIVE TABLES ---');
        console.log(data.recordset);
        
        await pool.close();
    } catch (e) {
        console.log('Error:', e.message);
    }
}
check();
