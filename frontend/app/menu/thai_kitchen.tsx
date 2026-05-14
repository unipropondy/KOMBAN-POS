import { API_URL } from "@/constants/Config";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CartSidebar from "../../components/CartSidebar";
import { Skeleton } from "../../components/ui/Skeleton";
import { Fonts } from "../../constants/Fonts";
import { Theme } from "../../constants/theme";
import { useToast } from "../../components/Toast";
import UniversalPrinter from "../../components/UniversalPrinter";
import { useActiveOrdersStore } from "../../stores/activeOrdersStore";
import { useAuthStore } from "../../stores/authStore";
import {
  addToCartGlobal,
  getContextId,
  setCurrentContext,
  setCartItemsGlobal,
  useCartStore,
} from "../../stores/cartStore";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { useMenuStore } from "../../stores/menuStore";
import { usePaymentSettingsStore } from "../../stores/paymentSettingsStore";

const EMPTY_ARRAY: any[] = [];

const IMAGE_BASE_URL = `${API_URL}/api/menu/image/`;

// --- COMPONENTS ---

const NavRail = () => {
  const router = useRouter();
  const navItems = [
    { id: "home", icon: "home-outline", label: "Home", active: true },
  ];

  return (
    <View style={styles.rail}>
      <View style={styles.railTop}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.railItem, item.active && styles.railItemActive]}
            onPress={() => {
              if (item.id === "home") router.replace("/(tabs)/category");
            }}
          >
            <Ionicons
              name={item.icon as any}
              size={22}
              color={item.active ? Theme.primary : Theme.textSecondary}
            />
            <Text
              style={[styles.railLabel, item.active && styles.railLabelActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.railBottom}>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => router.replace("/login")}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color={Theme.textSecondary}
          />
          <Text style={styles.railLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DishCard = React.memo(
  ({ dish, width, cartQty, onPress, isPhone, isTablet, isLandscape }: any) => {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
      if (cartQty > 0) {
        // Pop animation
        Animated.sequence([
          Animated.spring(scaleAnim, {
            toValue: 1.2,
            useNativeDriver: true,
            speed: 50,
            bounciness: 10,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
          }),
        ]).start();
      }
    }, [cartQty]);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { width, padding: isPhone ? 8 : isTablet ? 12 : 10 },
          isLandscape && !isTablet && { maxHeight: 135 },
        ]}
        onPress={() => onPress(dish)}
        activeOpacity={0.7}
      >
        {cartQty > 0 && (
          <Animated.View
            style={[
              styles.qtyBadge,
              { transform: [{ scale: scaleAnim }] },
              isPhone
                ? { width: 22, height: 22, borderRadius: 11 }
                : isTablet
                  ? { width: 32, height: 32, borderRadius: 16 }
                  : null,
            ]}
          >
            <Text
              style={[
                styles.qtyBadgeText,
                isPhone ? { fontSize: 11 } : isTablet ? { fontSize: 15 } : null,
              ]}
            >
              {cartQty}
            </Text>
          </Animated.View>
        )}
        <View
          style={[
            styles.dishImageWrap,
            isPhone
              ? { width: 48, height: 48, marginBottom: 4 }
              : isTablet
                ? {
                    width: 75,
                    height: 75,
                    marginBottom: 6,
                    borderRadius: 37.5,
                  }
                : null,
          ]}
        >
          {dish.Image ? (
            <Image
              source={{ uri: `${IMAGE_BASE_URL}${dish.Image}` }}
              style={styles.dishImg}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.dishImg,
                {
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: Theme.bgMuted,
                },
              ]}
            >
              <Ionicons
                name="restaurant-outline"
                size={isPhone ? (isLandscape ? 16 : 24) : isTablet ? 48 : 40}
                color={Theme.textMuted}
              />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.dishName,
            isPhone
              ? { fontSize: 11, minHeight: 42, lineHeight: 14 }
              : isTablet
                ? { fontSize: 13, minHeight: 48, lineHeight: 16 }
                : null,
          ]}
          numberOfLines={3}
        >
          {dish.Name}
        </Text>
        <Text
          style={[
            styles.dishPrice,
            isPhone ? { fontSize: 12 } : isTablet ? { fontSize: 14 } : null,
          ]}
        >
          ${(dish.Price || 0).toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  },
);

// 🚀 PERFORMANCE OPTIMIZATION: Surgical Quantity Updates
// This wrapper ensures only the SPECIFIC dish card being updated re-renders.
const DishCardWrapper = React.memo(({ item, width, isPhone, isTablet, isLandscape, onPress }: any) => {
  const currentContextId = useCartStore(state => state.currentContextId);
  const dishId = item.DishId || item.id;
  
  // ⚡ SURGICAL SUBSCRIPTION: Only re-render if the quantity of THIS specific product changes
  const cartQty = useCartStore(state => {
    if (!currentContextId) return 0;
    const cart = state.carts[currentContextId] || [];
    let total = 0;
    for (let i = 0; i < cart.length; i++) {
      if (cart[i].id === dishId) total += cart[i].qty;
    }
    
    if (total > 0) {
      console.log(`[TRACE] [${Date.now()}] [MENU_BADGE_UPDATE] Product: ${item.Name || item.name} | Qty: ${total}`);
    }
    return total;
  }, (prev, next) => prev === next);

  return (
    <DishCard
      dish={item}
      width={width}
      cartQty={cartQty}
      onPress={onPress}
      isPhone={isPhone}
      isTablet={isTablet}
      isLandscape={isLandscape}
    />
  );
});

const DishGridSkeleton = ({ cardWidth, columns, gap, isPhone }: any) => {
  const items = Array.from({ length: columns * 4 });
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: gap,
        paddingBottom: 80,
      }}
    >
      {items.map((_, i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              width: cardWidth,
              padding: isPhone ? 8 : 12,
              borderStyle: "dashed",
            },
          ]}
        >
          <Skeleton
            circle
            width={isPhone ? 48 : 75}
            height={isPhone ? 48 : 75}
            style={{ marginBottom: 8 }}
          />
          <Skeleton width="80%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={14} />
        </View>
      ))}
    </View>
  );
};

const CategorySkeleton = () => (
  <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
    {[1, 2, 3, 4].map((i) => (
      <Skeleton key={i} width={100} height={36} borderRadius={12} />
    ))}
  </View>
);

const GroupSkeleton = () => (
  <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Skeleton key={i} width={80} height={38} borderRadius={full} />
    ))}
  </View>
);

// --- SCREEN ---

export default function MenuScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { kitchens, fetchMenu, fetchGroups, fetchDishes, allDishes, isLoading: menuLoading, modifierCache } = useMenuStore();

  const [groups, setGroups] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [isLoadingDishes, setIsLoadingDishes] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [selectedKitchenId, setSelectedKitchenId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Modifier Modal State
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [showModifier, setShowModifier] = useState(false);
  const [selectedDish, setSelectedDish] = useState<any | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [loadingModifiers, setLoadingModifiers] = useState(false);

  // Custom Item Submodal (Screenshot Flow)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customMods, setCustomMods] = useState<any[]>([]);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(
    null,
  );
  const [showReprintOptions, setShowReprintOptions] = useState(false);
  const { showToast } = useToast();
  const user = useAuthStore((s: any) => s.user);
  const paymentSettings = usePaymentSettingsStore((s: any) => s.settings);

  const orderContext = useOrderContextStore((state) => state.currentOrder);
  
  // 🟢 OPTIMIZED SELECTORS: Only re-render when SPECIFIC data changes
  const currentContextId = useCartStore((state) => state.currentContextId);
  const cart = useCartStore((state) => (currentContextId ? state.carts[currentContextId] : undefined) || EMPTY_ARRAY);
  const discountInfo = useCartStore((state) => (currentContextId ? state.discounts[currentContextId] : undefined) || { applied: false, type: "fixed" as const, value: 0 });
  const displayOrderId = useCartStore((state) => (orderContext?.tableId ? state.tableOrderIds[orderContext.tableId] : undefined) || null);

  const activeOrders = useActiveOrdersStore((state) => state.activeOrders);

  // 🟢 QUANTITY TRACKING: Handled surgically within DishCardWrapper to avoid O(N^2) re-renders

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

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isPhone = !isTablet;
  const isLarge = true; // Always show cart sidebar

  const isFetchingCart = React.useRef(false);

  const cartItemsCount = useMemo(() => {
    return cart.length;
  }, [cart]);

  const insets = useSafeAreaInsets();
  const usableWidth = width - insets.left - insets.right;

  const subtotal = useMemo(() => {
    return cart.reduce((sum: number, item: any) => {
      if (item.status === "VOIDED") return sum;
      return sum + (item.price || 0) * item.qty;
    }, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (!discountInfo?.applied) return 0;
    if (discountInfo.type === "percentage")
      return (subtotal * discountInfo.value) / 100;
    return discountInfo.value;
  }, [discountInfo, subtotal]);

  const gstRate = (paymentSettings.gstPercentage || 0) / 100;
  const gstAmount = subtotal * gstRate;
  const grandTotal = subtotal - discountAmount + gstAmount;

  const handleReprintKOT = async () => {
    if (!cart.length) {
      showToast({ type: "error", message: "Cart is empty" });
      return;
    }

    try {
      const kitchenGroups: Record<string, any[]> = {};
      cart
        .filter((i: any) => i.status !== "VOIDED")
        .forEach((item: any) => {
          const kCode = item.KitchenTypeCode || "0";
          if (!kitchenGroups[kCode]) kitchenGroups[kCode] = [];
          kitchenGroups[kCode].push(item);
        });

      for (const [kCode, items] of Object.entries(kitchenGroups)) {
        const kName = items[0].KitchenTypeName || (kCode === "0" ? "KITCHEN" : kCode);
        const printerIp = items[0].PrinterIP;
        const kotData = {
          orderId: displayOrderId,
          orderNo: displayOrderId,
          tableNo: orderContext?.orderType === "DINE_IN" ? orderContext.tableNo : `TW-${orderContext?.takeawayNo}`,
          deviceNo: "1",
          waiterName: orderContext?.serverName || "Staff",
          items: items,
          kitchenName: kName,
        };
        await UniversalPrinter.printKOT(kotData, "SYSTEM", "REPRINT", printerIp);
      }

      showToast({ type: "success", message: "KOT Reprinted", subtitle: "Tickets sent to kitchen" });
      setShowReprintOptions(false);
    } catch (err) {
      console.error("Reprint KOT error:", err);
      showToast({ type: "error", message: "Reprint Failed" });
    }
  };

  const handleReprintBill = async () => {
    if (!cart.length) {
      showToast({ type: "error", message: "Cart is empty" });
      return;
    }
    try {
      const saleData = {
        items: cart,
        total: grandTotal,
        subtotal: subtotal,
        discount: discountInfo,
        orderId: displayOrderId,
        tableNo: orderContext?.tableNo,
        waiterName: orderContext?.serverName,
        date: new Date(),
        isCheckout: true,
      };

      await UniversalPrinter.printCheckoutBill(saleData, user?.userId || "SYSTEM", {
        ...discountInfo,
        amount: discountAmount
      });

      showToast({ type: "success", message: "Bill Printing", subtitle: "Receipt sent to printer" });
      setShowReprintOptions(false);
    } catch (err) {
      console.error("Print Bill error:", err);
      showToast({ type: "error", message: "Printing Failed" });
    }
  };

  // Sidebar width should be more responsive
  const cartWidth = isTablet
    ? width > 1024
      ? 380
      : 330
    : isLandscape
      ? usableWidth * 0.38
      : width * 0.62;

  const mainWidth =
    (isLandscape && !isTablet ? usableWidth : width) - cartWidth;

  const columns = isTablet
    ? isLandscape
      ? width > 1200
        ? 5
        : 3
      : 2
    : isLandscape
      ? 2
      : 1; // Back to 2 columns as requested

  const gap = isPhone ? (isLandscape ? 12 : 8) : 12;
  // Increase internal padding subtraction (24 -> 32) to ensure cards don't touch edges or sidebar
  const cardWidth = Math.floor(
    (mainWidth - (isPhone ? 32 : 40) - gap * (columns - 1)) / columns,
  );

  const renderTopBar = () => (
    <View
      style={[
        styles.topBar,
        isPhone && isLandscape && { marginBottom: 6, height: 40 },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.replace("/(tabs)/category")}
        style={[
          styles.backBtn,
          isPhone && isLandscape && { width: 36, height: 36, borderRadius: 8 },
        ]}
      >
        <Ionicons
          name="arrow-back"
          size={isPhone && isLandscape ? 20 : 24}
          color={Theme.textPrimary}
        />
      </TouchableOpacity>
      <View
        style={[
          styles.searchWrap,
          isPhone && isLandscape && { height: 36, flex: 0.8 },
        ]}
      >
        <Ionicons
          name="search"
          size={isPhone && isLandscape ? 16 : 20}
          color={Theme.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={[
            styles.searchInput,
            isPhone && isLandscape && { fontSize: 13 },
          ]}
          placeholder="Search products....."
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={16} color={Theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerRightActions}>
        <TouchableOpacity
          style={[
            styles.headerBillBtn,
            isPhone && isLandscape && { width: 36, height: 36, borderRadius: 8 },
          ]}
          onPress={() => setShowReprintOptions(true)}
        >
          <Ionicons
            name="receipt-outline"
            size={isPhone && isLandscape ? 20 : 24}
            color={Theme.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.headerCartBtn,
            isPhone && isLandscape && { width: 36, height: 36, borderRadius: 8 },
          ]}
          onPress={() => router.push("/cart")}
        >
          <Ionicons
            name="cart-outline"
            size={isPhone && isLandscape ? 20 : 24}
            color={Theme.primary}
          />
          {cartItemsCount > 0 && (
            <View
              style={[
                styles.cartBadge,
                isPhone &&
                  isLandscape && { top: -4, right: -4, minWidth: 16, height: 16 },
              ]}
            >
              <Text
                style={[
                  styles.cartBadgeText,
                  isPhone && isLandscape && { fontSize: 9 },
                ]}
              >
                {cartItemsCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.topActions}>
          {!isLarge && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: Theme.success }]}
              onPress={() => router.push("/cart")}
            >
              <Ionicons name="cart" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderCategoryNav = () => (
    <View
      style={[
        styles.categoryNavigation,
        isPhone && isLandscape && { marginBottom: 6 },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catScroll}
      >
        {kitchens.map((k: any) => (
          <TouchableOpacity
            key={k.CategoryId}
            style={[
              styles.catPill,
              selectedKitchenId === k.CategoryId && styles.catPillActive,
              isPhone && isLandscape && { height: 36, paddingHorizontal: 16 },
            ]}
            onPress={() => loadGroups(k.CategoryId)}
          >
            <Text
              style={[
                styles.catText,
                selectedKitchenId === k.CategoryId && styles.catTextActive,
                isPhone && isLandscape && { fontSize: 13 },
              ]}
            >
              {k.KitchenTypeName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View
        style={isPhone && isLandscape ? { marginTop: 12 } : { marginTop: 15 }}
      >
        {isInitialLoading ? (
          <GroupSkeleton />
        ) : groups.length === 0 ? (
          <View style={styles.emptyNavState}>
            <Text style={styles.emptyNavText}>No Dishgroup added</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupScroll}
          >
            {groups.map((g: any) => (
              <TouchableOpacity
                key={g.DishGroupId}
                style={[
                  styles.groupPill,
                  selectedGroup === g.DishGroupId && styles.groupPillActive,
                  isPhone &&
                    isLandscape && { height: 36, paddingHorizontal: 14 },
                ]}
                onPress={() => loadDishes(g.DishGroupId)}
              >
                <Text
                  style={[
                    styles.groupText,
                    selectedGroup === g.DishGroupId && styles.groupTextActive,
                    isPhone && isLandscape && { fontSize: 12 },
                  ]}
                >
                  {g.DishGroupName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const dismissKeyboard = () => Keyboard.dismiss();

  useEffect(() => {
    const newId = getContextId(orderContext);
    setCurrentContext(newId);
  }, [orderContext]);

  useEffect(() => {
    const initMenu = async () => {
      setIsInitialLoading(true);
      await fetchMenu();
      const currentKitchens = useMenuStore.getState().kitchens;
      if (currentKitchens.length > 0) {
        await loadGroups(currentKitchens[0].CategoryId);
      }
      setIsInitialLoading(false);
    };
    initMenu();
  }, []);

  const loadGroups = async (kitchenId: string) => {
    setSelectedKitchenId(kitchenId);
    const groupsData = await fetchGroups(kitchenId);
    setGroups(groupsData);
    if (groupsData.length > 0) {
      await loadDishes(groupsData[0].DishGroupId);
    }
  };

  const loadDishes = async (groupId: string) => {
    setSelectedGroup(groupId);
    setIsLoadingDishes(true);
    const dishesData = await fetchDishes(groupId);
    setItems(dishesData);
    setIsLoadingDishes(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const filteredItems = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return items;

    // Search across all dishes if query exists
    return allDishes.filter((d) => {
      const name = (d.Name || d.DishName || "").toLowerCase();
      const code = (d.DishCode || "").toLowerCase();
      const desc = (d.Description || "").toLowerCase();

      return (
        name.includes(query) || code.includes(query) || desc.includes(query)
      );
    });
  }, [debouncedSearch, items, allDishes]);

  const openModifiers = React.useCallback(
    async (dish: any) => {
      if (isAdding) return;
      
      const currentKitchen = kitchens.find((k) => k.CategoryId === selectedKitchenId);
      const currentKitchenName = currentKitchen?.KitchenTypeName || "KITCHEN";
      const currentKitchenCode = currentKitchen?.KitchenTypeCode || String(selectedKitchenId || "0");
      
      const addToCartSimple = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        addToCartGlobal({
          id: dish.DishId,
          name: dish.Name,
          price: dish.Price || 0,
          categoryName: currentKitchenName,
          KitchenTypeName: dish.KitchenTypeName || currentKitchenName,
          PrinterIP: dish.PrinterIP,
          KitchenTypeCode: dish.KitchenTypeCode || currentKitchenCode,
        });
      };

      // 🚀 SPEED BOOST: Instant add if we know there are no modifiers from GLOBAL cache
      const cachedData = modifierCache[dish.DishId];
      if (cachedData) {
        if (cachedData.length > 0) {
          setSelectedDish(dish);
          setSelectedModifierIds([]);
          setCustomMods([]);
          setModifiers(cachedData);
          setShowModifier(true);
        } else {
          addToCartSimple();
        }
        return;
      }

      // If not in cache, fallback to quick fetch (only happens if background pre-fetch failed)
      if (isAdding) return;
      setIsAdding(true);
      setLoadingModifiers(true);
      setSelectedDish(dish);
      setSelectedModifierIds([]);
      setCustomMods([]);
      
      try {
        const res = await fetch(`${API_URL}/api/menu/modifiers/${dish.DishId}`);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          setModifiers(data);
          setShowModifier(true);
        } else {
          addToCartSimple();
        }
      } catch (err) {
        console.error("Modifier Fetch Error:", err);
        addToCartSimple(); // Add anyway on error
      } finally {
        setIsAdding(false);
        setLoadingModifiers(false);
      }
    },
    [selectedKitchenId, kitchens, isAdding, modifierCache],
  );

  const renderDishItem = React.useCallback(
    ({ item }: { item: any }) => {
      return (
        <DishCardWrapper
          item={item}
          width={cardWidth}
          onPress={openModifiers}
          isPhone={isPhone}
          isTablet={isTablet}
          isLandscape={isLandscape}
        />
      );
    },
    [
      cardWidth,
      openModifiers,
      isPhone,
      isTablet,
      isLandscape,
    ],
  );

  const toggleModifier = (mod: any) => {
    if (mod.ModifierName.toUpperCase() === "OPEN") {
      setShowCustomModal(true);
      return;
    }

    setSelectedModifierIds((prev) => {
      const next = prev.includes(mod.ModifierID)
        ? prev.filter((id) => id !== mod.ModifierID)
        : [...prev, mod.ModifierID];
      return next;
    });
  };

  const addCustomMod = () => {
    if (!customItemName) return;
    const newId = `custom-${Date.now()}`;
    const newMod = {
      ModifierID: newId,
      ModifierName: customItemName,
      Price: parseFloat(customItemPrice) || 0,
    };

    setCustomMods((prev) => [...prev, newMod]);
    setSelectedModifierIds((prev) => [...prev, newId]);

    setShowCustomModal(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const addWithModifiers = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedDish) {
      const allAvailable = [...modifiers, ...customMods];
      const selectedMods = allAvailable.filter((m) =>
        selectedModifierIds.includes(m.ModifierID),
      );

      const modsToAdd = selectedMods.map((m) => ({
        ModifierId: String(m.ModifierID || m.ModifierId || ""),
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
      }));

      const extra = modsToAdd.reduce((sum, m) => sum + (m.Price || 0), 0);
      const finalPrice = (selectedDish.Price || 0) + extra;

      const currentKitchen = kitchens.find((k) => k.CategoryId === selectedKitchenId);
      const currentKitchenName = currentKitchen?.KitchenTypeName || "Kitchen";
      const currentKitchenCode = currentKitchen?.KitchenTypeCode || selectedKitchenId;

      addToCartGlobal({
        id: selectedDish.DishId,
        name: selectedDish.Name,
        price: finalPrice,
        modifiers: modsToAdd as any,
        basePrice: selectedDish.Price || 0,
        categoryName: currentKitchenName, // Grouping by Kitchen Name
        KitchenTypeName: selectedDish.KitchenTypeName || currentKitchenName,
        PrinterIP: selectedDish.PrinterIP,
        KitchenTypeCode: selectedDish.KitchenTypeCode || currentKitchenCode,
      });

      // addToCartGlobal handles both local state and database sync
    }
    setShowModifier(false);
  };





  if (!orderContext) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        {isLandscape ? (
          <View style={styles.layout}>
            {/* DESKTOP LAYOUT - Full height sidebar */}
            <View style={[styles.main, { width: mainWidth }]}>
              {renderTopBar()}
              {renderCategoryNav()}
              <View style={styles.gridContainer}>
                {isLoadingDishes || isInitialLoading ? (
                  <DishGridSkeleton
                    cardWidth={cardWidth}
                    columns={columns}
                    gap={gap}
                    isPhone={isPhone}
                  />
                ) : (
                  <FlatList
                    data={filteredItems}
                    keyExtractor={(item, index) => item.DishId || `dish-${index}`}
                    numColumns={columns}
                    key={columns}
                    renderItem={renderDishItem}
                    columnWrapperStyle={
                      columns > 1 ? { gap: gap, marginBottom: gap } : undefined
                    }
                    getItemLayout={(data, index) => ({
                      length: 150, // Fixed height estimate
                      offset: 150 * Math.floor(index / columns),
                      index,
                    })}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={columns * 5}
                    maxToRenderPerBatch={columns * 3}
                    windowSize={5}
                    contentContainerStyle={[
                      styles.listPadding,
                      columns === 1 && { gap: gap },
                      filteredItems.length === 0 && { flex: 1, justifyContent: 'center' }
                    ]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      !isLoadingDishes && !isInitialLoading ? (
                        <View style={styles.emptyItemsState}>
                          <Ionicons name="restaurant-outline" size={64} color={Theme.textMuted} />
                          <Text style={styles.emptyItemsText}>No dish items added</Text>
                        </View>
                      ) : null
                    }
                  />
                )}
              </View>
            </View>
            {isLarge && <CartSidebar width={cartWidth} />}
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
            {/* TAB/PHONE LAYOUT - Hawker Style */}
            <View style={{ padding: isPhone ? 10 : 20, paddingBottom: 0 }}>
              {renderTopBar()}
              {renderCategoryNav()}
            </View>

            <View style={[styles.layout, { flex: 1 }]}>
              <View
                style={[
                  styles.main,
                  {
                    width: mainWidth,
                    paddingTop: 0,
                    paddingHorizontal: isPhone ? 10 : 20,
                  },
                ]}
              >
                <View style={styles.gridContainer}>
                  {isLoadingDishes || isInitialLoading ? (
                    <DishGridSkeleton
                      cardWidth={cardWidth}
                      columns={columns}
                      gap={gap}
                      isPhone={isPhone}
                    />
                  ) : (
                    <FlatList
                      data={filteredItems}
                      keyExtractor={(item) => item.DishId}
                      numColumns={columns}
                      key={columns}
                      renderItem={renderDishItem}
                      columnWrapperStyle={
                        columns > 1
                          ? { gap: gap, marginBottom: gap }
                          : undefined
                      }
                      contentContainerStyle={[
                        styles.listPadding,
                        columns === 1 && { gap: gap },
                        filteredItems.length === 0 && { flex: 1, justifyContent: 'center' }
                      ]}
                      getItemLayout={(data, index) => ({
                        length: 150, // Fixed height estimate
                        offset: 150 * Math.floor(index / columns),
                        index,
                      })}
                      removeClippedSubviews={Platform.OS !== 'web'}
                      initialNumToRender={columns * 5}
                      maxToRenderPerBatch={columns * 3}
                      windowSize={5}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        !isLoadingDishes && !isInitialLoading ? (
                          <View style={styles.emptyItemsState}>
                            <Ionicons name="restaurant-outline" size={64} color={Theme.textMuted} />
                            <Text style={styles.emptyItemsText}>No dish items added</Text>
                          </View>
                        ) : null
                      }
                    />
                  )}
                </View>
              </View>
              {isLarge && <CartSidebar width={cartWidth} />}
            </View>
          </View>
        )}

        {/* MODIFIER MODAL (Screenshot 1 Style) */}
        {showModifier && selectedDish && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Modifiers {selectedDish.Name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowModifier(false)}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {loadingModifiers ? (
                  <ActivityIndicator color={Theme.primary} size="large" />
                ) : (
                  <ScrollView
                    style={styles.modifierList}
                    showsVerticalScrollIndicator={false}
                  >
                    {modifiers.map((m) => (
                      <TouchableOpacity
                        key={m.ModifierID}
                        style={styles.modifierRow}
                        onPress={() => toggleModifier(m)}
                      >
                        <Text style={styles.modifierName}>
                          {m.ModifierName}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            selectedModifierIds.includes(m.ModifierID) &&
                              styles.checkboxActive,
                          ]}
                        >
                          {selectedModifierIds.includes(m.ModifierID) && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowModifier(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnAdd,
                    { backgroundColor: Theme.success },
                  ]}
                  onPress={addWithModifiers}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.modalBtnTextAdd}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ADD CUSTOM ITEM SUB-MODAL (Screenshot 2 Style) */}
            {showCustomModal && (
              <View
                style={[
                  styles.modalOverlay,
                  { zIndex: 2000, backgroundColor: "rgba(0,0,0,0.8)" },
                ]}
              >
                <View style={styles.customItemModal}>
                  <Text style={styles.customModalTitle}>Add Custom Item</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Item Name *</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter item name"
                      placeholderTextColor="#666"
                      value={customItemName}
                      onChangeText={setCustomItemName}
                      autoFocus
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Price (Optional)</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter price"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={customItemPrice}
                      onChangeText={setCustomItemPrice}
                    />
                  </View>

                  <View style={styles.customModalActions}>
                    <TouchableOpacity
                      style={styles.customBtnCancel}
                      onPress={() => setShowCustomModal(false)}
                    >
                      <Text style={styles.customBtnTextCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.customBtnAdd}
                      onPress={addCustomMod}
                    >
                      <Text style={styles.customBtnTextAdd}>Add Item</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
      <Modal transparent visible={showReprintOptions} animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowReprintOptions(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { maxWidth: 300 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Reprint</Text>
                  <TouchableOpacity onPress={() => setShowReprintOptions(false)}>
                    <Ionicons name="close" size={24} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>
                
                <TouchableOpacity
                  style={styles.reprintOption}
                  onPress={handleReprintKOT}
                >
                  <View style={[styles.reprintIcon, { backgroundColor: Theme.primaryLight }]}>
                    <Ionicons name="print-outline" size={20} color={Theme.primary} />
                  </View>
                  <Text style={styles.reprintText}>KOT Reprint</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.reprintOption}
                  onPress={handleReprintBill}
                >
                  <View style={[styles.reprintIcon, { backgroundColor: Theme.successBg }]}>
                    <Ionicons name="receipt-outline" size={20} color={Theme.success} />
                  </View>
                  <Text style={styles.reprintText}>Bill Reprint</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const full = 999;
const styles = StyleSheet.create({
  reprintOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.bgMain,
    gap: 12,
  },
  reprintText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  reprintIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  layout: { flex: 1, flexDirection: "row" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  rail: {
    width: 90,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: Theme.border,
    alignItems: "center",
    paddingVertical: 20,
  },
  railTop: { flex: 1, gap: 20 },
  railItem: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  railItemActive: { backgroundColor: Theme.bgMain },
  railLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  railLabelActive: { color: Theme.primary },
  railBottom: { gap: 20, alignItems: "center" },
  logoutBtn: { alignItems: "center" },
  main: { flex: 1, padding: 12 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  searchWrap: {
    flex: 0.7,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    ...Theme.shadowSm,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textPrimary,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  categoryNavigation: { marginBottom: 15 },
  catScroll: { gap: 10 },
  catPill: {
    paddingHorizontal: 20,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  catPillActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  catText: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.textSecondary },
  catTextActive: { color: "#fff" },
  groupScroll: { gap: 8 },
  groupPill: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: full,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  groupPillActive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  groupText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  groupTextActive: { color: Theme.textPrimary, fontFamily: Fonts.bold },
  gridContainer: { flex: 1 },
  listPadding: { paddingBottom: 80 },
  card: {
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  qtyBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Theme.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#fff",
    ...Theme.shadowSm,
  },
  qtyBadgeText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  dishImageWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: Theme.bgMain,
  },
  dishImg: { width: "100%", height: "100%" },
  dishName: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    minHeight: 36,
    lineHeight: 18,
  },
  dishPrice: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginTop: 4,
  },
  headerCartBtn: {
    width: 48,
    height: 48,
    backgroundColor: Theme.bgMain,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    position: "relative",
  },
  headerBillBtn: {
    width: 48,
    height: 48,
    backgroundColor: Theme.bgMain,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: Theme.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  title: { fontSize: 24, fontFamily: Fonts.black },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    width: "85%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  modalClose: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 18,
  },
  modalBody: { flexShrink: 1 },
  modifierList: { borderTopWidth: 1, borderTopColor: Theme.border },
  modifierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.bgMain,
  },
  modifierName: {
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: { backgroundColor: Theme.primary },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  modalBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  modalBtnAdd: {
    flex: 1.5,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.success,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    ...Theme.shadowSm,
  },
  modalBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },

  /* Submodal Styling (Screenshot 2) */
  customItemModal: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  customModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.bold,
    marginBottom: 8,
  },
  customInput: {
    height: 52,
    backgroundColor: Theme.bgMain,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.medium,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  customModalActions: { flexDirection: "row", gap: 12, marginTop: 10 },
  customBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  customBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  customBtnAdd: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  customBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },
  
  emptyNavState: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  emptyNavText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  emptyItemsState: {
    flex: 1,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
  },
  emptyItemsText: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
});
