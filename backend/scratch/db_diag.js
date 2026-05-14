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
        const res = await pool.request().query(`
            SELECT count(*) as count FROM RestaurantOrderCur;
            SELECT count(*) as count FROM RestaurantOrderDetailCur;
            
            -- Check indexes
            SELECT 
                t.name AS TableName,
                i.name AS IndexName,
                c.name AS ColumnName
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            WHERE t.name IN ('RestaurantOrderCur', 'RestaurantOrderDetailCur')
            ORDER BY t.name, i.name;
        `);
        console.log(JSON.stringify(res.recordsets, null, 2));
        await sql.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
