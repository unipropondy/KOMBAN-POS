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

async function listTables() {
    try {
        await sql.connect(config);
        const res = await sql.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
        console.log(res.recordset.map(r => r.TABLE_NAME));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

listTables();
