import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/Skeleton";
import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useToast } from "../../components/Toast";
import { useShallow } from 'zustand/react/shallow';

import StoreSettingsModal from "@/components/payment/StoreSettingsModal";
import { useActiveOrdersStore } from "@/stores/activeOrdersStore";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchCartFromDBGlobal,
  getContextId,
  setCartItemsGlobal,
  setCurrentContext,
  useCartStore,
} from "@/stores/cartStore";
import { getHeldOrders } from "@/stores/heldOrdersStore";
import { OrderContext, setOrderContext } from "@/stores/orderContextStore";
import { usePaymentSettingsStore } from "@/stores/paymentSettingsStore";
import {
  TableStatusType,
  useTableStatusStore,
} from "../../stores/tableStatusStore";
import { useMenuStore } from "@/stores/menuStore";

// --- MOBILE SOLID COLORS ---
const SOLID_LIGHT_GREEN = "#F0FDF4";
const SOLID_LIGHT_RED = "#FEF2F2";
const SOLID_LIGHT_BLUE = "#F0F9FF";
const SOLID_LIGHT_AMBER = "#FFFBEB";
const SOLID_LIGHT_VIOLET = "#F5F3FF";

const formatSectionGlobal = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  // Convert SECTION_1 -> Section 1 or "Section-1" -> Section 1
  return sec.replace("_", " ").replace("-", " ").replace("SECTION", "Section");
};

const getStatusUI = (status: number) => {
  const s = Number(status);
  switch (s) {
    case 1:
      return { text: "DINING", color: "#22c55e", lightBg: "#F0FDF4" };
    case 2:
      return { text: "CHECKOUT", color: "#fd7e14", lightBg: "#FFF7ED" };
    case 3:
      return { text: "HOLD", color: "#3b82f6", lightBg: "#F0F9FF" };
    case 4:
      return { text: "OVERTIME", color: "#8b5cf6", lightBg: "#F5F3FF" };
    case 5:
      return { text: "RESERVED", color: "#ef4444", lightBg: "#FEF2F2" };
    case 0:
    default:
      return { text: "AVAILABLE", color: "#94A3B8", lightBg: "transparent" }; // Gray
  }
};

// --- MEMOIZED TABLE COMPONENT ---
const TableItemComponent = React.memo(
  ({
    tableId,
    item,
    itemSize,
    activeTab,
    onPress,
    numberFont,
    smallFont,
    isTabletPortrait,
  }: {
    tableId: string;
    item: TableItem;
    itemSize: number;
    activeTab: string;
    onPress: (item: TableItem, tableData: any, isCheckout?: boolean) => void;
    numberFont: number;
    smallFont: number;
    isTabletPortrait?: boolean;
  }) => {
    // 🚀 O(1) Store Subscription: Only re-renders when THIS table changes
    const tableData = useTableStatusStore(
      state => state.tableMap[tableId]
    );

    // 🟢 Prioritize Store Status over API Status for instant feedback
    const status = (tableData && tableData.status !== 'EMPTY') 
      ? (tableData.status === 'SENT' ? 1 : tableData.status === 'BILL_REQUESTED' ? 2 : tableData.status === 'HOLD' ? 3 : tableData.status === 'LOCKED' ? 5 : 1)
      : Number(item.Status);
    
    let ui = getStatusUI(status);

    // Dynamic Overtime: If occupied (Dining/Hold) and backend flagged as overtime, override UI
    // Note: Status 2 (Checkout) is excluded here so that it keeps its high-priority Orange color.
    if ((status === 1 || status === 3) && item.isOvertime) {
      ui = getStatusUI(4);
    }

    // Use ONLY ui values derived from status
    const borderColor = status === 0 ? Theme.border : ui.color;
    const bgColor = status !== 0 ? ui.lightBg : Theme.bgCard;
    const textColor = status === 0 ? Theme.textPrimary : ui.color;
    const labelColor = Theme.textPrimary;

    let timeText = "";
    let billAmount = tableData?.totalAmount || item.totalAmount || 0;

    // Use ONLY valid (non-zero) startTime from any available source
    const startTime = (tableData?.startTime && tableData.startTime !== 0) ? tableData.startTime : item.StartTime;
    
    if (startTime && status !== 0 && status !== 5) {
      const time = new Date(startTime);
      if (!isNaN(time.getTime())) {
        timeText = time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    }

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.tableBox,
          {
            width: itemSize,
            height: itemSize,
            borderColor,
            backgroundColor: bgColor,
            borderWidth: status !== 0 ? 2 : 1.5,
            elevation: status !== 0 ? 0 : 2,
          },
        ]}
        onPress={() => onPress(item, tableData)}
      >
        <View style={styles.tableContent}>
          <Text
            style={[
              styles.tableNumber,
              { fontSize: numberFont, color: labelColor },
            ]}
          >
            {item.label}
          </Text>

          {status !== 0 && (
            <View style={styles.tableInfo}>
              <View style={[styles.statusChip, { backgroundColor: bgColor, borderColor: ui.color }]}>
                <Text style={[styles.statusChipText, { color: ui.color, fontSize: smallFont }]}>
                  {ui.text}
                </Text>
              </View>

              {status !== 0 && status !== 5 && (
                <View style={styles.tableStats}>
                  {timeText ? (
                    <Text
                      style={[
                        styles.timeText,
                        { fontSize: smallFont, color: textColor },
                      ]}
                    >
                      <Ionicons
                        name="time-outline"
                        size={smallFont}
                        color={textColor}
                      />{" "}
                      {timeText}
                    </Text>
                  ) : null}
                  {billAmount > 0 && (
                    <Text
                      style={[
                        styles.billText,
                        {
                          fontSize: smallFont + 2,
                          color: textColor,
                          fontWeight: "800",
                        },
                      ]}
                    >
                      ${billAmount.toFixed(2)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {status === 5 && (
            <View style={styles.lockedOverlay}>
              <Ionicons
                name="lock-closed"
                size={Math.max(12, itemSize * 0.15)}
                color={ui.color}
              />
              {tableData?.lockedByName ? (
                <View
                  style={{
                    backgroundColor: ui.color,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginTop: 2,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: smallFont - 1,
                      color: "#FFF",
                      fontWeight: "bold",
                    }}
                    numberOfLines={1}
                  >
                    {tableData.lockedByName}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* 🚀 HOLD OVERTIME INDICATOR (H) */}
          {status === 3 && !!tableData?.isHoldOvertime && (
            <View style={styles.holdOvertimeBadge}>
               <MaterialCommunityIcons name="alpha-h-circle" size={Math.max(14, itemSize * 0.18)} color={Theme.primary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
);

const TableGridSkeleton = ({
  itemSize,
  columns,
  gap,
  padding,
  insets,
}: any) => {
  const items = Array.from({ length: columns * 5 });
  return (
    <View
      style={{
        paddingHorizontal: padding,
        paddingTop: padding,
        paddingLeft: padding + insets.left,
        paddingRight: padding + insets.right,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: gap,
      }}
    >
      {items.map((_, i) => (
        <Skeleton
          key={i}
          width={itemSize}
          height={itemSize}
          borderRadius={12}
        />
      ))}
    </View>
  );
};

type TableItem = {
  id: string;
  label: string;
  DiningSection: number;
  Status: number;
  StartTime?: string | number | Date;
  totalAmount?: number;
  lockedByName?: string;
  isOvertime?: number;
  isHoldOvertime?: number;
};

const SECTIONS = ["SECTION_1", "SECTION_2", "SECTION_3", "TAKEAWAY"];

const SECTION_LABELS: Record<string, string> = {
  SECTION_1: "Section-1",
  SECTION_2: "Section-2",
  SECTION_3: "Section-3",
  TAKEAWAY: "Takeaway",
};

const SECTION_SHORT: Record<string, string> = {
  SECTION_1: "S1",
  SECTION_2: "S2",
  SECTION_3: "S3",
  TAKEAWAY: "TW",
};

const SECTION_ICONS: Record<string, string> = {
  SECTION_1: "restaurant-outline",
  SECTION_2: "restaurant-outline",
  SECTION_3: "restaurant-outline",
  TAKEAWAY: "bag-handle-outline",
};

import { socket } from "../../constants/socket";

export default function Category() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { showToast } = useToast();
  const { section: urlSection } = useLocalSearchParams<{ section?: string }>();

  const [activeTab, setActiveTab] = useState<string>("SECTION_1");
  const [allTables, setAllTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const sectionScrollRef = useRef<ScrollView>(null);

  // Removed global 'tables' selector for performance
  const getLockedName = useTableStatusStore((s: any) => s.getLockedName);
  const syncLockedTables = useTableStatusStore((s: any) => s.syncLockedTables);

  const insets = useSafeAreaInsets();
  const isTablet = Math.min(width, height) >= 500;
  const isLandscape = width > height;

  const { itemSize, numberFont, smallFont, columns, GAP, PADDING } = useMemo(() => {
    const insetsValue = insets; // Access insets from outside closure

    const gapVal = !isTablet && isLandscape ? 8 : 10;
    const paddingVal = isTablet ? 24 : isLandscape ? 12 : 16;
    const availableGridWidth = width - paddingVal * 2 - insetsValue.left - insetsValue.right - 2;

    let cols = 3;
    if (isTablet) {
      if (width < 768) cols = 4;
      else if (width < 1024) cols = 6;
      else if (width < 1280) cols = 8;
      else if (width < 1920) cols = 10;
      else cols = 12;
    } else {
      if (isLandscape) {
        cols = Math.max(5, Math.floor(availableGridWidth / 115));
      } else {
        cols = 3;
      }
    }

    const size = Math.floor((availableGridWidth - gapVal * (cols - 1)) / cols);
    const nFont = Math.max(12, Math.min(isTablet ? 24 : 20, size * 0.32));
    const sFont = Math.max(8, Math.min(isTablet ? 14 : 11, size * 0.18));

    return { 
      itemSize: size, 
      numberFont: nFont, 
      smallFont: sFont, 
      columns: cols, 
      GAP: gapVal, 
      PADDING: paddingVal 
    };
  }, [width, height, insets]);

  const user = useAuthStore((s: any) => s.user);
  const logout = useAuthStore((s: any) => s.logout);
  const canAccessSalesReport = useAuthStore((s: any) => s.canAccessSalesReport);
  const canAccessMembers = useAuthStore((s: any) => s.canAccessMembers);
  const canAccessTimeEntry = useAuthStore((s: any) => s.canAccessTimeEntry);
  const canAccessLockTables = useAuthStore((s: any) => s.canAccessLockTables);
  const canAccessKDS = useAuthStore((s: any) => s.canAccessKDS);
  const canAccessDayEnd = useAuthStore((s: any) => s.canAccessDayEnd);
  const canAccessStoreSettings = useAuthStore((s: any) => s.canAccessStoreSettings);
  const canAccessReceiptSettings = useAuthStore((s: any) => s.canAccessReceiptSettings);
  const isWaiter = useAuthStore((s: any) => s.isWaiter);

  // 🔔 Real-time sync now handled globally via useGlobalSocketSync

  // ——— Route guard: redirect to login if not authenticated ———
  useFocusEffect(
    React.useCallback(() => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // ✅ KDS Guard: Prevent KDS role from accessing table selection
      if (user.role === "KDS") {
        router.replace("/kds" as any);
        return;
      }
    }, [user]),
  );

  useEffect(() => {
    // Initial load
    fetchTables();
    fetchLockedTables();
    
    // Only fetch settings if not already loaded
    usePaymentSettingsStore.getState().fetchSettings();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Re-fetch only if data is likely stale (older than 30s)
      const lastUpdate = useTableStatusStore.getState().tables[0]?.startTime || 0;
      if (Date.now() - lastUpdate > 30000) {
        fetchLockedTables();
        fetchTables();
      }
    }, []),
  );

  // --- Real-time Sync (Polling every 15s as backup) ---
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTables();
    }, 60000); 
    return () => clearInterval(interval);
  }, [allTables.length]); 

  const fetchLockedTables = async () => {
    try {
      const response = await fetch(`${API_URL}/api/tables/locked`);
      const lockedTables = await response.json();
      if (Array.isArray(lockedTables)) {
        const syncList = lockedTables.map((t: any) => {
          const ds = Number(t.DiningSection);
          let section = "SECTION_1";
          if (ds === 1) section = "SECTION_1";
          else if (ds === 2) section = "SECTION_2";
          else if (ds === 3) section = "SECTION_3";
          else if (ds === 4) section = "TAKEAWAY";
          return {
            tableId: t.tableId || t.TableId,
            tableNo: t.tableNumber || t.TableNumber,
            section,
            lockedByName: t.lockedByName || "",
          };
        });
        syncLockedTables(syncList);
      }
    } catch (error) {
      console.error("Failed to fetch locked tables:", error);
    }
  };



  const fetchTables = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${API_URL}/api/tables/all`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      let tablesArray: any[] = [];
      if (Array.isArray(data)) tablesArray = data;
      else if (data?.data && Array.isArray(data.data)) tablesArray = data.data;
      else if (data?.recordset && Array.isArray(data.recordset))
        tablesArray = data.recordset;

      if (tablesArray.length > 0) {
        const convertedData: TableItem[] = tablesArray
          .map((item: any) => ({
            id: String(item.TableId || item.id || "").replace(/^\{|\}$/g, "").trim().toLowerCase(),
            label: item.TableNumber || item.label,
            DiningSection: Number(item.DiningSection) || 1,
            Status: Number(item.Status) || 0,
            StartTime: item.StartTime,
            lockedByName: item.lockedByName,
            totalAmount: Number(item.totalAmount) || 0,
            currentOrderId: item.currentOrderId,
            isOvertime: Number(item.isOvertime) || 0,
            isHoldOvertime: Number(item.isHoldOvertime) || 0,
          }))
        
        const uniqueTables = convertedData.filter((item, index, self) =>
          index === self.findIndex(t => t.id === item.id)
        );

        // 🛡️ SYNC SHIELD: Merge incoming API data with store data if a local update is recent
        const currentStore = useTableStatusStore.getState();
        const now = Date.now();
        
        const mergedTables = uniqueTables.map(t => {
          const section = getSectionFromDiningSection(t.DiningSection);
          const key = `${section}_${t.label}`;
          const lastEdit = currentStore.lastLocalUpdate[key] || 0;

          if (now - lastEdit < 3000) {
            const storeTable = currentStore.tables.find(st => st.tableId === t.id);
            if (storeTable && storeTable.status !== 'EMPTY') {
              const statusMap: Record<string, number> = {
                'EMPTY': 0, 'SENT': 1, 'BILL_REQUESTED': 2, 'HOLD': 3, 'OVERTIME': 4, 'LOCKED': 5
              };
              return {
                ...t,
                Status: statusMap[storeTable.status as string] ?? 1,
                totalAmount: storeTable.totalAmount || t.totalAmount,
                StartTime: storeTable.startTime || t.StartTime
              };
            }
          }
          return t;
        });

        setAllTables(mergedTables);

        // 🚀 BATCH SYNC to global store (MUCH FASTER)
        const updates = uniqueTables.map(t => {
          let finalStartTime = 0;
          if (t.StartTime) {
            const parsed = new Date(t.StartTime).getTime();
            if (!isNaN(parsed)) finalStartTime = parsed;
          }

          return {
            tableId: t.id,
            section: getSectionFromDiningSection(t.DiningSection),
            tableNo: t.label,
            orderId: (t as any).currentOrderId || "EMPTY",
            status: (t.Status === 5 ? "LOCKED" : 
                    t.Status === 1 ? "SENT" : 
                    t.Status === 2 ? "BILL_REQUESTED" : 
                    t.Status === 3 ? "HOLD" : "EMPTY") as TableStatusType,
            startTime: finalStartTime,
            lockedByName: t.lockedByName,
            totalAmount: t.totalAmount,
            isHoldOvertime: t.isHoldOvertime === 1 || !!t.isHoldOvertime
          };
        });

        useTableStatusStore.getState().batchUpdateTableStatus(updates);
      } else {
        throw new Error("No tables returned from API");
      }
    } catch (error) {
      Alert.alert(
        "Connection Error",
        `Failed to connect to server at ${API_URL}\n\nPlease ensure the backend server is running.`,
        [{ text: "OK" }],
      );
      setAllTables([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmUnlock = (tableId: string, tableLabel: string) => {
    Alert.alert(
      "Unlock Table",
      `Are you sure you want to unlock Table ${tableLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock Now",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_URL}/api/tables/unlock-persistent`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tableId, userId: user?.userId }),
                },
              );
              const data = await res.json();
              if (res.ok && data.success) {
                fetchLockedTables();
                Alert.alert("Success", `Table ${tableLabel} unlocked.`);
              } else {
                Alert.alert("Error", data.error || "Failed to unlock");
              }
            } catch (err) {
              Alert.alert("Error", "Network error while unlocking");
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (urlSection && SECTIONS.includes(urlSection)) {
      setActiveTab(urlSection);
    }
  }, [urlSection]);



  useEffect(() => {
    const index = SECTIONS.indexOf(activeTab);
    if (index !== -1 && sectionScrollRef.current) {
      sectionScrollRef.current.scrollTo({ x: index * 120, animated: true });
    }
  }, [activeTab]);



  // 🚀 PERFORMANCE FIX: Removed direct dependency on 'tables' array to prevent full screen re-renders.
  // Individual TableItemComponents now subscribe to their own status.

  const currentTables = useMemo(() => {
    return allTables.filter((table: TableItem) => {
      if (activeTab === "TAKEAWAY") return table.DiningSection === 4;
      else if (activeTab === "SECTION_1") return table.DiningSection === 1;
      else if (activeTab === "SECTION_2") return table.DiningSection === 2;
      else if (activeTab === "SECTION_3") return table.DiningSection === 3;
      return false;
    });
  }, [allTables, activeTab]);

  // 🚀 Optimized Occupied Count: Only re-renders when the count changes
  const occupiedCount = useTableStatusStore(state => 
    Object.values(state.tableMap).filter(t => t.status !== 'EMPTY' && t.status !== 0).length
  );

  // ———— STATUS HANDLERS (OPTIMISTIC) ————
  const updateTableStatus = async (
    tableId: string,
    status: number,
    lockedByName?: string,
    totalAmount?: number,
  ): Promise<boolean> => {
    // 1. Optimistic UI update
    const previousTables = [...allTables];
    setAllTables((prev: TableItem[]) =>
      prev.map((t: TableItem) =>
        t.id === tableId ? { ...t, Status: status } : t,
      ),
    );

    // Update global store
    const table = allTables.find((t: TableItem) => t.id === tableId);
    if (table) {
      const statusStrMap: Record<number, TableStatusType> = {
        0: "EMPTY",
        1: "SENT",
        2: "BILL_REQUESTED",
        3: "HOLD",
        4: "SENT", // Overtime is technically still an active order (SENT)
        5: "LOCKED",
      };

      useTableStatusStore.getState().updateTableStatus(
        tableId,
        getSectionFromDiningSection(table.DiningSection),
        table.label,
        "SYNC", // Generic orderId
        statusStrMap[status],
        undefined,
        lockedByName,
        totalAmount,
      );
    }

    try {
      const res = await fetch(`${API_URL}/api/tables/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, status, lockedByName, userId: user?.userId }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      // Successfully updated backend
      fetchTables(); // 🔥 refresh after update
      if (status === 4) fetchLockedTables();
      return true;
    } catch (err) {
      console.error("Status update failed:", err);
      Alert.alert(
        "Sync Error",
        "Could not sync status with server. Reverting UI.",
      );
      setAllTables(previousTables);
      return false;
    }
  };

  const getSectionFromDiningSection = (ds: number) => {
    if (ds === 1) return "SECTION_1";
    if (ds === 2) return "SECTION_2";
    if (ds === 3) return "SECTION_3";
    return "TAKEAWAY";
  };

  const handleDining = (id: string) => updateTableStatus(id, 1); // Dining
  const handleCheckout = async (id: string) => {
    if (isCheckingOut) return;

    const tableStatus = useTableStatusStore.getState().tableMap[id];
    const effectiveStatus = tableStatus ? (tableStatus.status === 'SENT' ? 1 : tableStatus.status === 'BILL_REQUESTED' ? 2 : 1) : 0;
    
    if (effectiveStatus === 0) return;

    setIsCheckingOut(true);
    try {
      const res = await useCartStore.getState().checkoutOrder(id);
      if (res && res.success) {
        fetchTables();
        const targetTable = allTables.find(t => t.id === id);
        if (targetTable) {
          const section = getSectionFromDiningSection(targetTable.DiningSection);
          setOrderContext({ orderType: "DINE_IN", section: section, tableNo: targetTable.label, tableId: id });
          router.push("/summary");
        }
      }
    } catch (err) {
      console.error("Checkout flow error:", err);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCompleteOrder = async (id: string) => {
    if (isCompleting) return;

    const tableData = useTableStatusStore.getState().tableMap[id];
    const effectiveStatus = (tableData && tableData.status !== 'EMPTY') 
      ? (tableData.status === 'SENT' ? 1 : tableData.status === 'BILL_REQUESTED' ? 2 : tableData.status === 'HOLD' ? 3 : tableData.status === 'LOCKED' ? 5 : 1)
      : 0;

    if (effectiveStatus !== 2) return;

    setIsCompleting(true);
    try {
      const res = await (useCartStore.getState() as any).completeOrder(id);
      if (res && res.success) {
        fetchTables();
        useActiveOrdersStore.getState().fetchActiveKitchenOrders();
        showToast({ type: "success", message: "Completed", subtitle: "Table is now available." });
      }
    } catch (err) {
      console.error("Complete flow error:", err);
    } finally {
      setIsCompleting(false);
    }
  };


  const handleHold = (id: string) => updateTableStatus(id, 3); // Hold
  const handleReserved = (id: string, name: string) =>
    updateTableStatus(id, 5, name); // Reserved (Use 5 for red locked/reserved state)
  const handleComplete = (id: string) => updateTableStatus(id, 0); // Available

  const handleTablePress = React.useCallback(
    async (item: TableItem, tableData: any, isCheckoutAction?: boolean) => {
      const effectiveStatus = (tableData && tableData.status !== 'EMPTY') 
        ? (tableData.status === 'SENT' ? 1 : tableData.status === 'BILL_REQUESTED' ? 2 : tableData.status === 'HOLD' ? 3 : tableData.status === 'LOCKED' ? 5 : 1)
        : Number(item.Status);

      if (isCheckoutAction) {
        if (effectiveStatus !== 2) {
          handleCheckout(item.id);
          return;
        }
        // For status 2 (Checkout), clicking "PAY" now follows the regular cart flow
      }

      const status = effectiveStatus;

      if (status === 1 || status === 2 || status === 3 || status === 4) {
        // For occupied tables, set context and go to summary/menu
        const section = getSectionFromDiningSection(item.DiningSection);
        const existingContext: OrderContext = {
          orderType: "DINE_IN",
          section: section,
          tableNo: item.label,
          tableId: item.id,
        };
        setOrderContext(existingContext);
        const contextId = getContextId(existingContext);
        if (contextId) {
          setCurrentContext(contextId);
        }
        try {
          await fetchCartFromDBGlobal(item.id);
        } catch (err) {
          console.error(
            "❌ [Category] Failed to fetch occupied table cart:",
            err,
          );
        }

        router.push("/menu/thai_kitchen");
        return;
      }

      if (status === 5) {
        Alert.alert(
          "Table Locked",
          `Table ${item.label} is reserved. What would you like to do?`,
          [
            {
              text: "Unlock Table",
              style: "destructive",
              onPress: () => handleComplete(item.id),
            },
            {
              text: "Go to Lock Tables",
              onPress: () => router.push("/locked-tables"),
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      let newContext: any;
      if (activeTab !== "TAKEAWAY") {
        newContext = {
          orderType: "DINE_IN" as const,
          section: activeTab,
          tableNo: item.label,
          tableId: item.id,
        };
      } else {
        newContext = { 
          orderType: "TAKEAWAY" as const, 
          takeawayNo: item.label,
          tableId: item.id 
        };
      }

      setOrderContext(newContext);
      const contextId = getContextId(newContext);
      if (contextId) {
        setCurrentContext(contextId);
        // 🚀 BUG FIX: If table is empty, clear local cart immediately to prevent "popping" stale data
        if (status === 0) {
          setCartItemsGlobal(contextId, [], true); // skipSync=true to avoid double sync
        }
      }

      if (newContext.tableId) {
        try {
          await fetchCartFromDBGlobal(newContext.tableId);
        } catch (err) {
          console.error("❌ [Category] Failed to fetch shared cart:", err);
        }
      } else if (tableData && tableData.status === "HOLD") {
        const helds = getHeldOrders();
        const held = helds.find((h: any) => h.orderId === tableData.orderId);
        if (held && contextId) {
          setCartItemsGlobal(contextId, held.cart);
        }
      }

      router.push("/menu/thai_kitchen");
    },
    [activeTab, router, isWaiter],
  );


  // 🚀 Memoized Render Function for Table Grid

  // 🚀 Memoized Render Function for Table Grid
  const renderItem = React.useCallback(
    ({ item }: { item: TableItem }) => {
      return (
        <TableItemComponent
          tableId={item.id}
          item={item}
          itemSize={itemSize}
          activeTab={activeTab}
          onPress={handleTablePress}
          numberFont={numberFont}
          smallFont={smallFont}
          isTabletPortrait={!isLandscape && isTablet}
        />
      );
    },
    [itemSize, activeTab, handleTablePress, numberFont, smallFont, width, height],
  );



  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
        {/* Placeholder Nav Bar */}
        <View style={styles.topNavContainer}>
          <Skeleton
            width={120}
            height={32}
            borderRadius={16}
            style={{ marginLeft: 20 }}
          />
          <View style={{ flex: 1 }} />
          <Skeleton
            width={40}
            height={40}
            borderRadius={20}
            style={{ marginRight: 20 }}
          />
        </View>
        <TableGridSkeleton
          itemSize={itemSize}
          columns={columns}
          gap={GAP}
          padding={PADDING}
          insets={insets}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />

      {/* 〰〰〰〰〰〰〰〰〰〰〰 TOP NAV BAR 〰〰〰〰〰〰〰〰〰〰〰 */}
      <View
        style={[
          styles.topNavContainer,
          { paddingHorizontal: isTablet ? 20 : 12 },
          !isTablet &&
            isLandscape && { height: 42, paddingVertical: 2, gap: 8 },
        ]}
      >
        {/* CENTER — Section Tabs */}
        <ScrollView
          ref={sectionScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
          style={styles.tabsScrollView}
        >
          <View style={[styles.tabsWrapper, { gap: isTablet ? 8 : 6 }]}>
            {SECTIONS.map((section) => {
              const isActive = activeTab === section;
              const sectionTables = allTables.filter((t: TableItem) => {
                if (section === "TAKEAWAY") return t.DiningSection === 4;
                if (section === "SECTION_1") return t.DiningSection === 1;
                if (section === "SECTION_2") return t.DiningSection === 2;
                if (section === "SECTION_3") return t.DiningSection === 3;
                return false;
              });
              const occupied = sectionTables.filter(
                (t: TableItem) => t.Status !== 0,
              ).length;

              return (
                <TouchableOpacity
                  key={section}
                  onPress={() => setActiveTab(section)}
                  activeOpacity={0.75}
                  style={[
                    styles.tabBtn,
                    isActive && styles.activeTabBtn,
                    !isTablet &&
                      isLandscape && {
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                      },
                  ]}
                >
                  <Ionicons
                    name={SECTION_ICONS[section] as any}
                    size={14}
                    color={isActive ? "#fff" : Theme.textSecondary}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      isActive && styles.activeTabText,
                      { fontSize: isTablet ? 16 : 13 },
                    ]}
                  >
                    {!isTablet && !isLandscape
                      ? formatSectionGlobal(SECTION_LABELS[section]).replace(
                          "Section ",
                          "Sec-",
                        )
                      : formatSectionGlobal(SECTION_LABELS[section])}
                  </Text>
                  {occupied > 0 && (
                    <View
                      style={[
                        styles.tabBadge,
                        isActive && styles.activeTabBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabBadgeText,
                          isActive && styles.activeTabBadgeText,
                        ]}
                      >
                        {occupied}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* RIGHT — Action Buttons */}
        <View style={[styles.navRightGroup, { gap: isTablet ? 8 : 6 }]}>
          {/* Kitchen Status — moved from menu */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => router.push("/kitchen-status")}
            activeOpacity={0.75}
          >
            <Ionicons
              name="restaurant-outline"
              size={20}
              color={Theme.success}
            />
            {isTablet && isLandscape && (
              <Text
                style={[styles.headerActionText, { color: Theme.success }]}
              >
                Status
              </Text>
            )}
          </TouchableOpacity>

          {/* KDS — gated by OPRSTK */}
          {canAccessKDS() && (
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push("/kds")}
              activeOpacity={0.75}
            >
              <Ionicons name="tv-outline" size={20} color={Theme.info} />
              {isTablet && isLandscape && (
                <Text style={[styles.headerActionText, { color: Theme.info }]}>
                  KDS
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* NEW CONSOLIDATED MENU BUTTON */}
          <TouchableOpacity
            style={[
              styles.headerActionBtn,
              {
                backgroundColor: Theme.primaryLight,
                borderColor: Theme.primaryBorder,
              },
            ]}
            onPress={() => setIsMenuVisible(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="menu-outline" size={24} color={Theme.primary} />
            {isTablet && (
              <Text style={[styles.headerActionText, { color: Theme.primary }]}>
                Menu
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 〰〰〰〰〰〰〰〰〰〰〰 MORE MENU MODAL 〰〰〰〰〰〰〰〰〰〰〰 */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setIsMenuVisible(false)}
        >
          <View
            style={[
              styles.menuContent,
              isTablet && { width: 300, right: 20 },
              { maxHeight: height * 0.8 },
            ]}
          >
            {/* User Info Header */}
            {user && (
              <View style={styles.menuUserSection}>
                <View style={styles.menuAvatar}>
                  <Ionicons name="person" size={20} color={Theme.primary} />
                </View>
                <View>
                  <Text style={styles.menuUserName}>{user.fullName}</Text>
                  <Text style={styles.menuUserRole}>{user.roleName}</Text>
                </View>
              </View>
            )}

            <View style={styles.menuDivider} />

            {/* Menu Options */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setIsMenuVisible(false);
                  router.push("/waiters");
                }}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.primary + "10" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="account-group"
                    size={18}
                    color={Theme.primary}
                  />
                </View>
                <Text style={styles.menuItemText}>Waiters</Text>
              </TouchableOpacity>

              {canAccessTimeEntry() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/TimeEntry");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.primary + "10" },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={Theme.primary}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Time Entry</Text>
                </TouchableOpacity>
              )}

              {canAccessMembers() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/members");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.info + "10" },
                    ]}
                  >
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color={Theme.info}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Members</Text>
                </TouchableOpacity>
              )}

              {canAccessSalesReport() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/sales-report");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.primary + "10" },
                    ]}
                  >
                    <Ionicons
                      name="bar-chart-outline"
                      size={18}
                      color={Theme.primary}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Sales Report</Text>
                </TouchableOpacity>
              )}

              {canAccessDayEnd() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/day-end");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.warning + "10" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-clock"
                      size={18}
                      color={Theme.warning}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Day End</Text>
                </TouchableOpacity>
              )}

              {canAccessStoreSettings() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    setIsSettingsVisible(true);
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.textSecondary + "10" },
                    ]}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={18}
                      color={Theme.textSecondary}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Store Settings</Text>
                </TouchableOpacity>
              )}

              {canAccessReceiptSettings() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/company-settings" as any);
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.primary + "10" },
                    ]}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={18}
                      color={Theme.primary}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Receipt Settings</Text>
                </TouchableOpacity>
              )}

              {canAccessLockTables() && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/locked-tables");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.warning + "10" },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={Theme.warning}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Locked Tables</Text>
                </TouchableOpacity>
              )}

              {/* Legend in Menu for Mobile */}
              {!isTablet && (
                <>
                  <View style={styles.menuDivider} />
                  <View style={{ padding: 12 }}>
                    <Text
                      style={[
                        styles.menuUserRole,
                        { marginBottom: 10, color: Theme.textPrimary },
                      ]}
                    >
                      Table Legend
                    </Text>
                    <View style={{ gap: 8 }}>
                      {[
                        { color: "#22c55e", label: "Dining" },
                        { color: "#3b82f6", label: "Hold" },
                        { color: "#f59e0b", label: "Checkout" },
                        { color: "#ef4444", label: "Reserved" },
                        { color: "#8b5cf6", label: "Overtime" },
                      ].map((item) => (
                        <View key={item.label} style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              {
                                backgroundColor: item.color,
                                width: 10,
                                height: 10,
                              },
                            ]}
                          />
                          <Text style={[styles.legendText, { fontSize: 12 }]}>
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={[styles.menuItem, styles.logoutMenuItem]}
                onPress={() => {
                  setIsMenuVisible(false);
                  logout();
                  router.replace("/login");
                }}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.danger + "10" },
                  ]}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={18}
                    color={Theme.danger}
                  />
                </View>
                <Text style={[styles.menuItemText, { color: Theme.danger }]}>
                  Logout
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 〰〰 Section Header Row (Hidden on Mobile Landscape) 〰〰 */}
      {(!isLandscape || isTablet) && (
        <View
          style={[
            styles.sectionHeader,
            !isTablet &&
              isLandscape && { paddingVertical: 4, paddingHorizontal: 14 },
          ]}
        >
          <View style={styles.sectionHeaderLeft}>
            <View
              style={[
                styles.sectionAccentBar,
                !isTablet && isLandscape && { height: 14 },
              ]}
            />
            <Text
              style={[
                styles.sectionHeaderTitle,
                !isTablet && isLandscape && { fontSize: 13 },
              ]}
            >
              {SECTION_LABELS[activeTab]}
            </Text>
            <View
              style={[
                styles.sectionCountBadge,
                !isTablet && isLandscape && { paddingVertical: 1 },
              ]}
            >
              <Text style={styles.sectionCountText}>
                {currentTables.length} tables
              </Text>
            </View>
            {occupiedCount > 0 && (
              <View
                style={[
                  styles.occupiedBadge,
                  !isTablet && isLandscape && { paddingVertical: 1 },
                ]}
              >
                <View style={styles.occupiedDot} />
                <Text style={styles.occupiedText}>
                  {occupiedCount} occupied
                </Text>
              </View>
            )}
          </View>

          {/* Legend - Only show on tablets directly on screen */}
          {isTablet && (
            <View style={styles.legend}>
              {[
                { color: "#22c55e", label: "Dining" },
                { color: "#3b82f6", label: "Hold" },
                { color: "#f59e0b", label: "Checkout" },
                { color: "#ef4444", label: "Reserved" },
                { color: "#8b5cf6", label: "Overtime" },
              ].map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â• TABLE GRID â•â•â•â•â•â•â•â•â•â•â• */}
      <FlatList
        data={currentTables}
        key={columns}
        numColumns={columns}
        keyExtractor={(item: TableItem) => item.id}
        renderItem={renderItem}
        columnWrapperStyle={{ gap: GAP }}
        getItemLayout={(data, index) => ({
          length: itemSize + GAP,
          offset: (itemSize + GAP) * Math.floor(index / columns),
          index,
        })}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={isTablet ? 20 : 10}
        windowSize={3}
        initialNumToRender={isTablet ? 30 : 15}
        contentContainerStyle={{
          gap: GAP,
          paddingHorizontal: PADDING,
          paddingBottom: 50,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="grid-outline" size={48} color={Theme.border} />
            <Text style={styles.emptyText}>No tables found</Text>
            <TouchableOpacity onPress={fetchTables} style={styles.retryBtn}>
              <Ionicons
                name="refresh-outline"
                size={16}
                color={Theme.primary}
              />
              <Text style={styles.retryText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <StoreSettingsModal
        visible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },

  /* â”€â”€ Loading â”€â”€ */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMain,
  },
  loadingText: {
    color: Theme.textSecondary,
    marginTop: 12,
    fontFamily: Fonts.medium,
    fontSize: 15,
  },

  /* â”€â”€ Top Nav â”€â”€ */
  topNavContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: Theme.bgNav,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 12,
    ...Theme.shadowSm,
  },

  /* Tabs */
  tabsScrollView: { flex: 1 },
  tabsScrollContent: { alignItems: "center", paddingHorizontal: 4 },
  tabsWrapper: { flexDirection: "row", alignItems: "center" },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Theme.radiusFull,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeTabBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  tabText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.2,
  },
  activeTabText: { color: "#fff", fontFamily: Fonts.extraBold },

  tabBadge: {
    marginLeft: 6,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  activeTabBadge: { backgroundColor: "rgba(255,255,255,0.3)" },
  tabBadgeText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  activeTabBadgeText: { color: "#fff" },

  /* Right Action Buttons */
  navRightGroup: { flexDirection: "row", alignItems: "center" },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: Theme.radiusMd,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  salesBtn: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primaryBorder,
  },
  logoutBtn: {
    backgroundColor: Theme.dangerBg,
    borderColor: Theme.dangerBorder,
  },
  headerActionText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.extraBold,
    fontSize: 14,
  },

  /* â”€â”€ Section Header Row â”€â”€ */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Theme.bgMain,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  sectionHeaderTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.extraBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  sectionCountBadge: {
    backgroundColor: Theme.bgMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  sectionCountText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
  },
  occupiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Theme.successBorder,
  },
  occupiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.success,
  },
  occupiedText: { color: "#15803D", fontFamily: Fonts.semiBold, fontSize: 11 },

  /* Legend */
  legend: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    color: Theme.textMuted,
    fontSize: 10,
    fontFamily: Fonts.medium,
  },

  /* â”€â”€ Table Card â”€â”€ */
  tableBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
    ...Theme.shadowSm,
  },
  tableContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  tableNumber: {
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginTop: 4,
    marginBottom: 2,
  },
  tableInfo: { alignItems: "center", gap: 2 },
  statusChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 1,
  },
  statusChipText: { fontFamily: Fonts.bold, letterSpacing: 0.3 },
  tableStats: { alignItems: "center", gap: 1 },
  timeText: { color: Theme.textSecondary, fontFamily: Fonts.medium },
  orderText: { color: Theme.textMuted, fontFamily: Fonts.regular },
  billText: { fontFamily: Fonts.black },
  lockedOverlay: { alignItems: "center", gap: 3, marginTop: 4 },
  lockedNameText: {
    color: "#B91C1C",
    fontFamily: Fonts.bold,
    marginTop: 1,
    textAlign: "center",
  },

  /* â”€â”€ Empty State â”€â”€ */
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 50,
    gap: 12,
  },
  emptyText: {
    color: Theme.textSecondary,
    fontSize: 16,
    marginBottom: 4,
    fontFamily: Fonts.medium,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  retryText: { color: Theme.primary, fontFamily: Fonts.bold, fontSize: 14 },

  /* â”€â”€ User Chip â”€â”€ */
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.primaryLight,
    borderRadius: Theme.radiusMd,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 2,
  },
  userChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  userChipName: {
    color: Theme.primary,
    fontFamily: Fonts.bold,
    fontSize: 12,
    maxWidth: 100,
  },
  userChipRole: {
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  /* â”€â”€ More Menu Modal â”€â”€ */
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 20,
  },
  menuContent: {
    width: 260,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 10,
    ...Theme.shadowLg,
  },
  menuUserSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  menuUserName: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  menuUserRole: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  menuDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  logoutMenuItem: {
    marginTop: 4,
  },
  inlineCheckoutBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "#fd7e14",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    ...Theme.shadowSm,
  },
  inlineCheckoutText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  holdOvertimeBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    padding: 2,
    zIndex: 10,
    ...Theme.shadowSm,
  },
});
