const { poolPromise } = require('../backend/config/db');

async function checkDates() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT DISTINCT TOP 5 CAST(LastSettlementDate AS DATE) as UniqueDate
      FROM SettlementHeader
      ORDER BY UniqueDate DESC
    `);
    const now = await pool.request().query("SELECT GETDATE() as ServerTime");
    
    console.log('📅 Unique Dates in DB:', res.recordset);
    console.log('⏰ Current Server Time:', now.recordset[0].ServerTime);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkDates();
