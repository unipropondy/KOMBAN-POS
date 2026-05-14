import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Alert,
  Modal,
} from "react-native";
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";
import { API_URL } from "@/constants/Config";

import {
  findActiveOrder,
  useActiveOrdersStore,
} from "../stores/activeOrdersStore";
import {
  clearCart,
  useCartStore,
} from "../stores/cartStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { useCompanySettingsStore } from "../stores/companySettingsStore";
import { usePaymentSettingsStore } from "../stores/paymentSettingsStore";
import { useAuthStore } from "../stores/authStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import UPIPaymentModal from "../components/payment/UPIPaymentModal";

const EMPTY_ARRAY: any[] = [];
import PayNowPaymentModal from "../components/payment/PayNowPaymentModal";

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

type PaymentMethod = {
  payMode: string;
  description: string;
  icon: string;
  commission: number;
  serviceCharge: number;
  isEntertainment: boolean;
  isVoucher: boolean;
  position: number;
};

const PAYMODE_ICON_MAP: Record<string, string> = {
  CAS:        "money-bill-wave",
  CASH:       "money-bill-wave",
  NETS:       "exchange-alt",
  AMEX:       "cc-amex",
  MASTER:     "cc-mastercard",
  VISA:       "cc-visa",
  PAYNOW:     "qrcode",
  GRAB:       "mobile-alt",
  FOODPANDA:  "mobile-alt",
  DINERS:     "credit-card",
  CHQ:        "university",
  LEDGER:     "book",
  VOUCHER:    "ticket-alt",
  DEAL:       "ticket-alt",
  UPI:        "mobile-alt",
  GPAY:       "google-pay",
};

function getPaymodeIcon(payMode: string): string {
  const key = payMode.toUpperCase().replace(/[^A-Z]/g, "");
  if (PAYMODE_ICON_MAP[key]) return PAYMODE_ICON_MAP[key];
  for (const [k, v] of Object.entries(PAYMODE_ICON_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  return "credit-card";
}

const isCashMethod = (payMode: string) => /^(CAS|CASH)$/i.test(payMode.trim());

export default function PaymentScreen() {
  const closeActiveOrder = useActiveOrdersStore((s) => s.closeActiveOrder);
  const clearTable = useTableStatusStore((s) => s.clearTable);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isMobile = !isTablet;
  const showOrderPanel = (isTablet && (isLandscape || width >= 1024)) || (isMobile && isLandscape);

  const context = useOrderContextStore((s) => s.currentOrder);
  const hasHydrated = useActiveOrdersStore((s) => s._hasHydrated);
  const activeOrder = context ? findActiveOrder(context) : undefined;

  const currentContextId = useCartStore((s: any) => s.currentContextId);
  const cart = useCartStore((s: any) => (currentContextId ? s.carts[currentContextId] : undefined) || EMPTY_ARRAY);
  
  const currentTableOrderId = useCartStore((s: any) => context?.tableId ? s.tableOrderIds[context.tableId] : undefined);
  const displayOrderId = currentTableOrderId || activeOrder?.orderId;

  const discount = useCartStore((s: any) => (s.currentContextId ? s.discounts[s.currentContextId] : null));

  const [method, setMethod] = useState("CAS");
  const [cashInput, setCashInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [time, setTime] = useState(new Date());

  const { useLocalSearchParams } = require("expo-router");
  const localParams = useLocalSearchParams();
  const splitItems = useMemo(() => {
    if (!localParams.splitItems) return null;
    try { return JSON.parse(localParams.splitItems as string); } catch { return null; }
  }, [localParams.splitItems]);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<PaymentMethod | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isUPIVisible, setIsUPIVisible] = useState(false);
  const [isPayNowVisible, setIsPayNowVisible] = useState(false);
  const settingsStore = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settingsStore.currencySymbol || "$";
  const gstRate = (settingsStore.gstPercentage || 0) / 100;
  const [roundOff, setRoundOff] = useState(0);
  const [roundType, setRoundType] = useState<"whole" | "five" | "ten" | "custom" | null>(null);
  const [isAdjustmentModalVisible, setIsAdjustmentModalVisible] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const finalItems = useMemo(() => {
    return splitItems || cart;
  }, [splitItems, cart]);

  useEffect(() => {
    const init = async () => {
      await usePaymentSettingsStore.getState().fetchSettings();
      await fetchPaymentMethods();
      if (context?.tableId) {
        try {
          const res = await fetch(`${API_URL}/api/tables/${context.tableId}`);
          const data = await res.json();
          if (data.success && data.table?.CurrentOrderId) {
             useCartStore.getState().setTableOrderId(context.tableId, data.table.CurrentOrderId);
          }
        } catch (err) {
          console.error("Failed to sync official Order ID:", err);
        }
      }
    };
    init();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-methods`);
      const data: any[] = await res.json();
      const mapped: PaymentMethod[] = data.map((d) => ({
        payMode: d.payMode || "",
        description: d.description || d.payMode || "",
        icon: getPaymodeIcon(d.payMode || ""),
        commission: parseFloat(d.Commission) || 0,
        serviceCharge: parseFloat(d.ServiceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher: d.isVoucher === 1 || d.isVoucher === true,
        position: d.Position || 0,
      }));

      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        const key = isCashMethod(m.payMode) ? "__CASH__" : m.payMode.toUpperCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const { settings } = usePaymentSettingsStore.getState();
      const hasUPI = settings.upiId && settings.upiId.trim().length > 0;
      const hasPayNow = settings.payNowQrUrl && settings.payNowQrUrl.trim().length > 0;

      const filtered = deduped.filter(m => {
        const mUpper = m.payMode.toUpperCase().trim();
        const isUPI = mUpper.includes("UPI") || mUpper.includes("GPAY") || mUpper.includes("PHONE") || mUpper.includes("PAYTM");
        const isPayNow = mUpper.includes("PAYNOW") || mUpper.includes("QR") || mUpper.includes("PAY-NOW");
        if (isUPI && !hasUPI) return false;
        if (isPayNow && !hasPayNow) return false;
        return true;
      });

      setPaymentMethods(filtered);
      if (filtered.length > 0) {
        setMethod(filtered[0].payMode);
        fetchPaymentDetail(filtered[0].payMode, filtered[0]);
      }
    } catch {
      setPaymentMethods([{ payMode: "CAS", description: "CASH", icon: "money-bill-wave", commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 1 }]);
    } finally {
      setLoadingMethods(false);
    }
  };

  const fetchPaymentDetail = async (payMode: string, fallback?: PaymentMethod) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-detail/${encodeURIComponent(payMode)}`);
      const d = await res.json();
      setSelectedDetail({
        payMode: d.payMode || payMode,
        description: d.description || payMode,
        icon: getPaymodeIcon(d.payMode || payMode),
        commission: parseFloat(d.commission) || 0,
        serviceCharge: parseFloat(d.serviceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher: d.isVoucher === 1 || d.isVoucher === true,
        position: d.position || 0,
      });
    } catch {
      setSelectedDetail(fallback || null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectMethod = (m: PaymentMethod) => {
    setMethod(m.payMode);
    if (!isCashMethod(m.payMode)) {
      setRoundOff(0);
      setRoundType(null);
    }
    fetchPaymentDetail(m.payMode, m);
  };

  const subtotal = useMemo(() => finalItems.filter((i: any) => i.status !== "VOIDED").reduce((sum: number, item: any) => sum + (item.price || 0) * (item.qty || 0), 0), [finalItems]);
  const discountAmount = useMemo(() => {
    if (!discount?.applied) return 0;
    if (discount.type === "percentage") return (subtotal * discount.value) / 100;
    return splitItems ? 0 : discount.value;
  }, [discount, subtotal, splitItems]);

  const tax = subtotal * gstRate;
  const baseTotal = subtotal - discountAmount + tax;

  useEffect(() => {
    if (!isCashMethod(method)) {
      setRoundOff(0);
      setRoundType(null);
      return;
    }
    if (roundType === "whole") setRoundOff(Math.round(baseTotal) - baseTotal);
    else if (roundType === "five") setRoundOff(Math.round(baseTotal * 20) / 20 - baseTotal);
    else if (roundType === "ten") setRoundOff(Math.round(baseTotal * 10) / 10 - baseTotal);
  }, [baseTotal, roundType, method]);

  const total = Math.max(0, baseTotal + roundOff);
  const paidNum = isCashMethod(method) ? (parseFloat(cashInput) || 0) : total;
  const change = Math.max(0, paidNum - total);
  const quickCash = [20, 50, 100, 200, 500, 1000];

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const confirmPayment = async () => {
    if (processing) return;
    if (total > 0 && isCashMethod(method) && (paidNum < total && Math.abs(paidNum - total) > 0.01)) {
      showToast({ type: "warning", message: "Insufficient Payment", subtitle: `Please enter at least ${currencySymbol}${total.toFixed(2)}` });
      return;
    }
    const { settings } = usePaymentSettingsStore.getState();
    const mUpper = method.trim().toUpperCase();
    if (mUpper.includes("UPI") && settings.upiId) { setIsUPIVisible(true); return; }
    if (mUpper.includes("PAYNOW") && settings.payNowQrUrl) { setIsPayNowVisible(true); return; }
    executeFinalPayment();
  };

  const executeFinalPayment = async (m?: string) => {
    setProcessing(true);
    const saleData = {
      orderId: displayOrderId || activeOrder?.orderId,
      orderType: context?.orderType === "DINE_IN" ? "DINE-IN" : context?.orderType || "DINE-IN",
      tableNo: context?.orderType === "TAKEAWAY" ? context?.takeawayNo : context?.tableNo,
      section: context?.section,
      items: finalItems.map((item: any) => ({ dishId: item.id, name: item.name, qty: item.qty, price: item.price, status: item.status })),
      subTotal: subtotal,
      taxAmount: tax,
      discountAmount: discountAmount,
      discountType: discount?.type || "fixed",
      totalAmount: total,
      paymentMethod: method.trim(),
      roundOff: roundOff,
      cashierId: user?.userId,
      tableId: context?.tableId,
      serverId: context?.serverId,
      serverName: context?.serverName
    };

    try {
      const response = await fetch(`${API_URL}/api/sales/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleData)
      });
      const result = await response.json();
      if (result.success) {
        setTimeout(() => {
          router.push({
            pathname: "/payment_success" as any,
            params: {
              total: total.toFixed(2),
              paidNum: paidNum.toFixed(2),
              change: change.toFixed(2),
              method,
              orderId: result.orderId || displayOrderId || "",
              tableNo: context?.tableNo ?? "",
              section: context?.section ?? "",
              orderType: context?.orderType ?? "",
              discountInfo: JSON.stringify(discount || {}),
              items: JSON.stringify(finalItems || []),
              roundOff: roundOff.toFixed(2),
              isSplit: splitItems ? "true" : "false",
              waiterName: context?.serverName ?? "",
            },
          });
          if (context) {
            if (splitItems) {
              const { carts, currentContextId, setCartItems } = useCartStore.getState();
              if (currentContextId) {
                const updated = (carts[currentContextId] || []).map(o => {
                  const s = splitItems.find((si: any) => si.lineItemId === o.lineItemId);
                  return s ? { ...o, qty: o.qty - s.qty } : o;
                }).filter(i => i.qty > 0);
                setCartItems(currentContextId, updated);
                useCartStore.getState().syncCartWithDB(currentContextId);
              }
            }

            if (context.orderType === "DINE_IN") {
                clearTable(context.section!, context.tableNo!);
              }
              
              if (context.tableId) {
                // 1. Tell backend the order is complete (clears DB cart)
                fetch(`${API_URL}/api/orders/complete`, { 
                  method: "POST", 
                  headers: { "Content-Type": "application/json" }, 
                  body: JSON.stringify({ tableId: context.tableId }) 
                });

                // 2. CRITICAL: Comprehensive local cleanup
                useCartStore.getState().clearTableSession(context.tableId);
                closeActiveOrder(displayOrderId || "");
              }
              
              // 3. Clear the active order context
              useOrderContextStore.getState().clearOrderContext();
            }
        }, 100);
      } else {
        showToast({ type: "error", message: "Failed", subtitle: result.error });
      }
    } catch (e: any) {
      showToast({ type: "error", message: "Error", subtitle: e.message });
    } finally {
      setProcessing(false);
    }
  };

  const renderAdjustmentModal = () => (
    <Modal visible={isAdjustmentModalVisible} transparent animationType="fade" onRequestClose={() => setIsAdjustmentModalVisible(false)}>
      <TouchableWithoutFeedback onPress={() => setIsAdjustmentModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.adjustModalContent}>
              <View style={styles.adjustModalHeader}>
                <Text style={styles.adjustModalTitle}>Bill Adjustment</Text>
                <TouchableOpacity onPress={() => setIsAdjustmentModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={styles.adjustPresets}>
                {[
                  { label: "Singapore Standard", value: "Nearest .05", mode: "five" as const, target: Math.round(baseTotal * 20) / 20 },
                  { label: "Quick Round", value: "Nearest .10", mode: "ten" as const, target: Math.round(baseTotal * 10) / 10 },
                  { label: "Premium Nett", value: "Whole Dollar", mode: "whole" as const, target: Math.round(baseTotal) }
                ].map((p) => (
                  <TouchableOpacity key={p.mode} style={styles.presetItem} onPress={() => { setRoundOff(p.target - baseTotal); setRoundType(p.mode); if (method === "CAS") setCashInput(p.target.toFixed(2)); setIsAdjustmentModalVisible(false); }}>
                    <Text style={styles.presetLabel}>{p.label}</Text>
                    <Text style={styles.presetValue}>{p.value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customInputSection}>
                <Text style={styles.inputLabel}>Custom Adjustment Amount</Text>
                <View style={styles.customInputRow}>
                  <TextInput style={styles.adjustTextInput} placeholder="0.00" keyboardType="numeric" value={customValue} onChangeText={setCustomValue} />
                  <TouchableOpacity style={styles.applyBtn} onPress={() => { const n = parseFloat(customValue); if (!isNaN(n)) { setRoundOff(n); setRoundType("custom"); if (method === "CAS") setCashInput((baseTotal + n).toFixed(2)); setIsAdjustmentModalVisible(false); } }}>
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.resetBtnFull} onPress={() => { setRoundOff(0); setRoundType(null); if (method === "CAS") setCashInput(baseTotal.toFixed(2)); setIsAdjustmentModalVisible(false); }}>
                <Text style={styles.resetBtnText}>Reset to Original Bill</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.itemRow}>
      <Text style={styles.itemQty}>{item.qty}x</Text>
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.itemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
    </View>
  );

  if (!context) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Theme.textSecondary} />
          </TouchableOpacity>
          <View style={styles.orderInfo}>
            <Text style={styles.orderTitle}>Checkout</Text>
            <View style={styles.orderBadgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: context!.orderType === 'DINE_IN' ? Theme.primaryLight : Theme.warningBg }]}>
                <Text style={[styles.typeBadgeText, { color: context!.orderType === 'DINE_IN' ? Theme.primary : Theme.warning }]}>
                  {context!.orderType === 'DINE_IN' ? 'DINE-IN' : 'TAKEAWAY'}
                </Text>
              </View>
              {context!.orderType === 'DINE_IN' && (
                <View style={styles.tableBadge}>
                   <Text style={styles.tableBadgeText}>{formatSection(context!.section || "")} • T{context!.tableNo}</Text>
                </View>
              )}
              <Text style={styles.orderSub}>#{displayOrderId || "NEW"}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={[styles.mainLayout, isLandscape && { flexDirection: "row" }]}>
                <View style={[styles.leftPane, isLandscape && { flex: 1.2, paddingRight: 20 }]}>
                  {/* Summary for Mobile */}
                  {!showOrderPanel && (
                    <View style={styles.mobileSummaryCard}>
                      <View style={styles.mobileSummaryRow}>
                        <View>
                          <Text style={styles.mobileSummaryLabel}>AMOUNT DUE</Text>
                          <Text style={styles.mobileSummaryTotal}>{currencySymbol}{total.toFixed(2)}</Text>
                        </View>
                        {isCashMethod(method) && (
                          <TouchableOpacity style={styles.mobileAdjustBtn} onPress={() => setIsAdjustmentModalVisible(true)}>
                            <Ionicons name="options-outline" size={20} color={Theme.primary} />
                            <Text style={styles.mobileAdjustText}>Adjust</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {(discount?.applied || discountAmount > 0) && (
                        <View style={[styles.mobileSummaryRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.border + '40' }]}>
                          <Text style={[styles.mobileSummaryLabel, { color: Theme.danger }]}>DISCOUNT</Text>
                          <Text style={[styles.mobileSummaryTotal, { fontSize: 18, color: Theme.danger }]}>
                            -{currencySymbol}{discountAmount.toFixed(2)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Select Payment Method</Text></View>
                  {loadingMethods ? (
                    <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="large" color={Theme.primary} />
                      <Text style={{ marginTop: 8, fontSize: 13, fontFamily: Fonts.medium, color: Theme.textSecondary }}>Loading methods...</Text>
                    </View>
                  ) : (
                    <View style={styles.methodsGrid}>
                      {paymentMethods.map((m) => (
                        <TouchableOpacity key={m.payMode} style={[styles.methodCard, method === m.payMode && styles.activeMethodCard, isMobile && { width: '30%', height: 75 }]} onPress={() => handleSelectMethod(m)}>
                          <View style={[styles.methodIconBox, method === m.payMode && styles.activeIconBox, isMobile && { width: 30, height: 30 }]}>
                            <FontAwesome5 name={m.icon} size={isMobile ? 16 : 20} color={method === m.payMode ? "#fff" : Theme.primary} />
                          </View>
                          <Text style={[styles.methodLabel, method === m.payMode && styles.activeMethodLabel, isMobile && { fontSize: 10 }]}>{m.description}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {isCashMethod(method) && (
                    <View style={styles.cashSection}>
                      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Cash Received</Text></View>
                      <View style={styles.cashInputBox}>
                        <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                        <TextInput style={styles.cashInput} value={cashInput} onChangeText={setCashInput} keyboardType="numeric" placeholder="0.00" />
                      </View>
                      <View style={styles.quickCashContainer}>
                        {quickCash.map((v) => {
                          const isSelected = parseFloat(cashInput) === v;
                          return (
                            <TouchableOpacity 
                              key={v} 
                              style={[styles.quickCashBtn, isSelected && styles.activeQuickCashBtn]} 
                              onPress={() => setCashInput(v.toString())}
                            >
                              <Text style={[styles.quickCashText, isSelected && styles.activeQuickCashText]}>
                                {currencySymbol}{v}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {(() => {
                          const isExact = Math.abs(parseFloat(cashInput) - total) < 0.01;
                          return (
                            <TouchableOpacity 
                              style={[styles.quickCashBtn, isExact && styles.activeQuickCashBtn]} 
                              onPress={() => setCashInput(total.toFixed(2))}
                            >
                              <Text style={[styles.quickCashText, isExact && styles.activeQuickCashText]}>Exact</Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                      {paidNum > 0 && (
                        <View style={styles.changeBox}>
                          <Text style={styles.changeLabel}>Change to Return</Text>
                          <Text style={styles.changeValue}>{currencySymbol}{change.toFixed(2)}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <TouchableOpacity style={[styles.completeBtn, processing && { opacity: 0.7 }]} onPress={confirmPayment} disabled={processing}>
                    {processing ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={24} color="#fff" /><Text style={styles.completeBtnText}>Complete Settlement</Text></>}
                  </TouchableOpacity>
                </View>

                {showOrderPanel && (
                  <View style={styles.rightPane}>
                    <View style={styles.summaryCard}>
                      <View style={styles.summaryHeader}><Text style={styles.summaryTitle}>Amount Due</Text><Text style={styles.summaryTotal}>${total.toFixed(2)}</Text></View>
                      <View style={styles.breakdown}>
                        <View style={styles.breakRow}>
                          <Text style={styles.breakLabel}>Subtotal</Text>
                          <Text style={styles.breakValue}>${subtotal.toFixed(2)}</Text>
                        </View>
                        
                        {(discount?.applied || discountAmount > 0) && (
                          <View style={styles.breakRow}>
                            <Text style={[styles.breakLabel, { color: Theme.danger }]}>Discount</Text>
                            <Text style={[styles.breakValue, { color: Theme.danger }]}>
                              -${discountAmount.toFixed(2)}
                            </Text>
                          </View>
                        )}

                        <View style={styles.breakRow}>
                          <Text style={styles.breakLabel}>GST</Text>
                          <Text style={styles.breakValue}>${tax.toFixed(2)}</Text>
                        </View>

                        {roundOff !== 0 && (
                          <View style={styles.breakRow}>
                            <Text style={[styles.breakLabel, { color: Theme.primary }]}>Rounding</Text>
                            <Text style={[styles.breakValue, { color: Theme.primary }]}>
                              {roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}
                            </Text>
                          </View>
                        )}
                        {isCashMethod(method) && (
                          <>
                            <View style={styles.receiptDivider} />
                            <View style={styles.roundingContainer}>
                              <View style={styles.roundingHeader}>
                                <Text style={styles.roundingLabel}>Rounding</Text>
                                {roundType && (
                                  <TouchableOpacity onPress={() => {
                                    setRoundOff(0);
                                    setRoundType(null);
                                    if (method === "CAS") setCashInput(baseTotal.toFixed(2));
                                  }}>
                                    <Text style={styles.resetTextLink}>Reset</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                              
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity 
                                  style={[styles.roundingToggleBtn, roundType === 'ten' && styles.activeRoundingBtn]}
                                  onPress={() => {
                                    if (roundType === 'ten') {
                                      setRoundOff(0);
                                      setRoundType(null);
                                      if (method === "CAS") setCashInput(baseTotal.toFixed(2));
                                    } else {
                                      const target = Math.round(baseTotal * 10) / 10;
                                      setRoundOff(target - baseTotal);
                                      setRoundType('ten');
                                      if (method === "CAS") setCashInput(target.toFixed(2));
                                    }
                                  }}
                                >
                                  <Ionicons 
                                    name={roundType === 'ten' ? "checkmark-circle" : "radio-button-off"} 
                                    size={18} 
                                    color={roundType === 'ten' ? "#fff" : Theme.primary} 
                                  />
                                  <Text style={[styles.roundingToggleText, roundType === 'ten' && styles.activeRoundingText]}>
                                    {roundType === 'ten' ? "Rounded to .10" : "Round to .10"}
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                  style={styles.moreAdjustBtn}
                                  onPress={() => setIsAdjustmentModalVisible(true)}
                                >
                                  <Ionicons name="options" size={18} color={Theme.primary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.orderItemsCard}>
                      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Order Items</Text></View>
                      <FlatList data={finalItems} keyExtractor={(_, index) => index.toString()} renderItem={renderItem} scrollEnabled={false} />
                    </View>
                  </View>
                )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {renderAdjustmentModal()}
      <UPIPaymentModal visible={isUPIVisible} onClose={() => setIsUPIVisible(false)} amount={total} onSuccess={() => executeFinalPayment()} />
      <PayNowPaymentModal visible={isPayNowVisible} onClose={() => setIsPayNowVisible(false)} amount={total} onSuccess={() => executeFinalPayment()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1, padding: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: Theme.bgMuted, borderRadius: 10, borderWidth: 1, borderColor: Theme.border },
  orderInfo: { alignItems: "center", flex: 1 },
  orderTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  orderBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontFamily: Fonts.black },
  tableBadge: { backgroundColor: Theme.bgMuted, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: Theme.border },
  tableBadgeText: { fontSize: 9, fontFamily: Fonts.bold, color: Theme.textPrimary },
  orderSub: { color: Theme.textSecondary, fontSize: 10, fontFamily: Fonts.bold },
  mainLayout: { flex: 1, gap: 15 },
  leftPane: { padding: 15, borderRadius: 20, backgroundColor: Theme.bgCard, ...Theme.shadowMd, borderWidth: 1, borderColor: Theme.border },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  methodCard: { width: '31.8%', height: 70, backgroundColor: Theme.bgMuted, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Theme.border, gap: 4 },
  activeMethodCard: { backgroundColor: Theme.primary, borderColor: Theme.primary, ...Theme.shadowMd },
  methodIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  activeIconBox: { backgroundColor: 'rgba(255,255,255,0.2)' },
  methodLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Theme.textSecondary, textAlign: 'center', paddingHorizontal: 2 },
  activeMethodLabel: { color: '#fff' },
  cashSection: { marginTop: 5 },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontFamily: Fonts.black, color: Theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  cashInputBox: { flexDirection: 'row', alignItems: 'center', height: 56, backgroundColor: Theme.bgMuted, borderRadius: 12, paddingHorizontal: 16, borderWidth: 2, borderColor: Theme.border, marginBottom: 12 },
  currencyPrefix: { fontSize: 20, fontFamily: Fonts.black, color: Theme.primary, marginRight: 8 },
  cashInput: { flex: 1, fontSize: 24, fontFamily: Fonts.black, color: Theme.textPrimary },
  quickCashContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  quickCashBtn: { minWidth: 54, height: 38, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: Theme.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  activeQuickCashBtn: { backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder },
  quickCashText: { fontSize: 13, fontFamily: Fonts.black, color: Theme.textPrimary },
  activeQuickCashText: { color: Theme.primary },
  changeBox: { padding: 12, backgroundColor: Theme.primaryLight, borderRadius: 14, borderWidth: 1, borderColor: Theme.primaryBorder, marginBottom: 15 },
  changeLabel: { fontSize: 9, fontFamily: Fonts.black, color: Theme.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  changeValue: { fontSize: 26, fontFamily: Fonts.black, color: Theme.primary },
  completeBtn: { height: 50, backgroundColor: Theme.primary, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...Theme.shadowLg },
  completeBtnText: { fontSize: 16, fontFamily: Fonts.black, color: '#fff' },
  rightPane: { flex: 0.7, gap: 15 },
  summaryCard: { padding: 18, backgroundColor: Theme.bgCard, borderRadius: 20, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  summaryHeader: { marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryTitle: { fontSize: 10, fontFamily: Fonts.black, color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryTotal: { fontSize: 30, fontFamily: Fonts.black, color: Theme.primary, lineHeight: 34 },
  breakdown: { gap: 8 },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: Theme.textSecondary },
  breakValue: { fontSize: 14, fontFamily: Fonts.extraBold, color: Theme.textPrimary },
  receiptDivider: { height: 1, backgroundColor: Theme.border, marginVertical: 12 },
  roundingContainer: { marginTop: 8 },
  roundingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  roundingLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Theme.textSecondary, textTransform: 'uppercase' },
  resetTextLink: { fontSize: 11, fontFamily: Fonts.bold, color: Theme.danger },
  roundingToggleBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: "#fff", borderWidth: 2, borderColor: Theme.primaryBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  activeRoundingBtn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  roundingToggleText: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.primary },
  activeRoundingText: { color: "#fff" },
  moreAdjustBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: Theme.bgMuted, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Theme.border },
  orderItemsCard: { flex: 1, padding: 20, backgroundColor: Theme.bgCard, borderRadius: 20, borderWidth: 1, borderColor: Theme.border },
  itemRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  itemQty: { width: 30, fontSize: 13, fontFamily: Fonts.black, color: Theme.primary },
  itemName: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Theme.textPrimary },
  itemPrice: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  adjustModalContent: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 24, padding: 24, ...Theme.shadowLg },
  adjustModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  adjustModalTitle: { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary },
  adjustPresets: { gap: 10, marginBottom: 20 },
  presetItem: { backgroundColor: Theme.bgMuted, padding: 14, borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Theme.border },
  presetLabel: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textSecondary },
  presetValue: { fontSize: 13, fontFamily: Fonts.black, color: Theme.primary },
  customInputSection: { marginBottom: 20 },
  inputLabel: { fontSize: 11, fontFamily: Fonts.bold, color: Theme.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  customInputRow: { flexDirection: 'row', gap: 8 },
  adjustTextInput: { flex: 1, height: 46, backgroundColor: Theme.bgMuted, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, fontFamily: Fonts.bold },
  applyBtn: { backgroundColor: Theme.primary, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  applyBtnText: { color: '#fff', fontFamily: Fonts.bold, fontSize: 13 },
  resetBtnFull: { height: 44, justifyContent: 'center', alignItems: 'center' },
  resetBtnText: { color: Theme.danger, fontFamily: Fonts.bold, fontSize: 13 },
  mobileSummaryCard: {
    backgroundColor: Theme.primary + "10",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.primary + "20",
  },
  mobileSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileSummaryLabel: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  mobileSummaryTotal: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  mobileAdjustBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  mobileAdjustText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  mobileDiscountText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.danger,
    marginTop: 4,
  },
});
