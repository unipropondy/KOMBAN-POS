const sql = require('mssql');
require('dotenv').config({path: 'backend/.env'});

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function checkTakeaways() {
    try {
        await sql.connect(config);
        const res = await sql.query("SELECT TableId, TableNumber, DiningSection FROM TableMaster WHERE DiningSection = 4 OR TableNumber LIKE 'T%'");
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkTakeaways();
