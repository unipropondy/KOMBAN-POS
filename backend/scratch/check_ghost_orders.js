const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        const pool = await sql.connect(config);
        console.log("Checking for multiple open orders per table...");
        const res = await pool.request().query(`
            SELECT Tableno, COUNT(*) as OpenOrderCount
            FROM RestaurantOrderCur
            WHERE isOrderClosed = 0 OR isOrderClosed IS NULL
            GROUP BY Tableno
            HAVING COUNT(*) > 1;
            
            SELECT TOP 20 OrderId, OrderNumber, Tableno, isOrderClosed, CreatedOn
            FROM RestaurantOrderCur
            WHERE Tableno IN (
                SELECT Tableno
                FROM RestaurantOrderCur
                WHERE isOrderClosed = 0 OR isOrderClosed IS NULL
                GROUP BY Tableno
                HAVING COUNT(*) > 1
            )
            AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
            ORDER BY Tableno, CreatedOn DESC;
        `);
        console.log(JSON.stringify(res.recordsets, null, 2));
        await sql.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
