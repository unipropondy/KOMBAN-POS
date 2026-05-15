import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { Alert, Platform } from "react-native";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "@/constants/Config";
import { useOrderContextStore } from "./orderContextStore";
import { useAuthStore } from "./authStore";
import { socket } from "../constants/socket";


/* ================= TYPES ================= */

export type Modifier = {
  ModifierId: string;
  ModifierName: string;
  Price?: number;
};

export type CartItem = {
  lineItemId: string;
  id: string;
  name: string;
  price?: number;
  qty: number;

  spicy?: string;
  oil?: string;
  salt?: string;
  sugar?: string;
  note?: string;

  modifiers?: Modifier[];
  discount?: number;
  basePrice?: number;
  isTakeaway?: boolean;
  isVoided?: boolean;
  categoryName?: string; 
  status?: "NEW" | "SENT" | "VOIDED" | "READY" | "SERVED";
  DateCreated?: string | number;
  KitchenTypeName?: string;
  PrinterIP?: string;
  KitchenTypeCode?: string;
  sent?: number; // For compatibility with existing UI logic
  sentDate?: string | number; // For compatibility with existing UI logic
};

export type DiscountInfo = {
  applied: boolean;
  type: "percentage" | "fixed";
  value: number;
  label?: string;
};

const getModifierKey = (mods?: any[]) => {
  if (!mods || mods.length === 0) return "";
  // 🚀 OPTIMIZATION: Avoid sorting/joining for single modifiers
  if (mods.length === 1) return String(mods[0].ModifierId || mods[0].ModifierID || "");
  
  return mods
    .map((m) => String(m?.ModifierId || m?.ModifierID || ""))
    .sort()
    .join("|");
};

const getNormalizedText = (...values: any[]) => {
  for (const v of values) {
    if (v !== undefined && v !== null) return String(v);
  }
  return "";
};

const getNormalizedBoolean = (...values: any[]) => {
  for (const v of values) {
    if (v !== undefined && v !== null) return !!v;
  }
  return false;
};

const getNormalizedModifiers = (item: any): Modifier[] => {
  if (Array.isArray(item?.modifiers)) return item.modifiers;
  if (typeof item?.ModifiersJSON === "string") {
    try {
      return JSON.parse(item.ModifiersJSON);
    } catch {
      return [];
    }
  }
  return [];
};

/* ================= HELPERS ================= */

// 🚀 HIGH-PERFORMANCE ID GENERATOR: Replaces Crypto.randomUUID() for hot paths
const fastId = () => {
  try {
    return Crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  }
};

const updateCartItemInArray = (items: CartItem[], lineItemId: string, updates: Partial<CartItem>) => {
  return items.map(item => item.lineItemId === lineItemId ? { ...item, ...updates } : item);
};

const normalizeCartItem = (item: any, fallback: Partial<CartItem> = {}): CartItem => {
  const qty = Number(item.qty ?? item.Quantity ?? item.quantity ?? fallback.qty ?? 1);
  const price = Number(item.price ?? item.Cost ?? item.Price ?? fallback.price ?? 0);
  const note = getNormalizedText(item.note, item.Note, item.notes, item.Notes, item.Remarks, item.remarks, fallback.note);
  const isTakeaway = getNormalizedBoolean(item.isTakeaway, item.IsTakeaway, item.isTakeAway, item.IsTakeAway, fallback.isTakeaway);
  const discount = Number(item.discount ?? item.DiscountAmount ?? item.Discount ?? fallback.discount ?? 0);
  const modifiers = getNormalizedModifiers(item).length ? getNormalizedModifiers(item) : (fallback.modifiers || []);
  
  // 🚀 PERFORMANCE FIX: Construct cleanly instead of using 'delete' loop
  return {
    lineItemId: String(item.lineItemId || item.ItemId || fallback.lineItemId || fastId()),
    id: String(item.id || item.ProductId || fallback.id || ""),
    name: String(item.name || item.ProductName || item.DishName || fallback.name || "Dish"),
    qty,
    price,
    basePrice: Number(item.basePrice ?? fallback.basePrice ?? price),
    note,
    isTakeaway,
    discount,
    modifiers,
    spicy: getNormalizedText(item.spicy, item.Spicy, fallback.spicy),
    salt: getNormalizedText(item.salt, item.Salt, fallback.salt),
    oil: getNormalizedText(item.oil, item.Oil, fallback.oil),
    sugar: getNormalizedText(item.sugar, item.Sugar, fallback.sugar),
    isVoided: getNormalizedBoolean(item.isVoided, item.IsVoided, fallback.isVoided),
    status: (item.StatusCode === 0 || item.statusCode === 0) ? "VOIDED" : 
            (item.StatusCode >= 2 || item.statusCode >= 2) ? "SENT" :
            (item.status || item.Status || fallback.status || "NEW"),
    DateCreated: item.DateCreated || fallback.DateCreated,
    categoryName: item.categoryName || fallback.categoryName,
    KitchenTypeName: item.KitchenTypeName || fallback.KitchenTypeName,
    PrinterIP: item.PrinterIP || fallback.PrinterIP,
    KitchenTypeCode: item.KitchenTypeCode || fallback.KitchenTypeCode,
  };
};

const canMergeCartItems = (left: CartItem, right: CartItem) =>
  left.id === right.id &&
  (left.status || "NEW") === "NEW" &&
  (right.status || "NEW") === "NEW" &&
  !!left.isTakeaway === !!right.isTakeaway &&
  (left.note || "") === (right.note || "") &&
  (left.spicy || "") === (right.spicy || "") &&
  (left.salt || "") === (right.salt || "") &&
  (left.oil || "") === (right.oil || "") &&
  (left.sugar || "") === (right.sugar || "") &&
  getModifierKey(left.modifiers) === getModifierKey(right.modifiers);

const mergeCartItems = (items: CartItem[]) => {
  const merged: CartItem[] = [];
  items.forEach((rawItem) => {
    const item = normalizeCartItem(rawItem);
    const existingIndex = merged.findIndex((candidate) => canMergeCartItems(candidate, item));
    if (existingIndex > -1) {
      merged[existingIndex] = { ...merged[existingIndex], qty: merged[existingIndex].qty + item.qty };
    } else {
      merged.push({ ...item });
    }
  });
  return merged;
};

type CartState = {
  carts: Record<string, CartItem[]>;
  discounts: Record<string, DiscountInfo>;
  tableOrderIds: Record<string, string | null>;

  currentContextId: string | null;
  pendingSync: boolean;
  lastLocalUpdate: Record<string, number>; // 🛡️ SYNC SHIELD: Per-context timestamps
  lastServerSync: Record<string, number>; // 🛡️ SYNC SHIELD: Per-context last success
  deletedItemsShield: Record<string, number>; // 🛡️ DELETION SHIELD: lineItemId -> expiry timestamp
  operationVersion: Record<string, number>; // 🛡️ VERSION SHIELD: Per-context operation counter
  isClearing: Record<string, boolean>; // 🛡️ CLEAR LOCK: Block fetches during clear
  deletingItems: Set<string>; // 🛡️ DELETE LOCK: Block interactions for specific lineItemIds
  cartQtyMap: Record<string, Record<string, number>>; // 🚀 PERFORMANCE: contextId -> dishId -> totalQty

  setCurrentContext: (contextId: string | null) => void;

  getCart: () => CartItem[];

  addToCartGlobal: (item: Omit<CartItem, "qty" | "lineItemId">) => Promise<string>;
  removeFromCartGlobal: (lineItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  clearAllCarts: () => void;

  applyDiscount: (discount: DiscountInfo) => void;
  clearDiscount: () => void;

  setCartItemsGlobal: (items: CartItem[]) => void;
  setCartItems: (contextId: string, items: CartItem[], skipSync?: boolean, source?: string) => void;
  updateCartItemQty: (
    lineItemId: string,
    newQty: number,
    discount?: number,
  ) => void;
  updateCartItemModifiers: (lineItemId: string, modifiers: Modifier[]) => void;
  updateCartItemTakeaway: (lineItemId: string, isTakeaway: boolean) => void;
  updateCartItemDiscount: (lineItemId: string, discount: number) => void;
  voidCartItem: (lineItemId: string) => void;
  updateCartItemFull: (
    lineItemId: string,
    updates: {
      qty?: number;
      note?: string;
      spicy?: string;
      salt?: string;
      oil?: string;
      sugar?: string;
      discount?: number;
      isTakeaway?: boolean;
      isVoided?: boolean;
    },
  ) => void;

  syncCartWithDB: (contextId: string, isImmediate?: boolean) => Promise<void>;
  fetchCartFromDB: (tableId: string) => Promise<void>;
  setTableOrderId: (tableId: string, orderId: string | null) => void;
  checkoutOrder: (tableId: string) => Promise<{ success: boolean; orderId?: string }>;
  completeOrder: (tableId: string) => Promise<{ success: boolean }>;
  markAllAsSent: () => void;
  combineDuplicates: () => void;
  clearTableSession: (tableId: string) => void;

  // 🛡️ Implementation Details (Internal use)
  _syncTimeout?: any;
  _fetchTimeout?: any;
  _syncAbortControllers: Record<string, AbortController>;
};

/* ================= STORE ================= */

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      discounts: {},
      tableOrderIds: {},
      currentContextId: null,
      pendingSync: false,
      lastLocalUpdate: {},
      lastServerSync: {},
      deletedItemsShield: {},
      operationVersion: {},
      isClearing: {},
      deletingItems: new Set(),
      cartQtyMap: {},
      _syncAbortControllers: {},

      setCurrentContext: (contextId) => set({ currentContextId: contextId }),

      getCart: () => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return [];
        return carts[currentContextId] || [];
      },

      /* ================= DISCOUNT ================= */

      setCartItemsGlobal: (items: CartItem[]) => {
        const { currentContextId } = get();
        if (!currentContextId) return;
        
        console.log(`[TRACE] [${Date.now()}] [SOCKET_QUANTITY_SYNC] Received ${items.length} items for Context: ${currentContextId}`);
        items.forEach((item: CartItem) => console.log(`[TRACE] [SOCKET_QUANTITY_SYNC] Item: ${item.name} | Qty: ${item.qty}`));

        // Update qty map
        const newQtyMap: Record<string, number> = {};
        items.forEach(item => {
          newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
        });

        set((state) => ({
          carts: { ...state.carts, [currentContextId]: items },
          cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
        }));
      },

      applyDiscount: (discount: DiscountInfo) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => ({
          discounts: {
            ...state.discounts,
            [currentContextId]: discount,
          },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
        }));
      },

      clearDiscount: () => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => {
          const updated = { ...state.discounts };
          delete updated[currentContextId];
          return { 
            discounts: updated, 
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() } 
          };
        });
      },

      /* ================= ADD ================= */

      addToCartGlobal: async (item) => {
        const { fetchCartFromDB, carts, currentContextId } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId) return "";

        const isTakeawayDefault = orderContext?.orderType === "TAKEAWAY";
        const targetLineItemId = fastId();
        
        // 🚀 OPTIMIZATION: Normalize ONCE
        const normalizedIncoming = normalizeCartItem(item, {
          lineItemId: targetLineItemId,
          qty: 1,
          status: "NEW",
          isTakeaway: item.isTakeaway !== undefined ? item.isTakeaway : isTakeawayDefault,
        });

        // 🚀 OPTIMIZATION: Compute key ONCE outside the loop
        const newItemModKey = getModifierKey(normalizedIncoming.modifiers);

        const newVersion = (get().operationVersion[currentContextId!] || 0) + 1;
        const now = Date.now();
        // 🚀 OPTIMISTIC UPDATE: Update local state immediately (Merged into one set call)
        if (currentContextId) {
          const currentCart = carts[currentContextId] || [];
          let updatedCart: CartItem[];
          let finalLineItemId = targetLineItemId;

          const existingIndex = currentCart.findIndex(p => {
            if (p.id !== normalizedIncoming.id || 
                p.status !== "NEW" || 
                p.isTakeaway !== normalizedIncoming.isTakeaway || 
                (p.note || "") !== (normalizedIncoming.note || "") ||
                (p.spicy || "") !== (normalizedIncoming.spicy || "") ||
                (p.salt || "") !== (normalizedIncoming.salt || "") ||
                (p.oil || "") !== (normalizedIncoming.oil || "") ||
                (p.sugar || "") !== (normalizedIncoming.sugar || "")) return false;
            
            return getModifierKey(p.modifiers) === newItemModKey;
          });

          if (existingIndex > -1) {
            updatedCart = [...currentCart];
            const newQty = (updatedCart[existingIndex].qty || 0) + 1;
            updatedCart[existingIndex] = { 
              ...updatedCart[existingIndex], 
              qty: newQty 
            };
            finalLineItemId = updatedCart[existingIndex].lineItemId;
          } else {
            const latestTimestamp = currentCart.reduce((max, i) => {
              const t = i.DateCreated ? new Date(i.DateCreated).getTime() : 0;
              return t > max ? t : max;
            }, 0);
            
            // 🚀 SOLID ID: Use valid UUID format for SQL compatibility
            const generateUUID = () => {
              return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
              });
            };

            const newItem: CartItem = {
              ...normalizedIncoming,
              lineItemId: generateUUID(),
              DateCreated: Math.max(now, latestTimestamp + 1)
            };
            finalLineItemId = newItem.lineItemId;
            updatedCart = [...currentCart, newItem];
          }

          set((state) => {
            const newQtyMap = { ...(state.cartQtyMap[currentContextId] || {}) };
            newQtyMap[normalizedIncoming.id] = (newQtyMap[normalizedIncoming.id] || 0) + 1;

            return { 
              operationVersion: { ...state.operationVersion, [currentContextId]: newVersion },
              carts: { 
                ...state.carts, 
                [currentContextId]: updatedCart 
              }, 
              cartQtyMap: {
                ...state.cartQtyMap,
                [currentContextId]: newQtyMap
              },
              lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: now } 
            };
          });

          // 🚀 INSTANT SYNC: Tell other tablets immediately (Socket-First)
          socket.emit("cart_change", { 
            tableId, 
            contextId: currentContextId, 
            items: updatedCart, 
            lastUpdate: Date.now() 
          });

          // 🚀 DB SYNC: If it's a brand new table, sync faster to get the real Order ID
          const currentOrderId = get().tableOrderIds[tableId];
          const isNewTable = !currentOrderId || currentOrderId === "NEW";
          
          if (isNewTable) {
             // Non-debounced sync for first item to get ID fast
             get().syncCartWithDB(currentContextId, true);
          } else {
             // Normal 5s debounced sync for subsequent items
             get().syncCartWithDB(currentContextId);
          }
          
          return finalLineItemId;
        }

        return targetLineItemId;
      },

      markAllAsSent: () => {
        const { currentContextId, carts } = get();
        if (!currentContextId || !carts[currentContextId]) return;
        
        const updatedCart = carts[currentContextId].map(item => ({
          ...item,
          sent: 1,
          status: "SENT" as const
        }));

        set((state) => {
          const newQtyMap: Record<string, number> = {};
          updatedCart.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return { 
            carts: { 
              ...state.carts, 
              [currentContextId]: updatedCart 
            }, 
            cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() } 
          };
        });
        
        // 🚀 IMMEDIATE SYNC: Don't wait for debounce when sending to kitchen
        const tableId = useOrderContextStore.getState().currentOrder?.tableId;
        if (tableId) {
          get().syncCartWithDB(currentContextId);
        }
      },

      combineDuplicates: () => {
        const { currentContextId, carts } = get();
        if (!currentContextId || !carts[currentContextId]) return;

        set((state) => {
          const updatedItems = mergeCartItems(state.carts[currentContextId]);
          const newQtyMap: Record<string, number> = {};
          updatedItems.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return {
            carts: {
              ...state.carts,
              [currentContextId]: updatedItems
            },
            cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
          };
        });

        get().syncCartWithDB(currentContextId);
      },

      /* ================= REMOVE ================= */

      removeFromCartGlobal: async (lineItemId) => {
        const { fetchCartFromDB, currentContextId, _syncTimeout, _syncAbortControllers } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId || !currentContextId) return;
        if (get().deletingItems.has(lineItemId)) return; // 🛡️ Double-click protection

        const newVersion = (get().operationVersion[currentContextId] || 0) + 1;
        const now = Date.now();
        console.log(`[TRACE] [${now}] [${currentContextId}] DELETE_START | ID: ${lineItemId} | Version: ${newVersion}`);

        // 🛡️ LOCK & SHIELD
        set((state) => {
          const nextDeleting = new Set(state.deletingItems);
          nextDeleting.add(lineItemId);
          return {
            deletingItems: nextDeleting,
            deletedItemsShield: { ...state.deletedItemsShield, [lineItemId]: now + 120000 }, // 2 minute shield
            operationVersion: { ...state.operationVersion, [currentContextId]: newVersion },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: now }
          };
        });

        // 🛑 STOP PENDING SAVES
        if (_syncTimeout) clearTimeout(_syncTimeout);
        if (_syncAbortControllers[currentContextId]) _syncAbortControllers[currentContextId].abort();

        // 🚀 OPTIMISTIC UPDATE: Remove instantly from UI
        const previousCart = get().carts[currentContextId] || [];
        set((state) => {
          const updatedCart = previousCart.filter(p => p.lineItemId !== lineItemId);
          
          const newQtyMap: Record<string, number> = {};
          updatedCart.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return { 
            carts: { ...state.carts, [currentContextId]: updatedCart },
            cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap }
          };
        });

        try {
          socket.emit("cart_change", { 
            tableId, contextId: currentContextId, 
            items: (get().carts[currentContextId] || []), 
            lastUpdate: now,
            version: newVersion
          });

          const res = await fetch(`${API_URL}/api/orders/remove-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              tableId, 
              itemId: lineItemId, 
              version: newVersion,
              userId: useAuthStore.getState().user?.userId 
            })
          });

          if (!res.ok) throw new Error("Delete failed on server");

          console.log(`[TRACE] [${Date.now()}] [${currentContextId}] DELETE_DB_SUCCESS | ID: ${lineItemId}`);
          
          set((state) => {
            const nextDeleting = new Set(state.deletingItems);
            nextDeleting.delete(lineItemId);
            return { deletingItems: nextDeleting };
          });
          
          // Emit socket sync for others
          socket.emit("cart_updated", { tableId: tableId.toLowerCase() });
          
        } catch (err) {
          console.error("❌ [CartStore] DELETE_FAILED:", err);
          // 🔄 ROLLBACK
          set((state) => {
            const nextDeleting = new Set(state.deletingItems);
            nextDeleting.delete(lineItemId);
            return { 
              carts: { ...state.carts, [currentContextId]: previousCart },
              deletingItems: nextDeleting
            };
          });
          if ((err as any).name !== 'AbortError') await fetchCartFromDB(tableId);
        }
      },

      /* ================= CLEAR ================= */

      clearCart: async () => {
        const { fetchCartFromDB, currentContextId, _syncTimeout, _syncAbortControllers } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId || !currentContextId) return;

        const newVersion = (get().operationVersion[currentContextId] || 0) + 1;
        const now = Date.now();
        console.log(`[TRACE] [${now}] [${currentContextId}] Mutate: CLEAR_CART | START | NewVersion: ${newVersion}`);

        // 🛡️ LOCK & SHIELD
        set((state) => ({
          isClearing: { ...state.isClearing, [currentContextId]: true },
          operationVersion: { ...state.operationVersion, [currentContextId]: newVersion },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: now + 10000 } // 10s hard shield
        }));

        // 🛑 STOP EVERYTHING
        if (_syncTimeout) clearTimeout(_syncTimeout);
        if (_syncAbortControllers[currentContextId]) _syncAbortControllers[currentContextId].abort();

        const currentCart = (get().carts[currentContextId] || []).filter(i => !!i);
        const sentItems = currentCart.filter(i => isItemSent(i));
        const unsentItems = currentCart.filter(i => !isItemSent(i));

        // 🛡️ SHIELD UNSENT PERMANENTLY (for this session)
        const newShield = { ...get().deletedItemsShield };
        unsentItems.forEach(it => {
          if (it.lineItemId) newShield[it.lineItemId] = now + 120000; // 2 minute shield
        });

        // 🚀 IMMEDIATE UPDATE
        set((state) => {
          const newQtyMap: Record<string, number> = {};
          sentItems.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return { 
            carts: { ...state.carts, [currentContextId]: sentItems }, 
            cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap },
            deletedItemsShield: newShield,
          };
        });

        try {
          socket.emit("cart_change", { 
            tableId, contextId: currentContextId, 
            items: sentItems, 
            lastUpdate: now + 10000,
            version: newVersion
          });

          const res = await fetch(`${API_URL}/api/orders/save-cart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              orderId: get().tableOrderIds[tableId],
              lastUpdate: now + 10000,
              version: newVersion,
              items: sentItems
            })
          });

          // Wait for DB to settle
          console.log(`[TRACE] [${Date.now()}] [${currentContextId}] Mutate: CLEAR_CART | DB request finished. Waiting 5s before unlocking...`);
          setTimeout(async () => {
            console.log(`[TRACE] [${Date.now()}] [${currentContextId}] Mutate: CLEAR_CART | UNLOCKING & FETCHING`);
            set((state) => ({ isClearing: { ...state.isClearing, [currentContextId]: false } }));
            await fetchCartFromDB(tableId);
          }, 5000);
        } catch (err) {
          set((state) => ({ isClearing: { ...state.isClearing, [currentContextId]: false } }));
          if ((err as any).name !== 'AbortError') console.error("❌ [CartStore] Clear failed:", err);
        }
      },

      clearAllCarts: () =>
        set({ carts: {}, discounts: {}, tableOrderIds: {}, currentContextId: null, lastLocalUpdate: {}, lastServerSync: {} }),

      clearTableSession: (tableId) => {
        set((state) => {
          const newCarts = { ...state.carts };
          const newDiscounts = { ...state.discounts };
          const newTableOrderIds = { ...state.tableOrderIds };
          const newLastLocalUpdate = { ...state.lastLocalUpdate };
          const newLastServerSync = { ...state.lastServerSync };

          // 🚀 Comprehensive cleanup for ALL contexts related to this table
          Object.keys(newCarts).forEach(ctx => { if (ctx.includes(tableId)) delete newCarts[ctx]; });
          Object.keys(newDiscounts).forEach(ctx => { if (ctx.includes(tableId)) delete newDiscounts[ctx]; });
          delete newTableOrderIds[tableId];
          Object.keys(newLastLocalUpdate).forEach(ctx => { if (ctx.includes(tableId)) delete newLastLocalUpdate[ctx]; });
          Object.keys(newLastServerSync).forEach(ctx => { if (ctx.includes(tableId)) delete newLastServerSync[ctx]; });

          console.log(`🧹 [CartStore] Table session cleared: ${tableId}`);

          return {
            carts: newCarts,
            discounts: newDiscounts,
            tableOrderIds: newTableOrderIds,
            lastLocalUpdate: newLastLocalUpdate,
            lastServerSync: newLastServerSync,
          };
        });
      },

      /* ================= SET ================= */

      setCartItems: (contextId, items, skipSync = false, source = "INTERNAL") => {
        const now = Date.now();
        const state = get();
        const currentVersion = state.operationVersion[contextId] || 0;
        
        // 🛡️ CLEAR LOCK: Reject updates during a manual clear
        if (state.isClearing[contextId]) {
          console.log(`🛡️ [TRACE] [${now}] [${contextId}] setCartItems: BLOCKED (Clear Lock active) | SOURCE: ${source}`);
          return;
        }

        console.log(`[TRACE] [${now}] [${contextId}] setCartItems: SOURCE: ${source} | Items: ${items.length} | CurrentVersion: ${currentVersion}`);

        // 🛡️ DELETION SHIELD FILTER: Ensure no ghost items slip through any setCartItems call
        const { deletedItemsShield } = get();
        const filteredItems = items.filter(item => {
          const shieldExpiry = deletedItemsShield[item.lineItemId];
          if (shieldExpiry && now < shieldExpiry) {
            console.log(`🛡️ [TRACE] [${now}] [${contextId}] BLOCKED GHOST RESTORE: ${item.name} (${item.lineItemId}) from ${source}`);
            return false;
          }
          return true;
        });

        set((state) => {
          const updatedItems = mergeCartItems(filteredItems.map((item) => normalizeCartItem(item)));
          const newQtyMap: Record<string, number> = {};
          updatedItems.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return {
            carts: { ...state.carts, [contextId]: updatedItems },
            cartQtyMap: { ...state.cartQtyMap, [contextId]: newQtyMap },
            lastLocalUpdate: { ...state.lastLocalUpdate, [contextId]: Date.now() }
          };
        });

        if (!skipSync) {
          get().syncCartWithDB(contextId);
        }
      },

      updateCartItemQty: (lineItemId, newQty, discount) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = get().carts[currentContextId] || [];
        const item = currentCart.find(i => i.lineItemId === lineItemId);
        if (item) {
          const type = newQty < item.qty ? "DECREMENT" : "INCREMENT";
          console.log(`[TRACE] [${Date.now()}] [QUANTITY_${type}] Product: ${item.name} | NewQty: ${newQty}`);
        }

        set((state) => {
          const updatedCart = updateCartItemInArray(state.carts[currentContextId] || [], lineItemId, {
            qty: Math.max(0, newQty),
            discount: discount !== undefined ? discount : undefined
          }).filter(i => i.qty > 0);

          const newQtyMap: Record<string, number> = {};
          updatedCart.forEach(item => {
            newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty;
          });

          return {
            carts: { 
              ...state.carts, 
              [currentContextId]: updatedCart
            },
            cartQtyMap: { ...state.cartQtyMap, [currentContextId]: newQtyMap },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
          };
        });
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemModifiers: (lineItemId, modifiers) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => {
          const currentCart = state.carts[currentContextId] || [];
          const sourceItem = currentCart.find((i) => i.lineItemId === lineItemId);
          if (!sourceItem) return state;

          const base = sourceItem.basePrice || sourceItem.price || 0;
          const extra = modifiers.reduce((sum, m) => sum + (m.Price || 0), 0);
          const newPrice = base + extra;

          return {
            carts: {
              ...state.carts,
              [currentContextId]: updateCartItemInArray(currentCart, lineItemId, {
                modifiers,
                price: newPrice
              })
            },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
          };
        });

        get().syncCartWithDB(currentContextId);
      },

      updateCartItemTakeaway: (lineItemId, isTakeaway) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => ({
          carts: {
            ...state.carts,
            [currentContextId]: updateCartItemInArray(state.carts[currentContextId] || [], lineItemId, { isTakeaway }),
          },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
        }));
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemDiscount: (lineItemId, discount) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => ({
          carts: {
            ...state.carts,
            [currentContextId]: updateCartItemInArray(state.carts[currentContextId] || [], lineItemId, { discount }),
          },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
        }));
        get().syncCartWithDB(currentContextId);
      },

      voidCartItem: (lineItemId: string) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => ({
          carts: {
            ...state.carts,
            [currentContextId]: updateCartItemInArray(state.carts[currentContextId] || [], lineItemId, { 
              status: "VOIDED",
              isVoided: true
            }),
          },
          lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
        }));
      },

      updateCartItemFull: (lineItemId, updates) => {
        const { currentContextId } = get();
        if (!currentContextId) return;

        set((state) => {
          const updatedCart = updateCartItemInArray(state.carts[currentContextId] || [], lineItemId, updates);
          
          // 🚀 SURGICAL: Recompute only if qty changed
          const newQtyMap = { ...(state.cartQtyMap[currentContextId] || {}) };
          if (updates.qty !== undefined) {
             // Reset qty map for this context and recompute
             // (More robust than partial updates for nested items)
             const tempMap: Record<string, number> = {};
             updatedCart.forEach(i => {
                tempMap[i.id] = (tempMap[i.id] || 0) + (i.qty || 0);
             });
             return {
                carts: { ...state.carts, [currentContextId]: updatedCart },
                cartQtyMap: { ...state.cartQtyMap, [currentContextId]: tempMap },
                lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
             };
          }

          return {
            carts: { ...state.carts, [currentContextId]: updatedCart },
            lastLocalUpdate: { ...state.lastLocalUpdate, [currentContextId]: Date.now() }
          };
        });
        
        const tableId = useOrderContextStore.getState().currentOrder?.tableId;
        if (tableId) {
          socket.emit("cart_change", { 
            tableId, 
            contextId: currentContextId, 
            items: get().carts[currentContextId], 
            lastUpdate: Date.now() 
          });
        }

        get().syncCartWithDB(currentContextId);
      },

      syncCartWithDB: async (contextId, isImmediate = false) => {
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        if (!tableId) return;

        const { _syncTimeout, _syncAbortControllers } = get();

        // 🚀 ATOMIC DEBOUNCE: Clear existing timeout
        if (_syncTimeout) {
          clearTimeout(_syncTimeout);
        }

        // 🛑 ABORT PREVIOUS IN-FLIGHT: If we're already saving for this context, stop it
        if (_syncAbortControllers[contextId]) {
          console.log(`🛑 [CartStore] ABORTING stale save request for ${contextId}`);
          _syncAbortControllers[contextId].abort();
        }
        
        const timeout = setTimeout(async () => {
          const syncStartTime = Date.now();
          set({ pendingSync: true });

          // 🆕 Create new controller for this request
          const controller = new AbortController();
          set(state => ({
            _syncAbortControllers: { ...state._syncAbortControllers, [contextId]: controller }
          }));

          console.log(`💾 [CartStore] SYNC START for ${contextId}...`);

          try {
            const currentState = get();
            const items = currentState.carts[contextId] || [];
            const orderId = currentState.tableOrderIds[tableId] || null;
            
            const res = await fetch(`${API_URL}/api/orders/save-cart`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                tableId,
                orderId,
                userId: useAuthStore.getState().user?.userId,
                lastUpdate: currentState.lastLocalUpdate[contextId] || Date.now(),
                items: items.map(item => ({
                  ...normalizeCartItem(item),
                  status: item.status || "NEW"
                }))
              })
            });
            
            if (res.ok) {
                const data = await res.json();
                console.log(`✅ [CartStore] SYNC SUCCESS for ${contextId}`);
                
                set(state => {
                  // Only remove the controller if it's still THIS one
                  const newControllers = { ...state._syncAbortControllers };
                  if (newControllers[contextId] === controller) {
                    delete newControllers[contextId];
                  }

                  return {
                    lastServerSync: { ...state.lastServerSync, [contextId]: syncStartTime },
                    tableOrderIds: data.orderId !== orderId 
                      ? { ...state.tableOrderIds, [tableId]: data.orderId }
                      : state.tableOrderIds,
                    pendingSync: false,
                    _syncTimeout: null,
                    _syncAbortControllers: newControllers
                  };
                });
            }
          } catch (err) {
            if ((err as any).name === 'AbortError') {
              console.log(`ℹ️ [CartStore] SYNC ABORTED for ${contextId}`);
            } else {
              console.error("❌ [CartStore] Sync Exception:", err);
            }
            set({ pendingSync: false, _syncTimeout: null });
          }
        }, isImmediate ? 0 : 1500); // 🚀 FASTER SYNC: Reduced from 5000ms for better responsiveness
        
        set({ _syncTimeout: timeout } as any);
      },

      fetchCartFromDB: async (tableId) => {
        // 🚀 SMART DEBOUNCE: Prevent multiple fetches in rapid succession
        if ((get() as any)._fetchTimeout) clearTimeout((get() as any)._fetchTimeout);
        const fetchStartTime = Date.now();
        
        const timeout = setTimeout(async () => {
          try {
            const now = Date.now();
            const state = get();
            const currentContext = state.currentContextId;
            if (!currentContext) return;

            // 🛡️ CLEAR LOCK: Reject fetches during a manual clear
            if (state.isClearing[currentContext]) {
              console.log(`🛡️ [TRACE] [${now}] [${currentContext}] fetchCartFromDB: BLOCKED (Clear Lock active)`);
              return;
            }

            const lastEdit = state.lastLocalUpdate[currentContext] || 0;
            const timeSinceLastEdit = now - lastEdit;

            console.log(`[TRACE] [${now}] [${currentContext}] fetchCartFromDB: START | Table: ${tableId} | LastEdit: ${timeSinceLastEdit}ms ago`);

            // 🛡️ DYNAMIC SHIELD: Latency protection
            if (timeSinceLastEdit < 1500 || lastEdit > fetchStartTime) {
               console.log(`🛡️ [TRACE] [${now}] [${currentContext}] fetchCartFromDB: ABORTED (Latency Shield)`);
               return;
            }

            const res = await fetch(`${API_URL}/api/orders/cart/${tableId}`);
            const data = await res.json();

            // 🛡️ FINAL CHECK: Ensure no edits happened DURING the network request
            const latestState = get();
            if (latestState.lastLocalUpdate[currentContext] > fetchStartTime) {
              console.log(`🛡️ [TRACE] [${now}] [${currentContext}] fetchCartFromDB: ABORTED (Newer local edit detected during fetch)`);
              return;
            }

            const rawItems = Array.isArray(data) ? data : (data.items || []);
            const orderId = data.currentOrderId || null;
            rawItems.forEach((it: any, idx: number) => {
               if (it.Note || it.IsTakeaway || it.note || it.isTakeaway) {
                  console.log(`   └─ Item ${idx}: ${it.name} | Note: "${it.Note || it.note}" | TW: ${it.IsTakeaway || it.isTakeaway}`);
               }
            });

            const dbItems = rawItems.map((item: any) => normalizeCartItem(item));

            // 🚀 SMART CONTEXT MATCHING: Find the context associated with this table
            let resolvedContextId = state.currentContextId;
            const currentOrder = useOrderContextStore.getState().currentOrder;

            // 1. If this table matches the currently open order
            if (currentOrder?.tableId === tableId && resolvedContextId) {
              // resolvedContextId is correct
            } else {
              // 2. Try to find the context in ActiveOrders
              const { useActiveOrdersStore } = require("./activeOrdersStore");
              const activeOrder = useActiveOrdersStore.getState().activeOrders.find((o: any) => o.context.tableId === tableId);
              if (activeOrder) {
                resolvedContextId = getContextId(activeOrder.context);
              } else {
                // 3. Fallback: Search all existing cart keys
                const allContexts = Object.keys(state.carts);
                resolvedContextId = allContexts.find(ctx => ctx.includes(tableId)) || null;
              }
            }

            if (!resolvedContextId) {
              return;
            }

            // 🚀 SAFETY MERGE: Never let the server clear local "NEW" or recently "SENT" items
            // Also, strictly filter out items that are currently in the Deletion Shield.
            const currentLocalCart = state.carts[resolvedContextId] || [];
            const localPendingItems = currentLocalCart.filter(item => {
               const isPending = item.status === "NEW" || !item.status || item.status === "SENT";
               return isPending;
            });
            
            const { deletedItemsShield } = state;

            // 🛡️ DELETION SHIELD FILTER: Remove items that were explicitly deleted locally
            const filteredDbItems = dbItems.filter((dbItem: CartItem) => {
               const shieldExpiry = deletedItemsShield[dbItem.lineItemId];
               if (shieldExpiry && now < shieldExpiry) {
                  console.log(`🛡️ [CartStore] DELETION SHIELD: Ignored stale DB item ${dbItem.name} (${dbItem.lineItemId})`);
                  return false;
               }
               return true;
            });

            // 🚀 SMART MERGE: Favor local edits (Note, TW, Qty) over stale server data
            const mergedItems = filteredDbItems.map((dbItem: CartItem) => {
              const localMatch = localPendingItems.find(li => li.lineItemId === dbItem.lineItemId);
              
              // 🛡️ SYNC SHIELD: If we have a local version that was modified recently,
              // we MUST preserve the local Qty/Note/TW even for SENT items.
              const timeSinceLastEdit = now - (state.lastLocalUpdate[resolvedContextId!] || 0);
              const isRecentlyEdited = timeSinceLastEdit < 5000; // 🛡️ Increased to 5s for slower networks

              if (localMatch && (localMatch.status === 'NEW' || !localMatch.status || isRecentlyEdited)) {
                // Determine the most "advanced" status (SENT is more advanced than NEW)
                const isSent = localMatch.status === 'SENT' || dbItem.status === 'SENT' || !!localMatch.sent;
                
                return {
                  ...dbItem,
                  qty: localMatch.qty,
                  note: localMatch.note ?? dbItem.note, // Use ?? to allow empty string notes
                  isTakeaway: localMatch.isTakeaway ?? dbItem.isTakeaway,
                  discount: localMatch.discount ?? dbItem.discount,
                  modifiers: localMatch.modifiers,
                  status: isSent ? 'SENT' : (localMatch.status || dbItem.status),
                  sent: isSent ? 1 : 0
                };
              }
              return dbItem;
            });

            // Add any purely local items that don't exist on server at all (NEWly added)
            localPendingItems.forEach(localItem => {
              const existsOnServer = filteredDbItems.some((dbItem: CartItem) => 
                dbItem.lineItemId === localItem.lineItemId || 
                (dbItem.id === localItem.id && getModifierKey(dbItem.modifiers) === getModifierKey(localItem.modifiers))
              );
              
              if (!existsOnServer) {
                const shieldExpiry = deletedItemsShield[localItem.lineItemId];
                if (!shieldExpiry || now >= shieldExpiry) {
                   mergedItems.push(localItem);
                }
              }
            });

            console.log(`[TRACE] [${Date.now()}] [${resolvedContextId}] fetchCartFromDB: APPLYING | Items: ${mergedItems.length}`);

            set((state) => ({
              carts: { ...state.carts, [resolvedContextId!]: mergedItems },
              tableOrderIds: { ...state.tableOrderIds, [tableId]: orderId },
              lastServerSync: { ...state.lastServerSync, [resolvedContextId!]: Date.now() },
              pendingSync: false
            }));
          } catch (err) {
            console.error("❌ [CartStore] Fetch failed:", err);
          }
        }, 100); // 🚀 FASTER FETCH: Reduced from 300ms
        
        set({ _fetchTimeout: timeout } as any);
      },
      setTableOrderId: (tableId, orderId) => {
        const { tableOrderIds } = get();
        set({
          tableOrderIds: {
            ...tableOrderIds,
            [tableId]: orderId,
          },
        });
      },

      checkoutOrder: async (tableId) => {
        try {
          console.log(`🚀 [CartStore] Initiating Checkout for Table: ${tableId}`);
          const response = await fetch(`${API_URL}/api/orders/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableId }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [CartStore] Checkout API Error (${response.status}):`, errorText);
            return { success: false };
          }

          const data = await response.json();
          console.log("✅ [CartStore] Checkout Success:", data);
          return { success: true };
        } catch (err) {
          console.error("❌ [CartStore] Checkout failed:", err);
          return { success: false };
        }
      },

      completeOrder: async (tableId) => {
        try {
          console.log(`🚀 [CartStore] Completing Order for Table: ${tableId}`);
          const response = await fetch(`${API_URL}/api/orders/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableId }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [CartStore] Complete API Error (${response.status}):`, errorText);
            return { success: false };
          }

          const data = await response.json();
          console.log(`✅ [CartStore] Complete Success:`, data);

          if (data.success) {
            // 🚀 INSTANT LOCAL RESET: Wipe everything related to this table immediately
            get().clearTableSession(tableId);
            
            // Clean up the order ID mapping
            set((state) => {
              const updatedIds = { ...state.tableOrderIds };
              delete updatedIds[tableId];
              return { tableOrderIds: updatedIds };
            });

            // Final fetch to ensure state matches DB
            await get().fetchCartFromDB(tableId);
            return { success: true };
          }
          return { success: false };
        } catch (err) {
          console.error("❌ [CartStore] Complete failed:", err);
          return { success: false };
        }
      },
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => 
        Platform.OS === 'web' ? window.sessionStorage : AsyncStorage
      ),
      partialize: (state) => ({
        carts: state.carts,
        discounts: state.discounts,
        tableOrderIds: state.tableOrderIds,
        currentContextId: state.currentContextId,
        lastLocalUpdate: state.lastLocalUpdate,
        lastServerSync: state.lastServerSync,
        deletedItemsShield: state.deletedItemsShield,
        operationVersion: state.operationVersion,
      }),
      merge: (persistedState: any, currentState) => {
        const merged = { ...currentState, ...persistedState };
        // 🛡️ RECOVERY: Ensure deletingItems is always a Set (not a plain object from storage)
        if (!(merged.deletingItems instanceof Set)) {
          merged.deletingItems = new Set();
        }
        return merged;
      },
    }
  )
);

/* ================= HELPERS ================= */

export const isItemSent = (item: any) => {
  if (!item) return false;
  const status = item.status || item.Status;
  const code = item.StatusCode || item.statusCode || item.status_code;

  // 🚀 PERSISTENT ITEMS: Anything that isn't brand new
  // Includes: SENT, READY, SERVED, HOLD, and VOIDED
  return (
    item.sent === 1 || 
    !!item.sentDate || 
    (status !== undefined && status !== "NEW" && status !== null) ||
    (code !== undefined && code !== 1 && code !== null)
  );
};

export const getContextId = (
  context?: {
    orderType: string;
    section?: string;
    tableNo?: string;
    takeawayNo?: string;
  } | null,
) => {
  if (!context) return null;

  if (context.orderType === "DINE_IN") {
    return `DINE_IN_${context.section}_${context.tableNo}`;
  }

  if (context.orderType === "TAKEAWAY") {
    return `TAKEAWAY_${context.takeawayNo}`;
  }

  return null;
};

export const getCart = () => useCartStore.getState().getCart();

export const addToCartGlobal = (item: Omit<CartItem, "qty" | "lineItemId">) =>
  useCartStore.getState().addToCartGlobal(item);

export const removeFromCartGlobal = (lineItemId: string) =>
  useCartStore.getState().removeFromCartGlobal(lineItemId);

export const clearCart = () => useCartStore.getState().clearCart();

export const setCurrentContext = (contextId: string | null) =>
  useCartStore.getState().setCurrentContext(contextId);

export const setCartItemsGlobal = (contextId: string, items: CartItem[], skipSync?: boolean) =>
  useCartStore.getState().setCartItems(contextId, items, skipSync);

export const subscribeCart = (listener: () => void) =>
  useCartStore.subscribe(listener);

export const updateCartItemFullGlobal = (
  lineItemId: string,
  updates: {
    qty?: number;
    note?: string;
    spicy?: string;
    salt?: string;
    oil?: string;
    sugar?: string;
    discount?: number;
    isTakeaway?: boolean;
    isVoided?: boolean;
  },
) => useCartStore.getState().updateCartItemFull(lineItemId, updates);

export const voidCartItemGlobal = (lineItemId: string) =>
  useCartStore.getState().voidCartItem(lineItemId);

export const fetchCartFromDBGlobal = (tableId: string) =>
  useCartStore.getState().fetchCartFromDB(tableId);

// 🚀 LIVE SYNC: Now handled globally via useGlobalSocketSync.ts
