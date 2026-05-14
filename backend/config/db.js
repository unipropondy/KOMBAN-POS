const path = require("path");
// Adjust path to root of backend folder where .env is located
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 60000, 
    requestTimeout: 60000,
    appName: "POS_System"
  },
  connectionTimeout: 60000,
  requestTimeout: 60000,
  pool: {
    max: 100,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Log configuration for debugging (mask password)
console.log("📋 Database Configuration:");
console.log(`   Server: ${dbConfig.server || "NOT SET"}`);
console.log(`   Port: ${dbConfig.port || "NOT SET"}`);
console.log(`   Database: ${dbConfig.database || "NOT SET"}`);
console.log(`   User: ${dbConfig.user || "NOT SET"}`);
console.log(`   Connection Timeout: ${dbConfig.connectionTimeout}ms`);

let poolInstance = null;

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log("✅ Connected to MSSQL Successfully");
    poolInstance = pool;
    return pool;
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err.message);
    console.error("   Error Code:", err.code);
    console.error("   Please verify your .env file contains:");
    console.error("   - DB_SERVER: " + dbConfig.server);
    console.error("   - DB_PORT: " + dbConfig.port);
    console.error("   - DB_NAME: " + dbConfig.database);
    console.error("   - DB_USER: " + dbConfig.user);
    console.error("   - DB_PASSWORD: (hidden)");
    return null;
  });

module.exports = { 
    sql, 
    poolPromise, 
    dbConfig,
    getPool: () => poolInstance 
};
