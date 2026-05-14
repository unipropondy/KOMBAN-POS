const path = require('path');
const { poolPromise } = require(path.resolve(__dirname, '../backend/config/db.js'));

async function check() {
  try {
    const pool = await poolPromise;
    const r = await pool.request().query(`
      SELECT name, type_desc 
      FROM sys.objects 
      WHERE type IN ('U', 'V')
      ORDER BY name
    `);
    console.log(JSON.stringify(r.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
