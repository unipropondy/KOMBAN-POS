const { poolPromise } = require('../backend/config/db');

async function checkViews() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT name, type_desc FROM sys.objects 
      WHERE name IN ('vw_Dishsalesreport', 'vw_categorysalesreport')
    `);
    console.log('👀 Found Views:', res.recordset);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkViews();
