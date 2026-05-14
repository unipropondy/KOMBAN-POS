const sql = require("mssql");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

async function debugInit() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log("Connected to DB");

        const steps = [
            {
                name: "SettlementItemDetail Table",
                query: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND type in (N'U'))
                        CREATE TABLE [dbo].[SettlementItemDetail]([ID] [int] IDENTITY(1,1) NOT NULL, [SettlementID] [uniqueidentifier] NULL)`
            },
            {
                name: "MemberMaster Table",
                query: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND type in (N'U'))
                        CREATE TABLE [dbo].[MemberMaster]([MemberId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(), [Name] [nvarchar](255) NOT NULL)`
            },
            {
                name: "SettlementHeader - IsCancelled",
                query: `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'IsCancelled') ALTER TABLE [dbo].[SettlementHeader] ADD IsCancelled BIT DEFAULT 0`
            },
            {
                name: "SettlementHeader - CancelledBy",
                query: `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledBy') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledBy UNIQUEIDENTIFIER NULL`
            },
            {
                name: "SettlementHeader - CancelledDate",
                query: `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledDate') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledDate DATETIME NULL`
            },
             {
                name: "SettlementHeader - VoidItemQty",
                query: `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemQty') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemQty INT DEFAULT 0`
            },
            {
                name: "SettlementDiscountDetail Table",
                query: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementDiscountDetail]') AND type in (N'U'))
                        CREATE TABLE [dbo].[SettlementDiscountDetail]([ID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY, [SettlementId] [uniqueidentifier] NULL)`
            }
        ];

        for (const step of steps) {
            console.log(`Running: ${step.name}...`);
            try {
                await pool.request().query(step.query);
                console.log(`✅ ${step.name} OK`);
            } catch (err) {
                console.error(`❌ ${step.name} FAILED:`, err.message);
                console.error(err);
            }
        }

    } catch (err) {
        console.error("Connection failed:", err);
    } finally {
        if (pool) await pool.close();
    }
}

debugInit();
