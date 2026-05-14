/* 
  SMART KOT QUERY: 
  This query finds exactly which printer each dish should be sent to 
  based on its Category mapping.
*/

SELECT 
    OD.OrderId,
    OD.DishName,
    OD.Quantity,
    OD.Remarks,
    PM.KitchenTypeName AS TargetKitchen,
    PM.PrinterName,
    PM.PrinterPath,
    PM.PrinterIP,
    PM.KitchenTypeValue AS PrinterCode
FROM RestaurantSelfOrderDetailCur OD
-- 1. Link Dish to its Category Group
INNER JOIN DishMaster DM ON OD.DishId = DM.DishId
-- 2. Link Category to its Kitchen Mapping
INNER JOIN CategoryKitchenType CKT ON DM.DishGroupId = CKT.CategoryId
-- 3. Link Mapping to the actual Printer hardware
INNER JOIN PrintMaster PM ON CKT.KitchenTypeCode = PM.KitchenTypeValue
WHERE 
    OD.OrderId = @TargetOrderId -- Pass the ID of the order you want to print
    AND OD.StatusCode = 1       -- Only print active items
    AND PM.IsActive = 1         -- Only use active printers
ORDER BY PM.KitchenTypeValue;

/* 
  HOW TO USE IN CODE:
  1. Run this query for the current OrderId.
  2. In your code, group the results by 'PrinterCode'.
  3. Send each group's items to the 'PrinterPath' or 'PrinterIP' listed in the result.
*/
