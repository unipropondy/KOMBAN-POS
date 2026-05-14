const { poolPromise } = require('../backend/config/db');

async function checkOrphans() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT TOP 5 
        sid.DishName, 
        sid.SettlementID as ItemSettlementID,
        sh.SettlementID as HeaderSettlementID,
        sh.LastSettlementDate
      FROM SettlementItemDetail sid
      LEFT JOIN SettlementHeader sh ON sid.SettlementID = sh.SettlementID
      ORDER BY sid.OrderDateTime DESC
    `);
    console.log('🔍 Join Check:', JSON.stringify(res.recordset, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

checkOrphans();
