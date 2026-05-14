import { useEffect, useRef } from "react";
import { socket } from "../constants/socket";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";
import { useCartStore } from "../stores/cartStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";

/**
 * useGlobalSocketSync
 * 
 * Handles real-time synchronization for the entire app.
 * This should be used at the Root Layout level to ensure consistency across all screens.
 */
export function useGlobalSocketSync() {
  const { appendOrder, closeActiveOrder, markItemReady, markItemServed, markItemsSent, voidOrderItem } = useActiveOrdersStore.getState();
  const { fetchCartFromDB } = useCartStore.getState();
  const lastFetchRef = useRef<Record<string, number>>({});

  // 🚀 THROTTLED FETCH: Prevents mass-refetching when multiple items update at once
  const throttledFetch = (tableId: string) => {
    const now = Date.now();
    const last = lastFetchRef.current[tableId] || 0;
    if (now - last > 1000) {
      lastFetchRef.current[tableId] = now;
      fetchCartFromDB(tableId);
    }
  };

  useEffect(() => {
    // --- 0. RECONNECTION RE-SYNC ---
    const handleReconnect = () => {
      console.log("🔌 [Socket-Global] Reconnected. Re-syncing active orders...");
      useActiveOrdersStore.getState().fetchActiveKitchenOrders();
      // Optionally refresh all tables if needed
    };

    // --- 1. NEW ORDERS ---
    const handleNewOrder = (payload: any) => {
      console.log("📦 [Socket-Global] New order:", payload.orderId);
      appendOrder(payload.orderId, payload.context, payload.items, payload.createdAt);
      markItemsSent(payload.orderId);
    };

    // --- 2. TABLE STATUS ---
    const handleTableStatus = (data: any) => {
      const now = Date.now();
      const tableId = data.tableId || data.tableid;
      if (!tableId) return;

      console.log(`[TRACE] [${now}] [SOCKET_RECEIVE] table_status_updated | Table: ${tableId} | Status: ${data.status}`);

      const status = data.status !== undefined ? data.status : data.Status;
      const totalAmount = data.totalAmount !== undefined ? data.totalAmount : data.TotalAmount;
      const startTime = data.startTime || data.StartTime;
      const currentOrderId = data.currentOrderId || data.CurrentOrderId;
      const isHoldOvertime = data.isHoldOvertime !== undefined ? data.isHoldOvertime : data.IsHoldOvertime;
      const lockedByName = data.lockedByName;
      
      const store = useTableStatusStore.getState();
      const cleanTableId = String(tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      let existingTable = store.tables.find((t: any) => {
        const tId = String(t.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
        return tId === cleanTableId;
      });
      
      if (!existingTable && data.tableNo) {
        existingTable = store.tables.find((t: any) => 
          String(t.tableNo) === String(data.tableNo) && 
          String(t.section) === String(data.section)
        );
      }

      // 🚀 INSTANT SYNC: Apply the status update immediately
      if (existingTable || (data.tableNo && data.section)) {
        store.updateTableStatus(
          tableId,
          existingTable?.section || data.section,
          existingTable?.tableNo || data.tableNo,
          currentOrderId || "SYNC",
          (status === 5 ? "LOCKED" : (status === 1 || status === 4) ? "SENT" : status === 2 ? "BILL_REQUESTED" : status === 3 ? "HOLD" : "EMPTY") as any,
          startTime,
          lockedByName,
          totalAmount,
          true, 
          isHoldOvertime
        );
      }

      // ⚡ If this is our current table, refresh the cart
      const currentOrder = useOrderContextStore.getState().currentOrder;
      if (currentOrder?.tableId === tableId) {
        console.log(`[TRACE] [${Date.now()}] [SOCKET_RECEIVE] Table ${tableId} is ACTIVE. Refreshing cart...`);
        throttledFetch(tableId);
      }
    };

    // --- 3. ITEM STATUS (READY/SERVED) ---
    const handleItemStatus = (payload: { orderId: string; lineItemId: string; status: string; tableId?: string }) => {
      console.log(`✨ [Socket-Global] Item ${payload.status}:`, payload.lineItemId);
      
      if (payload.status === "READY") {
        markItemReady(payload.orderId, payload.lineItemId, true);
      } else if (payload.status === "SERVED") {
        markItemServed(payload.orderId, payload.lineItemId, true);
      } else if (payload.status === "VOIDED") {
        voidOrderItem(payload.orderId, payload.lineItemId);
      }

      const currentOrder = useOrderContextStore.getState().currentOrder;
      const targetTableId = payload.tableId; 
      
      if (targetTableId) {
        throttledFetch(targetTableId);
      } else if (currentOrder?.tableId) {
        throttledFetch(currentOrder.tableId);
      }
    };

    // --- 4. CART UPDATED ---
    const handleCartUpdated = (data: { tableId: string }) => {
      console.log("🛒 [Socket-Global] Cart updated for Table:", data.tableId);
      const currentOrder = useOrderContextStore.getState().currentOrder;
      if (data.tableId && data.tableId === currentOrder?.tableId) {
        throttledFetch(data.tableId);
      }
      useActiveOrdersStore.getState().fetchActiveKitchenOrders();
    };

    // --- 5. ORDER STATUS (CLOSE/VOID) ---
    const handleOrderStatusUpdate = (payload: { orderId: string; action: "CLOSE" | "VOID"; lineItemId?: string }) => {
      console.log(`🔄 [Socket-Global] Order ${payload.action}:`, payload.orderId);
      if (payload.action === "CLOSE") {
        closeActiveOrder(payload.orderId);
      } else if (payload.action === "VOID" && payload.lineItemId) {
        voidOrderItem(payload.orderId, payload.lineItemId);
      }
    };

    // --- 6. INSTANT CART SYNC (Socket-First) ---
    const handleCartChange = (payload: { tableId: string; contextId: string; items: any[]; lastUpdate: number; version?: number }) => {
      const now = Date.now();
      console.log(`[TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | Items: ${payload.items.length} | PayloadVersion: ${payload.version || 'NONE'}`);

      const store = useCartStore.getState();
      const currentLastUpdate = store.lastLocalUpdate[payload.contextId] || 0;

      // 🛡️ SYNC SHIELD: Only update if the socket data is NEWER than our last local edit
      if (payload.lastUpdate <= currentLastUpdate) {
        console.log(`🛡️ [TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | ABORTED (Stale: ${payload.lastUpdate} <= ${currentLastUpdate})`);
        return;
      }

      console.log(`⚡ [TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | APPLYING`);
      store.setCartItems(payload.contextId, payload.items, true, "SOCKET_CHANGE");
    };

    socket.on("connect", handleReconnect);
    socket.on("new_order", handleNewOrder);
    socket.on("table_status_updated", handleTableStatus);
    socket.on("item_status_updated", handleItemStatus);
    socket.on("cart_updated", handleCartUpdated);
    socket.on("order_status_update", handleOrderStatusUpdate);
    socket.on("cart_change", handleCartChange);

    return () => {
      socket.off("connect", handleReconnect);
      socket.off("new_order", handleNewOrder);
      socket.off("table_status_updated", handleTableStatus);
      socket.off("item_status_updated", handleItemStatus);
      socket.off("cart_updated", handleCartUpdated);
      socket.off("order_status_update", handleOrderStatusUpdate);
      socket.off("cart_change", handleCartChange);
    };
  }, []);

  return socket;
}
