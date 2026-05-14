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

async function checkOrders() {
    try {
        await sql.connect(config);
        const res = await sql.query("SELECT OrderId, Tableno, OrderNumber, isOrderClosed, CreatedOn FROM RestaurantOrderCur WHERE isOrderClosed = 0 OR isOrderClosed IS NULL ORDER BY CreatedOn DESC");
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkOrders();
