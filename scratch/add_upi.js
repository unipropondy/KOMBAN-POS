const { poolPromise } = require('../backend/config/db');

async function addUpi() {
  try {
    const pool = await poolPromise;
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM Paymode WHERE LTRIM(RTRIM(PayMode)) = 'UPI')
      BEGIN
        INSERT INTO Paymode (PayMode, Description, Position, Active, isEntertainment, isVoucher)
        VALUES ('UPI', 'UPI / GPAY', 4, 1, 0, 0)
        PRINT 'UPI Added'
      END
      ELSE
      BEGIN
        UPDATE Paymode SET Active = 1, Description = 'UPI / GPAY' WHERE LTRIM(RTRIM(PayMode)) = 'UPI'
        PRINT 'UPI Updated'
      END
    `);
    console.log('✅ Success');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

addUpi();
