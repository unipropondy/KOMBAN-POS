const { poolPromise } = require('../backend/config/db');

async function fixSchema() {
  try {
    const pool = await poolPromise;
    console.log('🔄 Checking and adding columns...');
    
    // Add CategoryName
    try {
      await pool.request().query("ALTER TABLE SettlementItemDetail ADD CategoryName NVARCHAR(255) NULL");
      console.log('✅ Added CategoryName');
    } catch (e) {
      console.log('ℹ️ CategoryName check:', e.message.includes('already exists') ? 'Already exists' : e.message);
    }

    // Add SubCategoryName
    try {
      await pool.request().query("ALTER TABLE SettlementItemDetail ADD SubCategoryName NVARCHAR(255) NULL");
      console.log('✅ Added SubCategoryName');
    } catch (e) {
      console.log('ℹ️ SubCategoryName check:', e.message.includes('already exists') ? 'Already exists' : e.message);
    }

    console.log('🏁 Database schema update complete.');
  } catch (err) {
    console.error('❌ Major Error:', err.message);
  } finally {
    process.exit(0);
  }
}

fixSchema();
