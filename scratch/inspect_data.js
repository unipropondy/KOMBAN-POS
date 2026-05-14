const { poolPromise } = require('../backend/config/db');

async function inspectData() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT TOP 20 
        DishName, 
        Qty, 
        Price, 
        CategoryName, 
        SubCategoryName,
        OrderDateTime
      FROM SettlementItemDetail 
      ORDER BY OrderDateTime DESC
    `);
    console.log('📝 Recent Items:', JSON.stringify(res.recordset, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

inspectData();
