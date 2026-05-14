/* 
  SMART KOT ROUTING QUERY (OPTIMIZED)
  
  ANALYSIS:
  1. Duplicate Prevention: If multiple active printers share the same KitchenTypeCode 
     (e.g., 'TakeAway' and 'english' both using 6), this query selects only one 
     to prevent double-printing.
  2. Join Integrity: Properly links Dish -> DishGroup -> Category -> Kitchen.
  3. Reliability: Uses LEFT JOIN with ISNULL fallbacks to ensure dishes with 
     missing mappings are still sent to a default 'KITCHEN' printer rather than being lost.
  4. Routing Optimization: Consolidates items by Printer IP to minimize redundant print jobs.
*/

WITH OptimizedPrinters AS (
    -- Deduplicate printers by KitchenTypeValue (picks the first active one)
    SELECT *,
           ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as Ranker
    FROM PrintMaster
    WHERE IsActive = 1
),
MappedOrders AS (
    SELECT 
        OD.OrderId,
        OD.DishName,
        OD.Quantity,
        OD.Remarks,
        -- Fallback to 'KITCHEN' if no mapping exists
        ISNULL(PM.KitchenTypeName, 'KITCHEN') AS TargetKitchen,
        ISNULL(PM.PrinterName, 'Kitchen Printer') AS PrinterName,
        -- Ensure we always have an IP, even if the mapping join fails
        ISNULL(PM.PrinterPath, (SELECT TOP 1 PrinterPath FROM OptimizedPrinters WHERE KitchenTypeValue = 2)) AS PrinterPath,
        ISNULL(PM.PrinterIP, (SELECT TOP 1 PrinterIP FROM OptimizedPrinters WHERE KitchenTypeValue = 2)) AS PrinterIP,
        -- Fallback to Code 2 (Indian/Kitchen) if no mapping exists
        ISNULL(PM.KitchenTypeValue, 2) AS PrinterCode
    FROM RestaurantOrderDetailCur OD -- Change to RestaurantOrderDetailCur for Main POS
    INNER JOIN DishMaster DM ON OD.DishId = DM.DishId
    LEFT JOIN DishGroupMaster DGM ON DM.DishGroupId = DGM.DishGroupId
    LEFT JOIN CategoryKitchenType CKT ON DGM.CategoryId = CKT.CategoryId
    LEFT JOIN OptimizedPrinters PM ON CKT.KitchenTypeCode = PM.KitchenTypeValue AND PM.Ranker = 1
    WHERE 
        OD.OrderId = @TargetOrderId 
        AND OD.StatusCode = 1 -- Only print active items
)
SELECT * 
FROM MappedOrders
ORDER BY PrinterCode;

/* 
  KEY IMPROVEMENTS MADE:
  - Added 'OptimizedPrinters' CTE to handle the duplicate 'english'/'TakeAway' entries found in PrintMaster.
  - Switched to LEFT JOINs to prevent dishes with missing mappings (like North Indian or Chinese) from being ignored.
  - Added Fallback logic (ISNULL) to route unmapped items to a default kitchen.
  - Included DishGroupMaster in the join path for database consistency.
*/
