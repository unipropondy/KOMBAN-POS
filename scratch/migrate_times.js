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

async function migrate() {
    try {
        const pool = await sql.connect(config);
        console.log('--- MIGRATING NULL START TIMES ---');
        const result = await pool.request().query(`
            UPDATE TableMaster 
            SET StartTime = GETDATE() 
            WHERE StartTime IS NULL AND Status IN (1, 2, 3, 4)
        `);
        console.log(`Updated ${result.rowsAffected[0]} tables.`);
        await pool.close();
    } catch (e) {
        console.log('Error:', e.message);
    }
}
migrate();
