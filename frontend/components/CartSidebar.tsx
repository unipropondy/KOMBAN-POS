import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  DimensionValue,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import { API_URL } from "../constants/Config";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import EditDishModal from "./EditDishModal";
import { useToast } from "./Toast";
import UniversalPrinter from "./UniversalPrinter";
import VoidItemModal from "./VoidItemModal";

import { socket } from "../constants/socket";
import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";
import {
  CartItem,
  clearCart as clearCartStandalone,
  useCartStore,
  isItemSent,
} from "../stores/cartStore";
import { useAuthStore } from "../stores/authStore";
import { holdOrder } from "../stores/heldOrdersStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { useCompanySettingsStore } from "../stores/companySettingsStore";

const EMPTY_ARRAY: any[] = [];

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatSectionGlobal = (sec: string) => {
  if (!sec) return "";
  const s = sec.toUpperCase();
  if (s.startsWith("SECTION_")) {
    return s.replace("SECTION_", "Section-");
  }
  return s;
};

const styles = StyleSheet.create({
  container: {
    height: "100%",
    backgroundColor: Theme.bgCard,
    borderLeftWidth: 1.5,
    borderLeftColor: Theme.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyCartSurface: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyCartIconWrap: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyCartIconPulse: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.primary + "10",
  },
  emptyCartIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.primary + "10",
  },
  emptyCartTitle: {
    fontFamily: Fonts.extraBold,
    fontSize: 22,
    color: Theme.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  emptyCartSubtitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  containerLandscapePhone: {
    padding: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    zIndex: 10,
  },
  tableIdentity: {},
  tableIdentityText: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
    textTransform: "uppercase",
  },
  headerIcons: { flexDirection: "row", gap: 8 },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: { paddingBottom: 20 },
  itemContainer: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.border + "80", // Softer border
    borderRadius: 16,
    backgroundColor: "#fff",
    overflow: "hidden",
    flexDirection: "row",
    ...Theme.shadowSm,
    borderBottomWidth: 2, // Slight dimensional feel
    borderBottomColor: Theme.border + "40",
  },
  itemExpanded: {
    backgroundColor: Theme.bgMuted + "50",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statusBar: { width: 4, height: "100%" },
  itemHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  itemIndexWrap: {
    width: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    marginRight: 8,
    gap: 2,
  },
  chevron: { marginLeft: -4 },
  itemIndex: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  itemInfo: { flex: 1, paddingRight: 4 },
  itemMainRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 9,
    fontFamily: Fonts.black,
    textTransform: "uppercase",
  },
  modifierListSmall: { marginTop: 4, paddingLeft: 10, gap: 2, marginBottom: 2 },
  modifierTextSmall: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  inlineControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sentQtyText: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
  },
  qtyControlSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 8,
    padding: 2,
  },
  qtyBtnSmall: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 6,
    ...Theme.shadowSm,
  },
  qtyTextSmall: {
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
  },
  priceContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemPrice: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Theme.primary,
    minWidth: 60,
    textAlign: "right",
  },
  deleteBtn: { padding: 4, marginLeft: 4 },
  textMuted: { color: Theme.textMuted },
  discountRow: {
    padding: 10,
    backgroundColor: Theme.bgMain + "30",
    borderTopWidth: 1,
    borderTopColor: Theme.border + "50",
  },
  discountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  discountInputSmall: {
    width: 60,
    height: 32,
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.border,
    textAlign: "center",
    fontSize: 12,
    fontFamily: Fonts.black,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  footer: { borderTopWidth: 1, borderTopColor: Theme.border, paddingTop: 16 },
  addBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.primaryLight,
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  addLabel: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginRight: 15,
  },
  addActions: { flex: 1, flexDirection: "row", gap: 15 },
  addBtnText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.primary },
  summary: { gap: 6, marginBottom: 20 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 10,
    opacity: 0.5,
  },
  payableLabel: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  payableValue: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  actions: { flexDirection: "row", gap: 10 },
  holdBtn: {
    flex: 1,
    height: 50,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Theme.shadowMd,
  },
  proceedBtn: {
    flex: 1.1,
    height: 50,
    backgroundColor: "#F59E0B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Theme.shadowMd,
  },
  btnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: Theme.bgCard,
    padding: 24,
    borderRadius: 20,
    width: 300,
  },
  modalTitle: { fontSize: 18, fontFamily: Fonts.black, marginBottom: 15 },
  modalInput: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalBtnCancel: { padding: 10 },
  modalBtnTextCancel: { color: Theme.textSecondary, fontFamily: Fonts.bold },
  modalBtnConfirm: {
    backgroundColor: Theme.danger,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalBtnTextConfirm: { color: "#fff", fontFamily: Fonts.black },
  twBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  twBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.danger,
  },
  strikeThrough: {
    textDecorationLine: "line-through",
    marginBottom: -2,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.danger + "10",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Theme.danger + "20",
  },
  clearBtnText: {
    color: Theme.danger,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  discountBadge: {
    backgroundColor: "#22C55E15",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22C55E30",
  },
  discountBadgeText: {
    color: "#15803D",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  orderIdLabel: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    marginTop: 2,
    opacity: 0.8,
  },
  sentLabel: {
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 10,
  },
  syncText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  voidQtyWrap: {
    marginBottom: 10,
  },
  voidQtyLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
});


// 🟢 MEMOIZED CART ITEM COMPONENT: Stays outside to prevent re-creation
const CartItemRow = React.memo(
  ({
    item,
    index,
    isPhone,
    isLandscape,
    onEdit,
    onPlus,
    onMinus,
    onTakeaway,
    onVoid,
    tableStatus,
    isDeleting,
  }: any) => {
    const isSent = isItemSent(item);
    const isVoided =
      item.status === "VOIDED" ||
      item.StatusCode === 0 ||
      item.statusCode === 0;

    return (
      <View style={styles.itemContainer}>
        <View
          style={[
            styles.statusBar,
            { backgroundColor: isSent ? "#22C55E" : "#3B82F6" },
          ]}
        />
        <Pressable
          style={styles.itemHeader}
          onPress={() => !isSent && onEdit(item)}
        >
          {(!isPhone || isLandscape) && (
            <View style={styles.itemIndexWrap}>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={Theme.textMuted}
                style={styles.chevron}
              />
              <Text style={styles.itemIndex}>{index + 1}</Text>
            </View>
          )}

          <View style={styles.itemInfo}>
            <View
              style={[
                styles.itemMainRow,
                isPhone && { alignItems: "center", gap: 6 },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  flex: 1,
                }}
              >
                <Text
                  style={[
                    styles.itemName,
                    (isSent || isVoided) && styles.textMuted,
                    isVoided && styles.strikeThrough,
                    isPhone && { fontSize: 13, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.isTakeaway && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      onTakeaway(item.lineItemId, !item.isTakeaway);
                    }}
                    style={[
                      styles.twBadge,
                      {
                        backgroundColor: Theme.danger + "15",
                        borderColor: Theme.danger + "30",
                      },
                    ]}
                  >
                    <Text style={[styles.twBadgeText, { color: Theme.danger }]}>
                      TW
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View
                style={[
                  styles.statusTag,
                  {
                    backgroundColor: isVoided
                      ? Theme.danger + "10"
                      : isSent
                        ? "#22C55E15"
                        : "#3B82F615",
                    borderColor: isVoided
                      ? Theme.danger + "30"
                      : isSent
                        ? "#22C55E30"
                        : "#3B82F630",
                    paddingVertical: isPhone ? 2 : 4,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    {
                      fontSize: isPhone ? 8 : 9,
                      color: isVoided
                        ? Theme.danger
                        : isSent
                          ? "#15803D"
                          : "#1D4ED8",
                    },
                  ]}
                >
                  {isVoided ? "VOIDED" : isSent ? "SENT" : "NEW"}
                </Text>
              </View>
            </View>

            <View style={styles.modifierListSmall}>
              {item.modifiers &&
                item.modifiers.map((m: any, idx: number) => (
                  <Text
                    key={`${m.ModifierId}-${idx}`}
                    style={styles.modifierTextSmall}
                  >
                    • {m.ModifierName}
                    {m.Price > 0 ? ` (+$${m.Price.toFixed(2)})` : ""}
                  </Text>
                ))}
              {item.note || item.notes ? (
                <Text style={styles.modifierTextSmall}>
                  • Note: {item.note || item.notes}
                </Text>
              ) : null}
            </View>

            <View style={[styles.inlineControls, isPhone && { marginTop: 8 }]}>
              {isSent || isVoided ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={styles.sentLabel}>
                    <Text
                      style={[
                        styles.sentQtyText,
                        isVoided && styles.strikeThrough,
                      ]}
                    >
                      QTY: {item.qty}
                    </Text>
                  </View>
                  {isSent && !isVoided && tableStatus !== "BILL_REQUESTED" && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onVoid(item);
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={Theme.danger}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={[
                      styles.qtyControlSmall,
                      isPhone && {
                        backgroundColor: Theme.bgCard,
                        borderWidth: 1,
                        borderColor: Theme.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.qtyBtnSmall,
                        isPhone && { width: 32, height: 32 },
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onMinus(item.lineItemId, item.qty - 1);
                      }}
                    >
                      <Ionicons
                        name="remove"
                        size={isPhone ? 20 : 18}
                        color={Theme.primary}
                      />
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.qtyTextSmall,
                        isPhone && { paddingHorizontal: 12, fontSize: 14 },
                      ]}
                    >
                      {item.qty}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.qtyBtnSmall,
                        isPhone && { width: 32, height: 32 },
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onPlus(item.lineItemId, item.qty + 1);
                      }}
                    >
                      <Ionicons
                        name="add"
                        size={isPhone ? 20 : 18}
                        color={Theme.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  {tableStatus !== "BILL_REQUESTED" && (
                    <TouchableOpacity
                      disabled={isDeleting}
                      onPress={(e) => {
                        e.stopPropagation();
                        console.log(`[TRACE] [${Date.now()}] DELETE_CLICK | Item: ${item.name} (${item.lineItemId})`);
                        onMinus(item.lineItemId, 0);
                      }}
                      style={{ padding: 4 }}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={Theme.danger} />
                      ) : (
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={Theme.textMuted}
                        />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={{ flex: 1 }} />
              <View style={[styles.priceContainer, { alignItems: "flex-end" }]}>
                {item.discount > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={[
                        styles.itemPrice,
                        {
                          fontSize: isPhone ? 10 : 11,
                          textDecorationLine: "line-through",
                          color: Theme.textMuted,
                          minWidth: 0,
                        },
                      ]}
                    >
                      ${((item.price || 0) * item.qty).toFixed(2)}
                    </Text>
                    <View
                      style={[
                        styles.discountBadge,
                        isPhone && { paddingHorizontal: 3 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.discountBadgeText,
                          isPhone && { fontSize: 8 },
                        ]}
                      >
                        -{item.discount}%
                      </Text>
                    </View>
                  </View>
                )}
                <Text
                  style={[
                    styles.itemPrice,
                    (isSent || isVoided) && styles.textMuted,
                    isVoided && styles.strikeThrough,
                    isPhone && { fontSize: 14 },
                  ]}
                >
                  ${((item.price || 0) * item.qty * (1 - (item.discount || 0) / 100)).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );

  },
  (prev, next) => {
    return (
      prev.item.lineItemId === next.item.lineItemId &&
      prev.item.qty === next.item.qty &&
      prev.item.status === next.item.status &&
      prev.item.isTakeaway === next.item.isTakeaway &&
      prev.tableStatus === next.tableStatus &&
      prev.isPhone === next.isPhone &&
      prev.isLandscape === next.isLandscape
    );
  },
);

interface CartSidebarProps {
  width?: DimensionValue;
}

export default function CartSidebar({ width = 400 }: CartSidebarProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const isPhone = Math.min(screenWidth, screenHeight) < 500;

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CartItem | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [itemToVoid, setItemToVoid] = useState<any | null>(null);
  const [voidQty, setVoidQty] = useState("1");
  const [cancelPassword, setCancelPassword] = useState("");

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const orderContext = useOrderContextStore((state) => state.currentOrder);

  // 🟢 OPTIMIZED SELECTORS: Only re-render when SPECIFIC data changes
  const currentContextId = useCartStore((state) => state.currentContextId);
  const cart = useCartStore(
    (state) =>
      (currentContextId ? state.carts[currentContextId] : undefined) ||
      EMPTY_ARRAY,
  );
  const currentDiscount = useCartStore(
    (state) => state.discounts[currentContextId || ""],
  );
  const deletingItems = useCartStore((state) => state.deletingItems);

  const removeFromCartGlobal = useCartStore(
    (state) => state.removeFromCartGlobal,
  );
  const voidCartItem = useCartStore((state) => state.voidCartItem);
  const addToCartGlobal = useCartStore((state) => state.addToCartGlobal);
  const updateCartItemQty = useCartStore((state) => state.updateCartItemQty);
  const updateCartItemTakeaway = useCartStore(
    (state) => state.updateCartItemTakeaway,
  );
  const updateCartItemDiscount = useCartStore(
    (state) => state.updateCartItemDiscount,
  );
  const currentTableOrderId = useCartStore((state) =>
    orderContext?.tableId
      ? state.tableOrderIds[orderContext.tableId]
      : undefined,
  );
  const pendingSync = useCartStore((state) => state.pendingSync);

  const settings = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settings.currencySymbol || "$";
  const gstRate = (settings.gstPercentage || 0) / 100;

  const activeOrders = useActiveOrdersStore((state) => state.activeOrders);
  const appendOrder = useActiveOrdersStore((state) => state.appendOrder);
  const markItemsSent = useActiveOrdersStore((state) => state.markItemsSent);
  const closeActiveOrder = useActiveOrdersStore(
    (state) => state.closeActiveOrder,
  );
  const voidOrderItem = useActiveOrdersStore((state) => state.voidOrderItem);
  const updateTableStatus = useTableStatusStore((s) => s.updateTableStatus);
  const tables = useTableStatusStore((s) => s.tables);

  const tableData = useMemo(() => {
    if (!orderContext) return null;
    if (orderContext.orderType === "TAKEAWAY") {
      return tables.find(
        (t) =>
          t.section === "TAKEAWAY" && t.tableNo === orderContext.takeawayNo,
      );
    }
    return tables.find(
      (t) =>
        t.section === orderContext.section &&
        t.tableNo === orderContext.tableNo,
    );
  }, [tables, orderContext]);

  const unsentCount = useMemo(() => {
    return cart.filter((i: any) => !isItemSent(i)).length;
  }, [cart]);

  const displayItems = useMemo(() => {
    return [...cart].sort((a, b) => {
      // 1. Group by status: Sent (Top) vs New (Bottom)
      const isSentA = isItemSent(a);
      const isSentB = isItemSent(b);

      if (isSentA !== isSentB) {
        return isSentA ? -1 : 1; // Sent items always above New items
      }

      // 2. Chronological within groups
      const timeA = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
      const timeB = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;

      if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
        return timeA - timeB;
      }

      // Tie-breaker: Use lineItemId to ensure stable sort
      return String(a.lineItemId).localeCompare(String(b.lineItemId));
    });
  }, [cart]);

  const currentTableStatus = useMemo(() => {
    if (!tableData) return "EMPTY";

    // Normalize status if it comes from the database as a number
    const s = tableData.status;
    if (
      typeof s === "number" ||
      typeof (tableData as any).Status === "number"
    ) {
      const val = typeof s === "number" ? s : (tableData as any).Status;
      const statusMap: Record<number, string> = {
        0: "EMPTY",
        1: "SENT",
        2: "BILL_REQUESTED",
        3: "HOLD",
        4: "LOCKED",
        5: "SENT",
      };
      return statusMap[val] || "EMPTY";
    }
    return s || "EMPTY";
  }, [tableData]);

  const activeOrder = useMemo(() => {
    if (!orderContext) return undefined;
    return activeOrders.find((o) => {
      if (orderContext.orderType === "DINE_IN") {
        return (
          o.context.orderType === "DINE_IN" &&
          o.context.section === orderContext.section &&
          o.context.tableNo === orderContext.tableNo
        );
      }
      return (
        o.context.orderType === "TAKEAWAY" &&
        o.context.takeawayNo === orderContext.takeawayNo
      );
    });
  }, [activeOrders, orderContext]);

  useEffect(() => {
    if (orderContext?.tableId) {
      console.log(
        `🔄 [CartSidebar] Refreshing cart from DB for table: ${orderContext.tableId}`,
      );
      useCartStore.getState().fetchCartFromDB(orderContext.tableId);
    }
  }, [orderContext?.tableId]);

  useEffect(() => {
    // ✅ Sync official Order ID from DB whenever table changes
    if (orderContext?.tableId) {
      fetch(`${API_URL}/api/tables/${orderContext.tableId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.table?.CurrentOrderId) {
            useCartStore
              .getState()
              .setTableOrderId(
                orderContext.tableId!,
                data.table.CurrentOrderId,
              );
          }
        })
        .catch((err) => console.error("Sidebar ID sync error:", err));
    }
  }, [orderContext?.tableId]);


  useEffect(() => {
    // 🔥 If the cart is completely empty (no unsent items AND no active order items),
    // and we have a table context, reset the table status to Available (0) in the DB.
    const ctx = orderContext;
    if (ctx?.tableId && false && displayItems.length === 0) {
      console.log(
        `🧹 [CartSidebar] Cart empty, resetting table ${ctx?.tableId}`,
      );
      fetch(`${API_URL}/api/orders/save-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: ctx?.tableId,
          items: [],
        }),
      }).catch((err) => console.error("Error auto-resetting table:", err));
    }
  }, [displayItems.length, orderContext?.tableId]);

  const { grossTotal, totalDiscount } = useMemo(() => {
    return displayItems.reduce(
      (acc, item) => {
        const isVoided = "status" in item && item.status === "VOIDED";
        if (isVoided) return acc;
        const baseTotal = (item.price || 0) * item.qty;
        const discountVal = (item.discount || 0) / 100;
        const itemDiscount = baseTotal * discountVal;

        return {
          grossTotal: acc.grossTotal + baseTotal,
          totalDiscount: acc.totalDiscount + itemDiscount,
        };
      },
      { grossTotal: 0, totalDiscount: 0 },
    );
  }, [displayItems]);

  const subtotal = grossTotal - totalDiscount;
  const taxAmount = subtotal * gstRate;
  const payableAmount = subtotal + taxAmount;

  const handleClearCart = () => {
    if (cart.length === 0) return;
    clearCartStandalone();
    showToast({
      type: "success",
      message: "Cart Cleared",
      subtitle: "Unsent items removed.",
    });
  };

  if (!orderContext) {
    return (
      <View
        style={[
          styles.container,
          { width },
          isPhone && isLandscape && styles.containerLandscapePhone,
        ]}
      >
        <View style={styles.emptyCartSurface}>
          <View style={[styles.emptyCartIconWrap, { opacity: 0.6 }]}>
            <View
              style={[
                styles.emptyCartIconPulse,
                { backgroundColor: Theme.border + "40" },
              ]}
            />
            <View
              style={[
                styles.emptyCartIconContainer,
                { borderColor: Theme.border },
              ]}
            >
              <Ionicons name="cart-outline" size={48} color={Theme.textMuted} />
            </View>
          </View>
          <Text style={styles.emptyCartTitle}>No Active Order</Text>
          <Text style={styles.emptyCartSubtitle}>
            Select a table or start a takeaway to begin an order.
          </Text>
        </View>
      </View>
    );
  }

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItemId(expandedItemId === id ? null : id);
  };

  const handleCheckout = async () => {
    if (!orderContext || isCheckingOut) return;

    const tableId = orderContext.tableId || tableData?.tableId;
    if (!tableId) {
      showToast({
        type: "error",
        message: "Error",
        subtitle: "Table ID not found.",
      });
      return;
    }

    // 🛡️ DUPLICATE PREVENTION: Ensure table is still occupied/sent
    if (!tableData || tableData.status === "EMPTY" || tableData.status === 0) {
      showToast({
        type: "error",
        message: "Checkout Blocked",
        subtitle: "Table is already available.",
      });
      return;
    }

    setIsCheckingOut(true);

    try {
      // 🚀 TURBO PRINT: Start printing immediately
      let displayOrderId = activeOrder?.orderId || currentTableOrderId || "NEW";
      if (
        displayOrderId === "NEW" ||
        displayOrderId === "PENDING" ||
        displayOrderId === "#NEW"
      ) {
        const timestamp = new Date().getTime().toString().slice(-6);
        displayOrderId = `ORD-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${timestamp}`;
      }
      const currentOrderId = displayOrderId;
      (async () => {
        const printData = {
          id: currentOrderId,
          invoiceNumber: currentOrderId,
          date: new Date(),
          items: cart.filter(
            (i: any) => i.status !== "VOIDED" && i.statusCode !== 0,
          ),
          total: payableAmount,
          totalAmount: payableAmount,
          subTotal: grossTotal,
          taxAmount: taxAmount,
          discountAmount: totalDiscount,
          tableNo: orderContext.tableNo,
          section: orderContext.section,
          serverName: user?.userName || "Staff",
          paymentMethod: "CASH",
        };

        console.log("🖨️ [SidebarTurboPrint] Sending to printer instantly...");
        try {
          UniversalPrinter.printCheckoutBill(printData, user?.userId);
        } catch (e) {
          console.error("Sidebar Print Error:", e);
        }
      })();

      // 🚀 VERIFIED CHECKOUT: Wait for server response
      const res = await useCartStore.getState().checkoutOrder(tableId);

      if (res && res.success) {
        // 🚀 SYNC: Refresh kitchen and global status stores
        useActiveOrdersStore.getState().fetchActiveKitchenOrders();

        showToast({
          type: "success",
          message: "Success",
          subtitle: "Order finalized & Printing...",
          duration: 800,
        });

        router.replace(`/(tabs)/category?section=${orderContext.section}`);
      } else {
        showToast({
          type: "error",
          message: "Checkout Failed",
          subtitle: "Please try again or check connection.",
        });
      }
    } catch (err) {
      console.error("Checkout flow error:", err);
      showToast({
        type: "error",
        message: "Error",
        subtitle: "An unexpected error occurred during checkout.",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleSendOrder = async () => {
    const unsentItems = cart.filter(
      (i: any) => !i.status || i.status === "NEW",
    );
    if (unsentItems.length === 0) return;

    let targetOrderId = activeOrder?.orderId || currentTableOrderId;

    // 🚀 SPEED OPTIMIZATION: Optimistic UI
    appendOrder(targetOrderId || "NEW", orderContext, unsentItems);
    markItemsSent(targetOrderId || "NEW");
    useCartStore.getState().markAllAsSent();

    // 🔥 FIX: Update table status locally BEFORE redirecting so it's not gray
    updateTableStatus(
      orderContext.tableId || "",
      orderContext.section || "TAKEAWAY",
      orderContext.orderType === "DINE_IN"
        ? orderContext.tableNo!
        : orderContext.takeawayNo!,
      targetOrderId || "NEW",
      "SENT",
      new Date().toISOString(),
      undefined,
      payableAmount,
    );

    showToast({
      type: "success",
      message: "Order Sent",
      subtitle: "Kitchen notified.",
      duration: 800,
    });

    // 🚀 RESTORED REDIRECT: Back to map as requested
    // 🚀 HYPER-SPEED SEND: Notify Kitchen and Printer INSTANTLY
    const currentOrderId = targetOrderId || "NEW";
    const currentItems = [...unsentItems];

    // 1. Alert KDS immediately (No waiting)
    socket.emit("new_order", {
      orderId: currentOrderId,
      context: orderContext,
      items: currentItems.map((i) => ({ ...i, status: "SENT" })),
      createdAt: Date.now(),
    });

    // 2. Start Printers immediately (No waiting)
    (async () => {
      const kitchenGroups: Record<string, any[]> = {};
      currentItems.forEach((item: any) => {
        const kCode = item.KitchenTypeCode || "0";
        if (!kitchenGroups[kCode]) kitchenGroups[kCode] = [];

        // 🚀 INJECT NOTE AS MODIFIER: This ensures it shows up exactly like a modifier on the KOT
        const enhancedItem = { ...item };
        if (item.note && item.note.trim()) {
          const virtualMod = {
            ModifierId: "00000000-0000-0000-0000-000000000001",
            ModifierName: `* ${item.note.trim()}`,
            Price: 0,
          };
          enhancedItem.modifiers = [...(item.modifiers || []), virtualMod];
        }

        kitchenGroups[kCode].push(enhancedItem);
      });

      for (const [kCode, items] of Object.entries(kitchenGroups)) {
        const printerIp = items[0].PrinterIP;
        const kotData = {
          orderId: currentOrderId,
          orderNo: currentOrderId,
          tableNo:
            orderContext.orderType === "DINE_IN"
              ? orderContext.tableNo
              : `TW-${orderContext.takeawayNo}`,
          waiterName: user?.userName || "Staff",
          items: items,
          kitchenName:
            items[0].KitchenTypeName || (kCode === "0" ? "KITCHEN" : kCode),
        };
        const isAdditional = cart.some((i: any) => isItemSent(i));
        UniversalPrinter.printKOT(
          kotData,
          "SYSTEM",
          isAdditional ? "ADDITIONAL" : "NEW",
          printerIp,
        );
      }
    })();

    // 3. Close Sidebar & Redirect instantly
    router.replace(`/(tabs)/category?section=${orderContext.section}`);

    // 4. Handle Server Save in the background
    (async () => {
      try {
        const sendRes = await fetch(`${API_URL}/api/orders/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: orderContext.tableId,
            orderType: orderContext.orderType,
            userId: user?.userId,
            items: currentItems.map((item: any) => ({
              ...item,
              status: item.status === "VOIDED" ? "VOIDED" : "SENT",
            })),
          }),
        });

        const sendData = await sendRes.json();
        if (sendData.success) {
          const officialOrderId =
            sendData.orderId || sendData.currentOrderId || currentOrderId;
          useCartStore
            .getState()
            .setTableOrderId(orderContext.tableId!, officialOrderId);
          useActiveOrdersStore
            .getState()
            .updateOrderId(currentOrderId, officialOrderId);

          updateTableStatus(
            orderContext.tableId || "",
            orderContext.section || "TAKEAWAY",
            orderContext.orderType === "DINE_IN"
              ? orderContext.tableNo!
              : orderContext.takeawayNo!,
            officialOrderId,
            "SENT",
            sendData.StartTime,
            undefined,
            payableAmount,
          );

          // Final sync refresh
          useCartStore.getState().fetchCartFromDB(orderContext.tableId!);
        }
      } catch (err) {
        console.error("Background Send Error:", err);
      }
    })();
  };

  const renderEmptyState = () => (
    <View style={styles.emptyCartSurface}>
      <View style={styles.emptyCartIconWrap}>
        <View style={styles.emptyCartIconPulse} />
        <View style={styles.emptyCartIconContainer}>
          <Ionicons name="fast-food-outline" size={48} color={Theme.primary} />
        </View>
      </View>
      <Text style={styles.emptyCartTitle}>Empty Cart</Text>
      <Text style={styles.emptyCartSubtitle}>
        Select delicious dishes from the menu to start this order.
      </Text>
    </View>
  );

  const handlePlus = React.useCallback(
    (lineItemId: string, newQty: number) => {
      updateCartItemQty(lineItemId, newQty);
    },
    [updateCartItemQty],
  );

  const handleMinus = React.useCallback(
    (lineItemId: string, newQty: number) => {
      updateCartItemQty(lineItemId, newQty);
    },
    [updateCartItemQty],
  );

  const handleTakeaway = React.useCallback(
    (lineItemId: string, val: boolean) => {
      updateCartItemTakeaway(lineItemId, val);
    },
    [updateCartItemTakeaway],
  );

  const handleEdit = React.useCallback((item: any) => {
    setItemToEdit(item);
    setIsEditModalVisible(true);
  }, []);

  const handleVoidItem = React.useCallback(
    (item: any) => {
      const isSent = item.status && item.status !== "NEW";

      if (!isSent) {
        // 🚀 SMART BIN: If unsent, just remove immediately (no password needed)
        removeFromCartGlobal(item.lineItemId);
        return;
      }

      // 🚀 VOID: If already sent, show the professional void modal (password needed)
      setCancelPassword("");
      setVoidQty(String(item.qty || 1));
      setItemToVoid(item);
      setShowCancelModal(true);
    },
    [removeFromCartGlobal],
  );

  const renderItem = React.useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <CartItemRow
        item={item}
        index={index}
        isPhone={isPhone}
        isLandscape={isLandscape}
        onEdit={handleEdit}
        onPlus={handlePlus}
        onMinus={handleMinus}
        onTakeaway={handleTakeaway}
        onVoid={handleVoidItem}
        tableStatus={currentTableStatus}
        isDeleting={deletingItems.has(item.lineItemId)}
      />
    ),
    [
      isPhone,
      isLandscape,
      handleEdit,
      handlePlus,
      handleMinus,
      handleTakeaway,
      handleVoidItem,
      currentTableStatus,
      deletingItems,
    ],
  );

  return (
    <View
      style={[
        styles.container,
        { width },
        isPhone && isLandscape && styles.containerLandscapePhone,
      ]}
    >
      {/* HEADER ACTIONS */}
      <View
        style={[styles.header, isPhone && isLandscape && { marginBottom: 10 }]}
      >
        <View style={styles.tableIdentity}>
          <Text
            style={[
              styles.tableIdentityText,
              isPhone && isLandscape && { fontSize: 13 },
            ]}
          >
            {orderContext.orderType === "TAKEAWAY"
              ? `TAKEAWAY #${orderContext.takeawayNo}`
              : `${formatSectionGlobal(orderContext.section || "")} - T${orderContext.tableNo}`}
          </Text>
          {orderContext.tableId &&
            currentTableOrderId &&
            (cart.length > 0 || currentTableStatus !== "EMPTY") && (
              <Text style={styles.orderIdLabel}>
                Order ID: {currentTableOrderId}
              </Text>
            )}
        </View>

        {unsentCount > 0 && (
          <TouchableOpacity
            style={[
              styles.clearBtn,
              isPhone && {
                paddingHorizontal: 10,
                width: 44,
                justifyContent: "center",
              },
            ]}
            onPress={handleClearCart}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={Theme.danger} />
            {!isPhone && <Text style={styles.clearBtnText}>Clear Unsent</Text>}
          </TouchableOpacity>
        )}
        {pendingSync && (
          <View style={styles.syncBadge}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.syncText}>Syncing...</Text>
          </View>
        )}
      </View>

      {/* ITEMS LIST */}
      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.lineItemId}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.listContent,
          displayItems.length === 0 && { flex: 1, justifyContent: "center" },
        ]}
        showsVerticalScrollIndicator={true}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />

      {/* FOOTER AREA */}
      {displayItems.length > 0 && (
        <View
          style={[styles.footer, isPhone && isLandscape && { paddingTop: 8 }]}
        >
          <>
            <View
              style={[
                styles.summary,
                isPhone && isLandscape && { marginBottom: 8 },
              ]}
            >
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Gross Total</Text>
                <Text style={styles.summaryValue}>
                  {currencySymbol}
                  {grossTotal.toFixed(2)}
                </Text>
              </View>
              {totalDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Theme.danger }]}>
                    Discount
                  </Text>
                  <Text style={[styles.summaryValue, { color: Theme.danger }]}>
                    -{currencySymbol}
                    {totalDiscount.toFixed(2)}
                  </Text>
                </View>
              )}
              {taxAmount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    GST ({settings.gstPercentage}%)
                  </Text>
                  <Text style={styles.summaryValue}>
                    {currencySymbol}
                    {taxAmount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text
                  style={[
                    styles.payableLabel,
                    isPhone && isLandscape && { fontSize: 13 },
                  ]}
                >
                  Payable
                </Text>
                <Text
                  style={[
                    styles.payableValue,
                    isPhone && isLandscape && { fontSize: 14 },
                  ]}
                >
                  {currencySymbol}
                  {payableAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              {unsentCount > 0 ? (
                <>
                  <TouchableOpacity
                    style={styles.holdBtn}
                    onPress={async () => {
                      const targetOrderId = activeOrder?.orderId || "HOLD";
                      const tableId = orderContext.tableId;

                      // 🚀 OPTIMISTIC UI: Change color instantly
                      if (tableId) {
                        updateTableStatus(
                          tableId,
                          orderContext.section!,
                          orderContext.tableNo!,
                          targetOrderId,
                          "HOLD",
                          Date.now(),
                          undefined,
                          payableAmount,
                        );
                      }

                      // 🚀 Background Sync
                      if (tableId) {
                        (async () => {
                          try {
                            await fetch(`${API_URL}/api/orders/save-cart`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                tableId: tableId,
                                orderId: targetOrderId,
                                items: cart,
                              }),
                            });

                            const holdRes = await fetch(
                              `${API_URL}/api/orders/hold`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ tableId: tableId }),
                              },
                            );
                            const holdData = await holdRes.json();

                            // Re-sync with server timestamp if available
                            if (holdData.success) {
                              const serverStartTime =
                                holdData.StartTime || holdData.startTime;
                              updateTableStatus(
                                tableId,
                                orderContext.section!,
                                orderContext.tableNo!,
                                targetOrderId,
                                "HOLD",
                                serverStartTime,
                                undefined,
                                payableAmount,
                              );
                            }
                          } catch (err) {
                            console.error("Hold sync error:", err);
                          }
                        })();
                      }

                      holdOrder(targetOrderId, cart, orderContext);
                      router.replace(
                        `/(tabs)/category?section=${orderContext.section}`,
                      );
                    }}
                  >
                    <Ionicons
                      name="pause-circle-outline"
                      size={20}
                      color="#fff"
                    />
                    {!isPhone && <Text style={styles.btnText}>Hold Cart</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.proceedBtn,
                      { backgroundColor: Theme.success },
                    ]}
                    onPress={() => handleSendOrder()}
                  >
                    <Ionicons name="send" size={20} color="#fff" />
                    {!isPhone && (
                      <Text style={styles.btnText}>Send to Kitchen</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : currentTableStatus === "SENT" ? (
                <TouchableOpacity
                  disabled={isCheckingOut}
                  style={[
                    styles.proceedBtn,
                    {
                      flex: 1,
                      backgroundColor: isCheckingOut ? Theme.border : "#F59E0B",
                    },
                  ]}
                  onPress={() => handleCheckout()}
                >
                  {isCheckingOut ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="receipt-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.btnText}>
                    {isCheckingOut ? "Checking out..." : "Checkout"}
                  </Text>
                </TouchableOpacity>
              ) : currentTableStatus === "HOLD" ||
                currentTableStatus === "BILL_REQUESTED" ? (
                <TouchableOpacity
                  style={[
                    styles.proceedBtn,
                    { flex: 1, backgroundColor: Theme.primary },
                  ]}
                  onPress={() => router.push("/summary")}
                >
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.btnText}>Proceed to Pay</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        </View>
      )}

      <VoidItemModal
        visible={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setItemToVoid(null);
        }}
        itemName={itemToVoid?.name || "Item"}
        onConfirm={async (password) => {
          const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          const verifyData = await verifyRes.json();

          if (!verifyData.success) {
            showToast({ type: "error", message: "Incorrect Password" });
            return;
          }

          // 🚀 OPTIMISTIC MODAL CLOSE: Close immediately for a professional feel
          setShowCancelModal(false);
          setCancelPassword("");

          if (itemToVoid && orderContext?.tableId) {
            // 🚀 OPTIMISTIC UI: Strike-through immediately
            voidCartItem(itemToVoid.lineItemId);

            try {
              const res = await fetch(`${API_URL}/api/orders/remove-item`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tableId: orderContext.tableId,
                  itemId: itemToVoid.lineItemId,
                  qtyToVoid: itemToVoid.qty,
                  userId: user?.userId,
                }),
              });

              if (res.ok) {
                if (activeOrder) {
                  voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
                }
                showToast({
                  type: "success",
                  message: "Item Voided",
                  subtitle: "Item strike-through enabled",
                });
              }
            } catch (err) {
              console.error("Void Error:", err);
              showToast({ type: "error", message: "Failed to void item" });
              useCartStore.getState().fetchCartFromDB(orderContext.tableId);
            }
          }

          setItemToVoid(null);
        }}
      />

      {/* EDIT DISH MODAL */}
      <EditDishModal
        key={itemToEdit?.lineItemId || "sidebar-edit-modal"}
        visible={isEditModalVisible}
        item={itemToEdit}
        onClose={() => {
          setIsEditModalVisible(false);
          setItemToEdit(null);
        }}
      />
    </View>
  );
}


