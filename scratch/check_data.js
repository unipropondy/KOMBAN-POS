const { poolPromise } = require('../backend/config/db');

async function checkData() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM SettlementHeader WHERE CAST(LastSettlementDate AS DATE) = CAST(GETDATE() AS DATE)) as TodayOrders,
        (SELECT COUNT(*) FROM SettlementItemDetail) as TotalItemsStored
    `);
    console.log('📊 Stats:', res.recordset[0]);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkData();
