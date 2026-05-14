import { create } from "zustand";
import { Platform } from "react-native";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CartItem, DiscountInfo, getContextId, useCartStore } from "./cartStore";
import { OrderContext } from "./orderContextStore";
import { API_URL } from "../constants/Config";
import { socket } from "../constants/socket";


/* ================= TYPES ================= */

export type OrderItem = CartItem & {
  status: "NEW" | "SENT" | "VOIDED" | "READY" | "SERVED";
  sentAt?: number;
  readyAt?: number;
  dishGroupName?: string; // 🔥 Added
};


export type ActiveOrder = {
  orderId: string;
  context: OrderContext;
  items: OrderItem[];
  discount?: DiscountInfo; // 🔥 ADDED
  createdAt: number;
};

const normalizeKitchenItem = (item: any) => {
  const note = item?.note ?? item?.Note ?? item?.notes ?? item?.Remarks ?? "";
  const isTakeaway = !!(
    item?.isTakeaway ??
    item?.IsTakeaway ??
    item?.isTakeAway ??
    item?.IsTakeAway ??
    false
  );
  const modifiers =
    Array.isArray(item?.modifiers) ? item.modifiers :
    typeof item?.ModifiersJSON === "string"
      ? (() => {
          try {
            return JSON.parse(item.ModifiersJSON);
          } catch {
            return [];
          }
        })()
      : [];
  return {
    ...item,
    note,
    isTakeaway,
    spicy: item?.spicy ?? item?.Spicy ?? "",
    salt: item?.salt ?? item?.Salt ?? "",
    oil: item?.oil ?? item?.Oil ?? "",
    sugar: item?.sugar ?? item?.Sugar ?? "",
    modifiers,
  };
};

type ActiveOrdersState = {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  activeOrders: ActiveOrder[];

  appendOrder: (
    orderId: string,
    context: OrderContext,
    cartItems: CartItem[],
    createdAt?: number,
  ) => void;

  markItemsSent: (orderId: string) => void;
  closeActiveOrder: (orderId: string) => void;

  // 🔥 NEW FUNCTIONS
  updateOrderDiscount: (context: OrderContext, discount: DiscountInfo) => void;
  voidOrderItem: (orderId: string, lineItemId: string) => void;
  markItemReady: (orderId: string, lineItemId: string, skipSync?: boolean) => void;
  markItemServed: (orderId: string, lineItemId: string, skipSync?: boolean) => void;
  fetchActiveKitchenOrders: () => Promise<void>;
  isFetching: boolean;
  updateOrderId: (oldId: string, newId: string) => void;
  initializeSocketListeners: () => void;
};

/* ================= STORE ================= */

export const useActiveOrdersStore = create<ActiveOrdersState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      activeOrders: [],
      isFetching: false,

  /* ================= APPEND ORDER ================= */

  appendOrder: (orderId, context, cartItems, createdAt) => {
    const { activeOrders } = get();

    const contextId = getContextId(context);

    // 🔥 GET DISCOUNT FROM CART STORE
    const discount = contextId && useCartStore.getState().discounts[contextId];

    const existingOrderIndex = activeOrders.findIndex((o) => {
      if (context.orderType === "DINE_IN") {
        return (
          o.context.orderType === "DINE_IN" &&
          o.context.section === context.section &&
          o.context.tableNo === context.tableNo
        );
      }

      if (context.orderType === "TAKEAWAY") {
        return (
          o.context.orderType === "TAKEAWAY" &&
          o.context.takeawayNo === context.takeawayNo
        );
      }

      return false;
    });

    /* ================= CREATE NEW ORDER ================= */

    if (existingOrderIndex === -1) {
      const newOrder: ActiveOrder = {
        orderId,
        context,
        items: cartItems.map((i) => ({
          ...normalizeKitchenItem(i),
          status: i.status || "NEW",
        })),
        discount: discount || undefined,
        createdAt: createdAt ? (typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime()) : Date.now(),
      };

      set({ activeOrders: [...activeOrders, newOrder] });
      return;
    }

    /* ================= UPDATE EXISTING ORDER ================= */

    const updatedOrders = [...activeOrders];
    const existingOrder = { ...updatedOrders[existingOrderIndex], orderId };

    existingOrder.items = [...existingOrder.items];

    cartItems.forEach((cartItem) => {
      // If item already exists with the same status or is just NEW, we might merge
      // But for KDS append, we usually want to add them as SENT if they are new batches
      const itemIndex = existingOrder.items.findIndex(
        (i) => i.lineItemId === cartItem.lineItemId && (i.status === "NEW" || i.status === cartItem.status)
      );

      if (itemIndex > -1) {
        existingOrder.items[itemIndex] = {
          ...existingOrder.items[itemIndex],
          qty: existingOrder.items[itemIndex].qty + cartItem.qty,
          status: cartItem.status || existingOrder.items[itemIndex].status
        };
      } else {
        existingOrder.items.push({
          ...normalizeKitchenItem(cartItem),
          status: cartItem.status || "NEW",
        });
      }
    });

    // 🔥 UPDATE DISCOUNT ALSO
    existingOrder.discount = discount || existingOrder.discount;

    updatedOrders[existingOrderIndex] = existingOrder;

    set({ activeOrders: updatedOrders });
  },

  /* ================= UPDATE DISCOUNT ================= */

  updateOrderDiscount: (context, discount) => {
    const { activeOrders } = get();

    const updated = activeOrders.map((order) => {
      if (context.orderType === "DINE_IN") {
        if (
          order.context.orderType === "DINE_IN" &&
          order.context.section === context.section &&
          order.context.tableNo === context.tableNo
        ) {
          return { ...order, discount };
        }
      }

      if (context.orderType === "TAKEAWAY") {
        if (
          order.context.orderType === "TAKEAWAY" &&
          order.context.takeawayNo === context.takeawayNo
        ) {
          return { ...order, discount };
        }
      }

      return order;
    });

    set({ activeOrders: updated });
  },

  /* ================= MARK ITEMS SENT ================= */

  markItemsSent: (orderId) => {
    const { activeOrders } = get();
    const now = Date.now();

    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;

        return {
          ...order,
          items: order.items.map((item) => {
            if (item.status === "NEW") {
              return {
                ...item,
                status: "SENT",
                sentAt: now,
              };
            }
            return item;
          }),
        };
      }),
    });
  },
  closeActiveOrder: (orderId) => {
    const { activeOrders } = get();

    set({
      activeOrders: activeOrders.filter((o) => o.orderId !== orderId),
    });
  },

  /* ================= VOID ITEM ================= */

  voidOrderItem: (orderId, lineItemId) => {
    const { activeOrders } = get();

    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;

        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "VOIDED" };
            }
            return item;
          }),
        };
      }),
    });
  },
  /* ================= MARK ITEM READY ================= */
  markItemReady: async (orderId, lineItemId, skipSync) => {
    const { activeOrders } = get();
    const now = Date.now();

    // 1. Update Local State
    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;
        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "READY", readyAt: now };
            }
            return item;
          }),
        };
      }),
    });

    // 2. Persist to Backend (unless already synced from socket)
    if (!skipSync) {
      try {
        await fetch(`${API_URL}/api/orders/update-item-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, lineItemId, status: "READY" }),
        });
      } catch (err) {
        console.error("❌ [Store] markItemReady sync failed:", err);
      }
    }
  },

  /* ================= MARK ITEM SERVED ================= */
  markItemServed: async (orderId, lineItemId, skipSync) => {
    const { activeOrders } = get();

    // 1. Update Local State
    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;
        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "SERVED" };
            }
            return item;
          }),
        };
      }),
    });

    // 2. Persist to Backend
    if (!skipSync) {
      try {
        await fetch(`${API_URL}/api/orders/update-item-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, lineItemId, status: "SERVED" }),
        });
      } catch (err) {
        console.error("❌ [Store] markItemServed sync failed:", err);
      }
    }
  },

  /* ================= FETCH FROM DB ================= */
  fetchActiveKitchenOrders: async () => {
    // 🚀 DEBOUNCE: Clear existing timeout to catch rapid-fire socket events
    if ((get() as any)._fetchTimeout) {
      clearTimeout((get() as any)._fetchTimeout);
    }

    const timeout = setTimeout(async () => {
      const { isFetching } = get();
      if (isFetching) return;
      
      set({ isFetching: true });
      try {
        const { API_URL } = require("../constants/Config");
        const res = await fetch(`${API_URL}/api/orders/active-kitchen`);
        if (!res.ok) throw new Error("Failed to fetch active kitchen orders");
        const result = await res.json();
        const ordersFromApi = result.orders || (Array.isArray(result) ? result : []);
        
        const currentOrders = get().activeOrders;
        const updatedApiOrders = ordersFromApi.map((apiOrder: any) => {
          const localOrder = currentOrders.find(lo => lo.orderId === apiOrder.orderId);
          const normalizedApiOrder = {
            ...apiOrder,
            items: (apiOrder.items || []).map((i: any) => normalizeKitchenItem(i))
          };
          if (!localOrder) return normalizedApiOrder;
          
          return {
            ...normalizedApiOrder,
            items: normalizedApiOrder.items.map((apiItem: any) => {
              const localItem = localOrder.items.find(li => li.lineItemId === apiItem.lineItemId);
              if (localItem && localItem.status !== apiItem.status) {
                const localUpdateRecent = (Date.now() - (localItem.readyAt || 0)) < 5000;
                if (localUpdateRecent) return localItem;
              }
              if (!localItem) return apiItem;
              return {
                ...localItem,
                ...apiItem,
                note: apiItem.note ?? localItem.note ?? "",
                isTakeaway: apiItem.isTakeaway ?? localItem.isTakeaway ?? false,
                modifiers: apiItem.modifiers?.length ? apiItem.modifiers : (localItem.modifiers || []),
              };
            })
          };
        });

        // 🚀 SERVER IS TRUTH: If an order is gone from the server, it should be gone from the KDS
        // We only keep local orders if they are REALLY new (not yet synced to DB)
        const merged = [...updatedApiOrders];
        currentOrders.forEach(local => {
          // Only keep local orders that have never reached the server (TEMP- IDs or #NEW)
          const isUnsynced = local.orderId.startsWith('TEMP-') || local.orderId === 'NEW' || local.orderId === '#NEW';
          if (isUnsynced && !merged.find(m => m.orderId === local.orderId)) {
            merged.push(local);
          }
        });

        set({ activeOrders: merged });
      } catch (err) {
        console.error("❌ [ActiveOrdersStore] Fetch error:", err);
      } finally {
        set({ isFetching: false });
      }
    }, 100);

    set({ _fetchTimeout: timeout } as any);
  },

  /* ================= UPDATE ORDER ID ================= */
  updateOrderId: (oldId, newId) => {
    const { activeOrders } = get();
    console.log(`🔄 [Store] Updating Order ID: ${oldId} -> ${newId}`);
    
    set({
      activeOrders: activeOrders.map((o) => 
        o.orderId === oldId ? { ...o, orderId: newId } : o
    )
  });
},

/* ================= SOCKET LISTENERS ================= */
initializeSocketListeners: () => {
  if ((get() as any)._socketInitialized) return;

  console.log("🔌 [ActiveOrdersStore] Initializing Socket Listeners...");

  socket.on("cart_updated", () => {
    console.log("🔔 [ActiveOrdersStore] Socket: cart_updated. Refreshing...");
    get().fetchActiveKitchenOrders();
  });

  // 🚀 INSTANT OPTIMISTIC SYNC: Add new orders to KDS immediately
  socket.on("new_order", (data) => {
    console.log("🔔 [ActiveOrdersStore] Socket: new_order. Adding instantly...", data);
    const { orderId, context, items, createdAt } = data;
    get().appendOrder(orderId, context, items, createdAt);
  });

  // 🚀 INSTANT SYNC: Listen for status updates (Ready/Void/Served) from other devices
  socket.on("item_status_updated", (data) => {
    console.log("🔔 [ActiveOrdersStore] Socket: item_status_updated. Applying instantly...", data);
    const { lineItemId, status, orderId: incomingOrderId } = data;
    
    // Normalize IDs for comparison (strip # and spaces)
    const cleanIncomingId = incomingOrderId ? String(incomingOrderId).replace('#', '').trim() : null;

    set((state) => ({
      activeOrders: state.activeOrders.map((order) => {
        const cleanOrderId = String(order.orderId).replace('#', '').trim();
        
        // Match if Order ID is identical OR if we're targeting a specific line item regardless of orderId
        const isTargetOrder = !cleanIncomingId || cleanOrderId === cleanIncomingId;
        if (!isTargetOrder) return order;
        
        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: status, readyAt: Date.now() };
            }
            return item;
          }),
        };
      })
    }));

    // 2. Fetch fresh data as a backup to ensure full consistency
    get().fetchActiveKitchenOrders();
  });

  socket.on("order_placed", () => {
    console.log("🔔 [ActiveOrdersStore] Socket: order_placed. Refreshing...");
    get().fetchActiveKitchenOrders();
  });

  socket.on("item_status_updated", (data) => {
    console.log("🔔 [ActiveOrdersStore] Socket: item_status_updated.", data);
    get().fetchActiveKitchenOrders();
  });

  // 🚀 INSTANT WIPE: Remove table/order from KDS immediately when payment is made
  socket.on("order_closed", (data) => {
    const { tableId } = data;
    console.log(`🧹 [ActiveOrdersStore] Order Closed for Table: ${tableId}. Wiping KDS...`);
    const { activeOrders } = get();
    const filtered = activeOrders.filter(o => 
      o.context?.tableId !== tableId && 
      o.context?.tableNo !== data.tableNo
    );
    set({ activeOrders: filtered });
  });

  // 🚀 TABLE MAP SYNC: Update table colors and subtotals across all devices instantly
    socket.on("table_status_updated", (data) => {
      console.log("📊 [ActiveOrdersStore] Socket: table_status_updated", data);
      const { useTableStatusStore } = require("./tableStatusStore");
      
      const statusMap: Record<number, any> = {
        0: 'EMPTY', 1: 'SENT', 2: 'BILL_REQUESTED', 3: 'HOLD', 4: 'OVERTIME', 5: 'LOCKED'
      };
      const statusStr = statusMap[data.Status] || data.Status || 'SENT';

      useTableStatusStore.getState().updateTableStatus(
        data.tableId,
        data.section,
        data.tableNo,
        data.CurrentOrderId,
        statusStr,
        data.StartTime,
        data.lockedByName,
        data.TotalAmount
      );
    });

    (set as any)({ _socketInitialized: true });
},
}),
  {
    name: "active-orders-storage",
    storage: createJSONStorage(() => 
      Platform.OS === 'web' ? window.sessionStorage : AsyncStorage
    ),
    onRehydrateStorage: () => (state) => {
      state?.setHasHydrated(true);
    },
  }
));

/* ================= HELPERS ================= */

export const getActiveOrders = () =>
  useActiveOrdersStore.getState().activeOrders;

export const findActiveOrder = (context: OrderContext) => {
  return useActiveOrdersStore.getState().activeOrders.find((o) => {
    if (context.orderType === "DINE_IN") {
      return (
        o.context.orderType === "DINE_IN" &&
        o.context.section === context.section &&
        o.context.tableNo === context.tableNo
      );
    }

    if (context.orderType === "TAKEAWAY") {
      return (
        o.context.orderType === "TAKEAWAY" &&
        o.context.takeawayNo === context.takeawayNo
      );
    }

    return false;
  });
};
export const voidOrderItem = (orderId: string, lineItemId: string) =>
  useActiveOrdersStore.getState().voidOrderItem(orderId, lineItemId);
