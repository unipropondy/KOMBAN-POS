const sql = require("mssql");

async function initDB(pool) {
  if (!pool) return;
  console.log("🔄 Running schema check and initialization...");

  const runQuery = async (name, query) => {
    try {
      await pool.request().query(query);
      console.log(`✅ ${name} OK`);
    } catch (err) {
      console.error(`❌ ${name} FAILED:`, err.message);
      // We don't throw here to allow other steps to try, but in production you might want to
    }
  };

  try {
    // 1. SettlementItemDetail
    await runQuery("Create SettlementItemDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementItemDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL,
              [SettlementID] [uniqueidentifier] NULL,
              [DishId] [uniqueidentifier] NULL,
              [DishGroupId] [uniqueidentifier] NULL,
              [SubCategoryId] [uniqueidentifier] NULL,
              [CategoryId] [uniqueidentifier] NULL,
              [DishName] [nvarchar](255) NULL,
              [Qty] [int] NULL,
              [Price] [decimal](18, 2) NULL,
              [OrderDateTime] [datetime] NULL
          ) ON [PRIMARY]
      END
    `);

    // 2. MemberMaster
    await runQuery("Create MemberMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[MemberMaster](
              [MemberId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [Name] [nvarchar](255) NOT NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [IsActive] [bit] DEFAULT 1,
              [Balance] [decimal](18, 2) DEFAULT 0,
              [CreditLimit] [decimal](18, 2) DEFAULT 0,
              [CurrentBalance] [decimal](18, 2) DEFAULT 0,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 3. SettlementHeader Columns
    await runQuery("SettlementHeader - IsCancelled", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'IsCancelled') ALTER TABLE [dbo].[SettlementHeader] ADD IsCancelled BIT DEFAULT 0");
    await runQuery("SettlementHeader - CancellationReason", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancellationReason') ALTER TABLE [dbo].[SettlementHeader] ADD CancellationReason NVARCHAR(255)");
    await runQuery("SettlementHeader - CancelledBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledBy') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledBy UNIQUEIDENTIFIER NULL");
    await runQuery("SettlementHeader - CancelledDate", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledDate') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledDate DATETIME NULL");
    await runQuery("SettlementHeader - CancelledByUserName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledByUserName') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledByUserName NVARCHAR(100) NULL");
    await runQuery("SettlementHeader - SER_NAME", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'SER_NAME') ALTER TABLE [dbo].[SettlementHeader] ADD SER_NAME NVARCHAR(255)");
    await runQuery("SettlementHeader - VoidItemQty", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemQty') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemQty INT DEFAULT 0");
    await runQuery("SettlementHeader - VoidItemAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemAmount') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - ServiceCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'ServiceCharge') ALTER TABLE [dbo].[SettlementHeader] ADD ServiceCharge DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - RoundedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'RoundedBy') ALTER TABLE [dbo].[SettlementHeader] ADD RoundedBy DECIMAL(18, 2) DEFAULT 0");

    // 4. SettlementItemDetail Columns
    await runQuery("SettlementItemDetail - Status", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Status') ALTER TABLE [dbo].[SettlementItemDetail] ADD Status NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - CategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'CategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD CategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - SubCategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SubCategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD SubCategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - Spicy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Spicy') ALTER TABLE [dbo].[SettlementItemDetail] ADD Spicy NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Salt", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Salt') ALTER TABLE [dbo].[SettlementItemDetail] ADD Salt NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Oil", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Oil') ALTER TABLE [dbo].[SettlementItemDetail] ADD Oil NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Sugar", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Sugar') ALTER TABLE [dbo].[SettlementItemDetail] ADD Sugar NVARCHAR(50) NULL");

    // 5. CancelRemarksMaster
    await runQuery("Create CancelRemarksMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CancelRemarksMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CancelRemarksMaster](
              [CRCode] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [CRName] [nvarchar](255) NOT NULL,
              [IsActive] [bit] DEFAULT 1
          )
      END
    `);

    await runQuery("Insert CancelRemarks", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CancelRemarksMaster])
      BEGIN
          INSERT INTO [dbo].[CancelRemarksMaster] (CRName, IsActive) VALUES 
          ('Customer Changed Mind', 1),
          ('Order Error', 1),
          ('Duplicate Order', 1),
          ('Long Wait Time', 1),
          ('Technical Issue', 1),
          ('Out of Stock', 1)
      END
    `);

    // 6. CartItems
    await runQuery("Create CartItems", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CartItems](
              [ItemId] [nvarchar](128) NOT NULL PRIMARY KEY,
              [CartId] [nvarchar](max) NULL,
              [ProductId] [nvarchar](128) NULL,
              [Quantity] [int] NULL,
              [Cost] [decimal](18, 2) NULL,
              [OrderNo] [nvarchar](max) NULL,
              [OrderConfirmQty] [int] NULL,
              [DateCreated] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 7. SettlementDiscountDetail
    await runQuery("Create SettlementDiscountDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementDiscountDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementDiscountDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [SettlementId] [uniqueidentifier] NULL,
              [DiscountId] [uniqueidentifier] NULL,
              [Description] [nvarchar](255) NULL,
              [SysAmount] [decimal](18, 2) NULL,
              [ManualAmount] [decimal](18, 2) NULL,
              [SortageOrExces] [decimal](18, 2) NULL
          )
      END
    `);

    // 8. POS Nitro Professional Updates
    await runQuery("RestaurantOrderDetailCur - ModifiersJSON", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'ModifiersJSON') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD ModifiersJSON NVARCHAR(MAX)");
    await runQuery("RestaurantOrderDetailCur - OrderNumber", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'OrderNumber') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD OrderNumber NVARCHAR(100)");
    await runQuery("RestaurantOrderDetailCur - Remarks", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'Remarks') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD Remarks NVARCHAR(300)");
    await runQuery("RestaurantOrderDetailCur - isTakeAway", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'isTakeAway') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD isTakeAway BIT DEFAULT 0");

    await runQuery("TableMaster - CurrentOrderId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'CurrentOrderId') ALTER TABLE [dbo].[TableMaster] ADD CurrentOrderId NVARCHAR(100)");

    await runQuery("Create OrderSequences", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OrderSequences]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[OrderSequences](
              [RestaurantId] [uniqueidentifier] NOT NULL,
              [SequenceDate] [date] NOT NULL,
              [LastNumber] [int] NOT NULL DEFAULT 0,
              PRIMARY KEY ([RestaurantId], [SequenceDate])
          )
      END
    `);

    // 9. Ensure Discount Columns in Professional Tables
    await runQuery("RestaurantOrderDetailCur - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetailCur - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountType NVARCHAR(50)");
    
    await runQuery("RestaurantOrderDetail - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetail - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountType NVARCHAR(50)");
    
    await runQuery("SettlementHeader - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountType') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountType NVARCHAR(50)");

    // 10. Performance Indexes
    await runQuery("Index - SettlementHeader Date", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_Date') CREATE INDEX IX_SettlementHeader_Date ON [dbo].[SettlementHeader] (LastSettlementDate)");
    await runQuery("Index - SettlementHeader BillNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_BillNo') CREATE INDEX IX_SettlementHeader_BillNo ON [dbo].[SettlementHeader] (BillNo)");
    await runQuery("Index - SettlementItemDetail ID", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementItemDetail_SID') CREATE INDEX IX_SettlementItemDetail_SID ON [dbo].[SettlementItemDetail] (SettlementID)");
    await runQuery("Index - RestaurantOrderCur Tableno", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_Tableno') CREATE INDEX IX_RestaurantOrderCur_Tableno ON [dbo].[RestaurantOrderCur] (Tableno)");
    await runQuery("Index - RestaurantOrderCur OrderNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_OrderNo') CREATE INDEX IX_RestaurantOrderCur_OrderNo ON [dbo].[RestaurantOrderCur] (OrderNumber)");
    await runQuery("Index - RestaurantOrderDetailCur OrderId", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderDetailCur_OrderId') CREATE INDEX IX_RestaurantOrderDetailCur_OrderId ON [dbo].[RestaurantOrderDetailCur] (OrderId)");
    await runQuery("Index - TableMaster SortCode", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableMaster_SortCode') CREATE INDEX IX_TableMaster_SortCode ON [dbo].[TableMaster] (SortCode)");

    console.log("✅ Database schema and performance indexes are up to date.");
  } catch (err) {
    console.error("❌ initDB CRITICAL ERROR:", err.message);
  }
}

module.exports = { initDB };
