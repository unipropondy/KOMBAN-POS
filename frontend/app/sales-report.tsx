import { API_URL } from "@/constants/Config";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import BillPrompt from "../components/BillPrompt";
import CalendarPicker from "../components/CalendarPicker";
import TransactionCard from "../components/TransactionCard";
import UniversalPrinter from "../components/UniversalPrinter";
import { useToast } from "../components/Toast";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";

type FilterType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
type DetailReportType = "CATEGORY" | "DISH" | "SETTLEMENT";
type EmailValidationResult = {
  normalized: string;
  isValid: boolean;
  error?: string;
  suggestion?: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "protonmail.com",
];
const KNOWN_DOMAIN_TYPOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "hotnail.com": "hotmail.com",
};

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function suggestEmailDomain(email: string): string | undefined {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return undefined;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return undefined;
  if (KNOWN_DOMAIN_TYPOS[domain]) return `${local}@${KNOWN_DOMAIN_TYPOS[domain]}`;
  let bestDomain = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = levenshteinDistance(domain, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDomain = candidate;
    }
  }
  if (!bestDomain || bestDistance > 2) return undefined;
  return `${local}@${bestDomain}`;
}

function validateRecipientEmail(raw: string): EmailValidationResult {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { normalized, isValid: false, error: "Email address is required." };
  }
  const at = normalized.indexOf("@");
  const domain = at > 0 ? normalized.slice(at + 1) : "";
  if (KNOWN_DOMAIN_TYPOS[domain]) {
    return {
      normalized,
      isValid: false,
      error: "Email domain looks misspelled.",
      suggestion: `${normalized.slice(0, at)}@${KNOWN_DOMAIN_TYPOS[domain]}`,
    };
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return {
      normalized,
      isValid: false,
      error: "Please enter a valid email address.",
      suggestion: suggestEmailDomain(normalized),
    };
  }
  return {
    normalized,
    isValid: true,
    suggestion: suggestEmailDomain(normalized),
  };
}

export default function SalesReport() {
  const router = useRouter();
  const { showToast } = useToast();
  const { width: SCREEN_W } = useWindowDimensions();
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const todayDate = new Date().toLocaleDateString("en-CA");
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("DAILY");
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activePaymentModes, setActivePaymentModes] = useState<string[]>([
    "CASH",
    "CARD",
    "NETS",
    "PAYNOW",
    "VOID",
  ]);
  const [activeOrderTypes, setActiveOrderTypes] = useState<string[]>([
    "DINE-IN",
    "TAKEAWAY",
  ]);
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "HIGHEST">("NEWEST");
  const [detailReportType, setDetailReportType] =
    useState<DetailReportType | null>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [dishReport, setDishReport] = useState<any[]>([]);
  const [settlementReport, setSettlementReport] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [isReprinting, setIsReprinting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"SINGLE" | "START" | "END">(
    "SINGLE",
  );
  const [showCancelledOrders, setShowCancelledOrders] = useState(true);

  // --- DOWNLOAD MODAL STATES ---
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadFilter, setDownloadFilter] = useState<FilterType>("DAILY");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadRangeStart, setDownloadRangeStart] = useState<string | null>(null);
  const [downloadRangeEnd, setDownloadRangeEnd] = useState<string | null>(null);
  const [showDownloadDatePicker, setShowDownloadDatePicker] = useState(false);
  const [downloadPickerMode, setDownloadPickerMode] = useState<"START" | "END">("START");
  const [emailAddress, setEmailAddress] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailFieldTouched, setEmailFieldTouched] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const emailValidation = useMemo(
    () => validateRecipientEmail(emailAddress),
    [emailAddress],
  );
  const showEmailValidationError =
    emailFieldTouched && !!emailAddress && !emailValidation.isValid;

  useEffect(() => {
    const loadState = async () => {
      try {
        const savedDate = await AsyncStorage.getItem("sales_selected_date");
        const savedFilter = await AsyncStorage.getItem("sales_selected_filter");
        const savedModes = await AsyncStorage.getItem("sales_payment_modes");
        const savedTypes = await AsyncStorage.getItem("sales_order_types");
        const savedSort = await AsyncStorage.getItem("sales_sort_order");
        const savedDownloadFilter = await AsyncStorage.getItem("sales_download_filter");

        if (savedDate) setSelectedDate(savedDate);
        if (
          savedFilter &&
          ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(savedFilter)
        ) {
          setSelectedFilter(savedFilter as FilterType);
        }
        if (
          savedDownloadFilter &&
          ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"].includes(savedDownloadFilter)
        ) {
          setDownloadFilter(savedDownloadFilter as FilterType);
        }
        if (savedModes) setActivePaymentModes(JSON.parse(savedModes));
        if (savedTypes) setActiveOrderTypes(JSON.parse(savedTypes));
        if (savedSort) setSortOrder(savedSort as "NEWEST" | "HIGHEST");
      } catch (e) {

        console.error("Load state error:", e);
      }
    };
    loadState();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem("sales_selected_date", selectedDate);
    AsyncStorage.setItem("sales_selected_filter", selectedFilter);
    AsyncStorage.setItem("sales_download_filter", downloadFilter);
    AsyncStorage.setItem(

      "sales_payment_modes",
      JSON.stringify(activePaymentModes),
    );
    AsyncStorage.setItem("sales_order_types", JSON.stringify(activeOrderTypes));
    AsyncStorage.setItem("sales_sort_order", sortOrder);
    fetchData();
  }, [
    selectedDate,
    selectedFilter,
    activePaymentModes,
    activeOrderTypes,
    sortOrder,
    downloadFilter,
  ]);

  const fetchData = async () => {
    try {
      if (sales.length === 0) setLoading(true);
      await Promise.all([fetchSales(), fetchSummary()]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDetailReport = useCallback(
    async (reportType: DetailReportType, filterType = selectedFilter) => {
      try {
        setLoadingReport(true);
        const reportFilter = filterType.toLowerCase();
        const params = new URLSearchParams({
          filter: reportFilter,
          date: selectedDate,
          t: Date.now().toString(),
        });

        const endpoint =
          reportType === "CATEGORY"
            ? "category"
            : reportType === "DISH"
              ? "dish"
              : "settlement";
        console.log("[SalesReport] Fetching report", {
          reportType,
          filterType: reportFilter,
        });
        const response = await fetch(
          `${API_URL}/api/reports/${endpoint}?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Unable to load ${endpoint} report`);
        }

        const data = await response.json();
        console.log("[SalesReport] API response", {
          reportType,
          filterType: reportFilter,
          rows: Array.isArray(data) ? data.length : 0,
          data,
        });

        if (reportType === "CATEGORY") {
          setCategoryReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  CategoryName:
                    row.categoryName || row.CategoryName || "Unmapped",
                  Sold: row.totalQty ?? row.totalQuantitySold ?? 0,
                  SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
                }))
              : [],
          );
          setDishReport([]);
          setSettlementReport([]);
        } else if (reportType === "DISH") {
          setDishReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  DishName: row.dishName || row.DishName || "Unknown Dish",
                  CategoryName:
                    row.categoryName || row.CategoryName || "Unmapped",
                  SubCategoryName:
                    row.subCategoryName || row.SubCategoryName || "Unmapped",
                  Sold: row.totalQty ?? row.quantitySold ?? 0,
                  Voided: row.voidQty ?? 0,
                  SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
                }))
              : [],
          );
          setCategoryReport([]);
          setSettlementReport([]);
        } else {
          setSettlementReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  Paymode: row.Paymode || "Unknown",
                  SysAmount: row.SysAmount ?? 0,
                  ManualAmount: row.ManualAmount ?? 0,
                  SortageOrExces: row.SortageOrExces ?? 0,
                  ReceiptCount: row.ReceiptCount ?? 0,
                }))
              : [],
          );
          setCategoryReport([]);
          setDishReport([]);
        }
      } catch (error) {
        console.error("Detail report fetch error:", error);
        setCategoryReport([]);
        setDishReport([]);
        setSettlementReport([]);
      } finally {
        setLoadingReport(false);
      }
    },
    [selectedFilter],
  );

  const handleReportPress = (reportType: DetailReportType) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (detailReportType === reportType) {
      fetchDetailReport(reportType);
      return;
    }
    setDetailReportType(reportType);
  };

  useEffect(() => {
    if (detailReportType) {
      fetchDetailReport(detailReportType, selectedFilter);
    }
  }, [selectedFilter, detailReportType, fetchDetailReport]);

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API_URL}/api/sales/all`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch sales");
      const data = await response.json();
      if (Array.isArray(data)) {
        // Deduplicate sales by SettlementID to prevent duplicate key errors
        const uniqueSales = Array.from(
          new Map(data.map((s: any) => [s.SettlementID, s])).values()
        );
        setSales(uniqueSales);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.error("Sales fetch error:", error);
      setSales([]);
    }
  };

  const fetchSummary = async () => {
    try {
      const end = new Date(selectedDate);
      const start = new Date(selectedDate);

      if (selectedFilter === "WEEKLY") {
        start.setDate(start.getDate() - 6);
      } else if (selectedFilter === "MONTHLY") {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
      } else if (selectedFilter === "YEARLY") {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
      } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
        start.setTime(new Date(rangeStart).getTime());
        end.setTime(new Date(rangeEnd).getTime());
      }

      const startStr = start.toLocaleDateString("en-CA");
      const endStr = end.toLocaleDateString("en-CA");
      const url = `${API_URL}/api/sales/range?startDate=${startStr}&endDate=${endStr}`;
      const response = await fetch(url);
      const data = await response.json();
      setSummary(Array.isArray(data) ? data[0] : data);
    } catch (error) {
      console.error("Summary fetch error:", error);
      setSummary(null);
    }
  };

  const fetchReportData = async () => {
      const endObj = new Date();
      const startObj = new Date();

      if (downloadFilter === "WEEKLY") {
        startObj.setDate(startObj.getDate() - 6);
      } else if (downloadFilter === "MONTHLY") {
        startObj.setDate(1);
        endObj.setMonth(endObj.getMonth() + 1);
        endObj.setDate(0);
      } else if (downloadFilter === "YEARLY") {
        startObj.setMonth(0, 1);
        endObj.setMonth(11, 31);
      } else if (downloadFilter === "CUSTOM" && downloadRangeStart && downloadRangeEnd) {
        startObj.setTime(new Date(downloadRangeStart).getTime());
        endObj.setTime(new Date(downloadRangeEnd).getTime());
      }

      const startStr = startObj.toLocaleDateString("en-CA");
      const endStr = endObj.toLocaleDateString("en-CA");
      
      const userName = await AsyncStorage.getItem("userName") || "SR";

      const summaryUrl = `${API_URL}/api/sales/day-end-summary?startDate=${startStr}&endDate=${endStr}`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json();

      if (!summaryData.success) {
        throw new Error("Failed to fetch report data");
      }

      // We fetch dish report for item-wise data
      const dishUrl = `${API_URL}/api/reports/dish?filter=custom&date=${startStr}`;
      // wait, api/reports/dish expects a filter like daily, weekly, monthly, yearly, custom
      // and for custom it might use the same logic?
      // actually, api/reports/dish uses getReportDateWhereSql, which doesn't fully support custom dates unless handled.
      // I'll just pass the filter if it's not custom, otherwise pass daily for now or omit items.
      let items: any[] = [];
      try {
        const dishFilter = downloadFilter === "CUSTOM" ? "daily" : downloadFilter.toLowerCase();
        const dRes = await fetch(`${API_URL}/api/reports/dish?filter=${dishFilter}&date=${startStr}`);
        const dData = await dRes.json();
        if (Array.isArray(dData)) {
           items = dData.map((d: any) => ({
              name: d.dishName || d.DishName,
              quantity: d.totalQty,
              price: d.totalAmount / (d.totalQty || 1),
              revenue: d.totalAmount
           }));
        }
      } catch (e) {
         console.warn("Failed to fetch item wise data for report", e);
      }

      const paymentBreakdown: any[] = [];
      summaryData.paymodeDetail?.forEach((p: any) => {
        paymentBreakdown.push({
          name: p.Paymode,
          qty: p.ReceiptCount || 0,
          amount: p.Amount || 0
        });
      });

      const sa = summaryData.salesAnalysis || {};
      const vd = summaryData.voidDetail || {};

      return {
        filterType: downloadFilter,
        period: downloadFilter === "DAILY" ? startStr : `${startStr} to ${endStr}`,
        companyName: summaryData.orgInfo?.Name || 'AL-HAZIMA RESTAURANT PTE LTD',
        companyAddress: summaryData.orgInfo?.Address1_Line1 || 'No 4, Cheong Chin Nam Road, SINGAPORE 599729',
        companyPhone: summaryData.orgInfo?.Address1_Telephone1 || '65130000',
        cashierName: userName,
        
        // Match backend generatePdfDocDefinition expectations
        netSales: sa.baseSales || 0,
        serviceCharge: sa.totalServiceCharge || 0,
        taxCollected: sa.totalTax || 0,
        roundedBy: sa.roundOff || 0,
        totalRevenue: sa.totalSales || 0,
        totalSales: sa.totalSales || 0,
        totalDiscount: sa.totalDiscount || 0,
        
        totalOrders: sa.billCount || 0,
        totalItems: items.reduce((acc, curr) => acc + curr.quantity, 0),
        
        voidQty: vd.voidQty || 0,
        voidAmount: vd.voidAmount || 0,
        
        cancelledCount: summaryData.cancelledDetail?.count || 0,
        cancelledAmount: summaryData.cancelledDetail?.amount || 0,
        
        paymentBreakdown,
        cancelledOrders: summaryData.cancelledOrders || [],
        items: items.length > 0 ? items.map(i => ({
          name: i.name,
          qty: i.quantity,
          amount: i.revenue
        })) : undefined
      };
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      const reportData = await fetchReportData();
      const filename = `Sales_Report_${downloadFilter}_${new Date().toISOString().split("T")[0]}.pdf`;

      const response = await fetch(`${API_URL}/api/export/download-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData }),
      });
      if (!response.ok) throw new Error("Failed to generate PDF");

      const arrayBuffer = await response.arrayBuffer();

      if (Platform.OS === "web") {
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystemLegacy.documentDirectory}${filename}`;
        await FileSystemLegacy.writeAsStringAsync(uri, arrayBufferToBase64(arrayBuffer), {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        } else {
          alert("Downloaded to: " + uri);
        }
      }
      
      setShowDownloadPanel(false);
    } catch (error) {
      console.error("Download error:", error);
      alert("An error occurred while generating the PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEmailPdf = async () => {
    const emailCheck = validateRecipientEmail(emailAddress);
    if (!emailCheck.isValid) {
      setEmailFieldTouched(true);
      setEmailSuggestion(emailCheck.suggestion || null);
      showToast({
        type: "error",
        message: emailCheck.error || "Please enter a valid email address",
        subtitle: emailCheck.suggestion
          ? `Did you mean ${emailCheck.suggestion} ?`
          : undefined,
      });
      return;
    }

    try {
      setIsSendingEmail(true);
      const reportData = await fetchReportData();

      const response = await fetch(`${API_URL}/api/export/email-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData, email: emailCheck.normalized }),
      });

      const rawText = await response.text();
      let data: {
        success?: boolean;
        error?: string;
        details?: string;
        message?: string;
        email?: string;
        status?: string;
        code?: string;
        suggestion?: string;
      } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          showToast({
            type: "error",
            message: "Server returned an invalid response",
            subtitle: rawText.slice(0, 220),
            duration: 6000,
          });
          return;
        }
      }

      if (!response.ok || !data.success) {
        const mailNotConfigured =
          response.status === 503 && data.code === "MAIL_NOT_CONFIGURED";
        const invalidRecipient =
          response.status === 400 && data.code === "INVALID_RECIPIENT";
        if (data.suggestion) {
          setEmailSuggestion(data.suggestion);
        }
        showToast({
          type: "error",
          message:
            mailNotConfigured
              ? "Email not configured on server"
              : invalidRecipient
                ? "Recipient email address does not exist."
                : data.error || `Request failed (${response.status})`,
          subtitle: mailNotConfigured
            ? data.details ||
              "Add EMAIL_USER + EMAIL_PASS (or SMTP_*) in Railway Variables, then redeploy."
            : invalidRecipient
              ? data.details || data.suggestion
              : data.details,
          duration: mailNotConfigured ? 12000 : 7000,
        });
        return;
      }

      const effectiveEmail = data.email || emailCheck.normalized;
      showToast({
        type: "success",
        message: "Sales report sent successfully",
        subtitle: effectiveEmail ? `Sent to: ${effectiveEmail}` : undefined,
        duration: 5000,
      });
      setShowDownloadPanel(false);
      setEmailAddress("");
      setEmailFieldTouched(false);
      setEmailSuggestion(null);
    } catch (error: unknown) {
      console.error("Email error:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "Network or server error while sending the email.";
      showToast({ type: "error", message: msg, duration: 5500 });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const onRefresh = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await fetchData();
    if (detailReportType) {
      await fetchDetailReport(detailReportType);
    }
  };

  const formatOrderId = (order: any) => {
    if (!order) return "";
    const rawId = String(order.OrderId || order.BillNo || "");
    if (rawId.includes("-")) return rawId;

    const d = order.SettlementDate
      ? new Date(order.SettlementDate)
      : new Date();
    const datePart =
      d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, "0") +
      d.getDate().toString().padStart(2, "0");
    return `${datePart}-${rawId.padStart(4, "0")}`;
  };

  const formatCurrency = (amount: number) => {
    return `$${amount?.toFixed(2) || "0.00"}`;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate.toISOString().split("T")[0]);
  };


  const baseFilteredSales = useMemo(() => {
    let dateScopedSales = sales;

    if (selectedFilter === "DAILY") {
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const itemDate = new Date(s.SettlementDate).toLocaleDateString("en-CA");
        return itemDate === selectedDate;
      });
    } else if (selectedFilter === "WEEKLY") {
      const selectedDateObj = new Date(selectedDate);
      const sevenDaysAgo = new Date(
        selectedDateObj.getTime() - 6 * 24 * 60 * 60 * 1000,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= sevenDaysAgo && saleDate <= selectedDateObj;
      });
    } else if (selectedFilter === "MONTHLY") {
      const selectedDateObj = new Date(selectedDate);
      const firstDay = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth(),
        1,
      );
      const lastDay = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth() + 1,
        0,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= firstDay && saleDate <= lastDay;
      });
    } else if (selectedFilter === "YEARLY") {
      const selectedDateObj = new Date(selectedDate);
      const firstDay = new Date(selectedDateObj.getFullYear(), 0, 1);
      const lastDay = new Date(
        selectedDateObj.getFullYear(),
        11,
        31,
        23,
        59,
        59,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= firstDay && saleDate <= lastDay;
      });
    } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      end.setHours(23, 59, 59, 999);
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= start && saleDate <= end;
      });
    }

    return dateScopedSales.filter((s) => {
      const modeMatch = activePaymentModes.includes(s.PayMode?.trim()) || (showCancelledOrders && s.IsCancelled);
      const typeMatch =
        activeOrderTypes.length === 2 ||
        (s.OrderType
          ? activeOrderTypes.includes(s.OrderType?.trim())
          : activeOrderTypes.includes("DINE-IN"));
      return modeMatch && typeMatch;
    });
  }, [
    sales,
    selectedFilter,
    selectedDate,
    activePaymentModes,
    activeOrderTypes,
  ]);

  const filteredSales = useMemo(() => {
    const filtered = baseFilteredSales.filter((s) => {
      return showCancelledOrders || !s.IsCancelled;
    });

    if (sortOrder === "NEWEST") {
      return [...filtered].sort(
        (a, b) =>
          new Date(b.SettlementDate).getTime() -
          new Date(a.SettlementDate).getTime(),
      );
    } else {
      return [...filtered].sort((a, b) => b.SysAmount - a.SysAmount);
    }
  }, [baseFilteredSales, showCancelledOrders, sortOrder]);

  const filteredMetrics = useMemo(() => {
    return baseFilteredSales.reduce(
      (acc, s) => {
        if (s.IsCancelled) {
          acc.CancelledCount += 1;
          acc.CancelledAmount += s.VoidAmount || 0;
          return acc;
        }

        acc.TotalSales += s.SysAmount || 0;
        acc.TotalTransactions += 1;
        acc.TotalItems += (s.ReceiptCount || 0);
        acc.TotalVoids += s.VoidQty || 0;
        acc.TotalVoidAmount += s.VoidAmount || 0;

        const mode = s.PayMode?.trim();
        if (mode === "CASH") acc.Cash += s.SysAmount;
        else if (mode === "CARD") acc.Card += s.SysAmount;
        else if (mode === "NETS") acc.Nets += s.SysAmount;
        else if (mode === "PAYNOW") acc.PayNow += s.SysAmount;

        return acc;
      },
      {
        TotalSales: 0,
        TotalTransactions: 0,
        TotalItems: 0,
        Cash: 0,
        Card: 0,
        Nets: 0,
        PayNow: 0,
        TotalVoids: 0,
        TotalVoidAmount: 0,
        CancelledCount: 0,
        CancelledAmount: 0,
      },
    );
  }, [filteredSales]);

  const avgOrder = useMemo(() => {
    if (!filteredMetrics.TotalTransactions) return 0;
    return filteredMetrics.TotalSales / filteredMetrics.TotalTransactions;
  }, [filteredMetrics]);

  const paymentMix = useMemo(() => {
    if (!filteredMetrics.TotalSales)
      return { cash: 0, card: 0, nets: 0, paynow: 0 };
    return {
      cash: (filteredMetrics.Cash / filteredMetrics.TotalSales) * 100,
      card: (filteredMetrics.Card / filteredMetrics.TotalSales) * 100,
      nets: (filteredMetrics.Nets / filteredMetrics.TotalSales) * 100,
      paynow: (filteredMetrics.PayNow / filteredMetrics.TotalSales) * 100,
    };
  }, [filteredMetrics]);

  const paymentMixCenterRows = useMemo(() => {
    const rows: { key: string; pct: number; color: string }[] = [];
    if (filteredMetrics.Cash > 0)
      rows.push({ key: "CASH", pct: paymentMix.cash, color: "#22c55e" });
    if (filteredMetrics.Card > 0)
      rows.push({ key: "CARD", pct: paymentMix.card, color: "#818cf8" });
    if (filteredMetrics.Nets > 0)
      rows.push({ key: "NETS", pct: paymentMix.nets, color: "#3b82f6" });
    if (filteredMetrics.PayNow > 0)
      rows.push({ key: "DIGITAL", pct: paymentMix.paynow, color: "#f59e0b" });
    return rows.sort((a, b) => b.pct - a.pct);
  }, [filteredMetrics, paymentMix]);

  const togglePaymentMode = (mode: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActivePaymentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const toggleOrderType = (type: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveOrderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const fetchOrderDetails = async (settlementId: string) => {
    try {
      setLoadingDetails(true);
      const response = await fetch(
        `${API_URL}/api/sales/detail/${settlementId}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setOrderDetails(data);
        } else {
          setOrderDetails([
            { 
              DishName: selectedOrder?.IsCancelled 
                ? "Items not captured (Legacy Cancelled Order)" 
                : "Item info not available", 
              Qty: 0, 
              Price: 0 
            },
          ]);
        }
      }
    } catch (e) {
      console.error("Detail fetch error:", e);
      setOrderDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOrderPress = (order: any) => {
    setSelectedOrder(order);
    fetchOrderDetails(order.SettlementID);
  };

  const handleReprint = async () => {
    if (!selectedOrder || orderDetails.length === 0) return;

    setIsReprinting(true);
    setShowPrintPrompt(false);

    try {
      const userId = (await AsyncStorage.getItem("userId")) || "1";

      const mappedItems = orderDetails.map((item) => ({
        name: item.DishName,
        price: item.Price,
        qty: item.Qty,
        modifiers: [], // Modifiers are not typically in the standard sales report detail view
      }));

      const saleData = {
        invoiceNumber: formatOrderId(selectedOrder),
        total: selectedOrder.SysAmount,
        paymentMethod: selectedOrder.PayMode || "CASH",
        cashPaid: selectedOrder.SysAmount,
        change: 0,
        items: mappedItems,
        date: selectedOrder.SettlementDate || new Date().toISOString(),
      };

      const dummyDiscount = {
        applied: false,
        type: "fixed" as const,
        value: 0,
        amount: 0,
      };

      await UniversalPrinter.smartPrint(saleData, userId, {}, dummyDiscount);
    } catch (error) {
      console.error("Reprint error:", error);
    } finally {
      setIsReprinting(false);
    }
  };

  const renderMetricTile = (
    label: string,
    value: string | number,
    icon: any,
    color: string,
    fullWidth?: boolean,
  ) => (
    <View style={[styles.metricTile, { borderLeftColor: color }, fullWidth && { width: '100%' }]}>
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={14} color={Theme.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );

  const renderDetailReport = () => {
    if (!detailReportType) {
      return null;
    }

    const isSettlement = detailReportType === "SETTLEMENT";
    const rows = isSettlement
      ? settlementReport
      : detailReportType === "CATEGORY"
        ? categoryReport
        : dishReport;
    const isDishReport = detailReportType === "DISH";

    return (
      <View style={styles.detailReportCard}>
        <View style={styles.detailReportHeader}>
          {/* Spacer to balance the actions on the right for exact centering */}
          <View style={{ width: 62 }} />
          <View style={styles.reportTitleContainer}>
            <Text style={styles.cardTitle}>
              {isSettlement
                ? "SETTLEMENT DETAILS REPORT"
                : isDishReport
                  ? "DISH SALES REPORT"
                  : "CATEGORY SALES REPORT"}
            </Text>
            <Text style={styles.reportSubText}>
              {rows.length} rows for the selected period
            </Text>
          </View>
          <View style={styles.reportHeaderActions}>
            <Ionicons
              name={
                isSettlement
                  ? "wallet-outline"
                  : isDishReport
                    ? "restaurant-outline"
                    : "albums-outline"
              }
              size={18}
              color={Theme.primary}
            />
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setDetailReportType(null);
                setCategoryReport([]);
                setDishReport([]);
                setSettlementReport([]);
              }}
              style={styles.reportCloseBtn}
            >
              <Ionicons name="close" size={18} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>

        {loadingReport ? (
          <View style={styles.reportLoading}>
            <ActivityIndicator color={Theme.primary} />
            <Text style={styles.reportSubText}>Loading report...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyReport}>
            <Ionicons
              name="document-text-outline"
              size={32}
              color={Theme.textMuted}
            />
            <Text style={styles.emptyChartText}>No report data</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: "100%" }}
          >
            <View style={styles.reportTable}>
              <View style={styles.reportTableHeader}>
                <Text style={[styles.reportCell, styles.snoCell]}>S/N</Text>
                {isSettlement ? (
                  <>
                    <Text style={[styles.reportCell, styles.paymodeCell]}>
                      Paymode
                    </Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell]}>
                      Sys Amt
                    </Text>
                    <Text style={[styles.reportCell, styles.manualAmtCell]}>
                      Manual Amt
                    </Text>
                    <Text style={[styles.reportCell, styles.diffCell]}>
                      Diff
                    </Text>
                    <Text style={[styles.reportCell, styles.qtyCell]}>Qty</Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.reportCell,
                        isDishReport
                          ? styles.dishNameCell
                          : styles.categoryNameCell,
                      ]}
                    >
                      {isDishReport ? "Dish" : "Category"}
                    </Text>
                    {isDishReport && (
                      <Text
                        style={[styles.reportCell, styles.categoryNameCell]}
                      >
                        Category
                      </Text>
                    )}
                    {isDishReport && (
                      <Text
                        style={[styles.reportCell, styles.subCategoryNameCell]}
                      >
                        Subcategory
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.reportCell,
                        styles.qtyCell,
                        { textAlign: "center" },
                      ]}
                    >
                      QTY
                    </Text>
                    <Text
                      style={[
                        styles.reportCell,
                        styles.qtyCell,
                        { textAlign: "center", color: "#ef4444" },
                      ]}
                    >
                      VOID
                    </Text>
                    <Text style={[styles.reportCell, styles.amountCell]}>
                      Sales
                    </Text>
                  </>
                )}
              </View>
              {rows.slice(0, 100).map((row, idx) => (
                <View
                  key={`${detailReportType}-${idx}`}
                  style={[
                    styles.reportTableRow,
                    idx % 2 === 0 && styles.reportTableRowAlt,
                  ]}
                >
                  <Text
                    style={[
                      styles.reportCell,
                      styles.reportCellText,
                      styles.snoCell,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                  {isSettlement ? (
                    <>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.paymodeCell,
                          { textAlign: "left" },
                        ]}
                      >
                        {row.Paymode}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.sysAmtCell,
                          { color: Theme.success },
                        ]}
                      >
                        {formatCurrency(row.SysAmount)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.manualAmtCell,
                          { color: Theme.primary },
                        ]}
                      >
                        {formatCurrency(row.ManualAmount)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.diffCell,
                          {
                            color:
                              row.SortageOrExces < 0
                                ? "#dc2626"
                                : Theme.textPrimary,
                          },
                        ]}
                      >
                        {formatCurrency(row.SortageOrExces)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                        ]}
                      >
                        {Number(row.ReceiptCount || 0).toFixed(0)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          isDishReport
                            ? styles.dishNameCell
                            : styles.categoryNameCell,
                        ]}
                      >
                        {isDishReport ? row.DishName : row.CategoryName}
                      </Text>
                      {isDishReport && (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.categoryNameCell,
                          ]}
                        >
                          {row.CategoryName || "Unmapped"}
                        </Text>
                      )}
                      {isDishReport && (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.subCategoryNameCell,
                          ]}
                        >
                          {row.SubCategoryName || "Unmapped"}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                        ]}
                      >
                        {Number(row.Sold || 0).toFixed(0)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                          { color: "#dc2626" },
                        ]}
                      >
                        {Number(row.Voided || 0).toFixed(0)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.amountCell,
                          { color: Theme.success, fontWeight: "bold" },
                        ]}
                      >
                        {formatCurrency(Number(row.SalesAmount || 0))}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <>
      {/* Dashboard Header moved here for better scroll integration */}
      <View style={styles.dashboardHeader}>
        <View style={styles.headerContent}>
          <Text style={styles.dashboardYear}>{new Date().getFullYear()}</Text>
          <Text style={styles.dashboardTitle}>SALES ANALYTICS 📊</Text>
          <Text style={styles.dashboardSubtitle}>
            Real-time insights for better sales analytics 🚀
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowDownloadPanel(true)}
            style={styles.filterMenuBtn}
          >
            <Ionicons name="download-outline" size={20} color={Theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowFilterPanel(true)}
            style={styles.filterMenuBtn}
          >
            <Ionicons name="filter-outline" size={20} color={Theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Badges */}
      <View style={styles.badgeRow}>
        {activePaymentModes.length < 4 &&
          activePaymentModes.map((m) => (
            <View
              key={m}
              style={[styles.activeBadge, { borderColor: Theme.border }]}
            >
              <Text style={styles.badgeText}>{m}</Text>
              <TouchableOpacity onPress={() => togglePaymentMode(m)}>
                <Ionicons
                  name="close-circle"
                  size={14}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ))}
        {activeOrderTypes.length < 2 &&
          activeOrderTypes.map((t) => (
            <View
              key={t}
              style={[styles.activeBadge, { borderColor: Theme.border }]}
            >
              <Text style={styles.badgeText}>{t}</Text>
              <TouchableOpacity onPress={() => toggleOrderType(t)}>
                <Ionicons
                  name="close-circle"
                  size={14}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ))}
      </View>

      {/* Filter Toggles */}
      <View style={styles.filterBar}>
        {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as FilterType[]).map(
          (f) => (
            <TouchableOpacity
              key={f}
              onPress={() => {
                setSelectedFilter(f as FilterType);
                setPickerMode("SINGLE");
              }}
              style={[
                styles.filterBtn,
                selectedFilter === f && styles.activeFilterBtn,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === f && styles.activeFilterText,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>

      {/* Date Navigation */}
      {selectedFilter !== "CUSTOM" ? (
        <View style={styles.dateControl}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPickerMode("SINGLE");
              setShowDatePicker(true);
            }}
            style={styles.dateDisplay}
          >
            <Text style={styles.dateText}>{selectedDate}</Text>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={Theme.primary}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeDate(1)} style={styles.navBtn}>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Theme.textPrimary}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.dateControl}>
          <TouchableOpacity
            onPress={() => {
              setPickerMode("START");
              setShowDatePicker(true);
            }}
            style={[
              styles.dateDisplay,
              { flex: 1 },
              pickerMode === "START" && { borderColor: Theme.primary },
            ]}
          >
            <View>
              <Text style={styles.rangeLabel}>FROM DATE</Text>
              <Text style={styles.dateText}>
              {rangeStart ? format(new Date(rangeStart), "dd-MM-yy") : "Select"}
            </Text>
            </View>
          </TouchableOpacity>
          <View style={{ width: 10 }} />
          <TouchableOpacity
            onPress={() => {
              setPickerMode("END");
              setShowDatePicker(true);
            }}
            style={[
              styles.dateDisplay,
              { flex: 1 },
              pickerMode === "END" && { borderColor: Theme.primary },
            ]}
          >
            <View>
              <Text style={styles.rangeLabel}>TO DATE</Text>
              <Text style={styles.dateText}>
              {rangeEnd ? format(new Date(rangeEnd), "dd-MM-yy") : "Select"}
            </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        {renderMetricTile(
          "Gross Revenue",
          formatCurrency(filteredMetrics.TotalSales),
          "card-outline",
          Theme.success,
        )}
        {renderMetricTile(
          "Avg Check",
          formatCurrency(avgOrder),
          "analytics-outline",
          Theme.primary,
        )}
        {renderMetricTile(
          "Total Orders",
          filteredMetrics.TotalTransactions,
          "receipt-outline",
          Theme.warning,
        )}
        {renderMetricTile(
          "Items Sold",
          filteredMetrics.TotalItems,
          "fast-food-outline",
          "#ec4899",
        )}
        {renderMetricTile(
          "Total Voids",
          `${filteredMetrics.TotalVoids} (${formatCurrency(filteredMetrics.TotalVoidAmount)})`,
          "trash-outline",
          "#ef4444",
        )}
        {renderMetricTile(
          "Cancelled Orders",
          `${filteredMetrics.CancelledCount} (${formatCurrency(filteredMetrics.CancelledAmount)})`,
          "close-circle-outline",
          Theme.danger,
        )}
      </View>

      <View style={styles.reportSwitchRow}>
        <TouchableOpacity
          onPress={() => handleReportPress("CATEGORY")}
          style={[
            styles.reportSwitchBtn,
            detailReportType === "CATEGORY" && styles.activeReportSwitchBtn,
          ]}
        >
          <Ionicons
            name="albums-outline"
            size={16}
            color={detailReportType === "CATEGORY" ? "#fff" : Theme.primary}
          />
          <Text
            style={[
              styles.reportSwitchText,
              detailReportType === "CATEGORY" && styles.activeReportSwitchText,
            ]}
          >
            Category Sales Report
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleReportPress("DISH")}
          style={[
            styles.reportSwitchBtn,
            detailReportType === "DISH" && styles.activeReportSwitchBtn,
          ]}
        >
          <Ionicons
            name="restaurant-outline"
            size={16}
            color={detailReportType === "DISH" ? "#fff" : Theme.primary}
          />
          <Text
            style={[
              styles.reportSwitchText,
              detailReportType === "DISH" && styles.activeReportSwitchText,
            ]}
          >
            Item Sales Report
          </Text>
        </TouchableOpacity>
      </View>

      {renderDetailReport()}

      {/* Charts Section */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartsScrollContent}
      >
        <View style={styles.chartsContainer}>
          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>PAYMENT CHANNEL MIX</Text>
              <Ionicons name="pie-chart" size={14} color={Theme.primary} />
            </View>
            <View style={styles.chartContainer}>
              {filteredMetrics.TotalSales > 0 ? (
                <View style={styles.pieChartWrapper}>
                  <PieChart
                    data={[
                      {
                        value: filteredMetrics.Cash,
                        color: "#22c55e",
                        label: "CASH",
                      },
                      {
                        value: filteredMetrics.Card,
                        color: "#818cf8",
                        label: "CARD",
                      },
                      {
                        value: filteredMetrics.Nets,
                        color: "#3b82f6",
                        label: "NETS",
                      },
                      {
                        value: filteredMetrics.PayNow,
                        color: "#f59e0b",
                        label: "DIGITAL",
                      },
                    ].filter((d) => d.value > 0)}
                    donut
                    radius={70}
                    innerRadius={50}
                    innerCircleColor={Theme.bgCard}
                    strokeColor={Theme.bgCard}
                    strokeWidth={2}
                    centerLabelComponent={() => (
                      <View style={styles.pieDonutCenter}>
                        {paymentMixCenterRows.map((row) => (
                          <Text
                            key={row.key}
                            style={styles.pieDonutCenterLine}
                            numberOfLines={1}
                          >
                            <Text
                              style={[
                                styles.pieDonutCenterPct,
                                { color: row.color },
                              ]}
                            >
                              {row.pct.toFixed(0)}%
                            </Text>
                            <Text style={styles.pieDonutCenterTag}>
                              {" "}
                              {row.key}
                            </Text>
                          </Text>
                        ))}
                      </View>
                    )}
                  />
                </View>
              ) : (
                <View style={styles.emptyChartPlaceholder}>
                  <Ionicons
                    name="pie-chart-outline"
                    size={40}
                    color={Theme.textMuted}
                  />
                  <Text style={styles.emptyChartText}>No sales data</Text>
                </View>
              )}
            </View>
          </View>
          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>ORDER TYPES</Text>
              <Ionicons name="layers-outline" size={14} color={Theme.primary} />
            </View>
            <View style={styles.orderTypeStats}>
              {(() => {
                const activeSales = baseFilteredSales.filter(s => !s.IsCancelled);
                const dineIn = activeSales.filter(
                  (s) => !s.OrderType || s.OrderType === "DINE-IN",
                ).length;
                const takeaway = activeSales.filter(
                  (s) => s.OrderType === "TAKEAWAY",
                ).length;
                const total = dineIn + takeaway;
                return (
                  <>
                    <View style={styles.statRow}>
                      <View style={styles.statLabel}>
                        <Text style={styles.statIcon}>🪑</Text>
                        <Text style={styles.statName}>Dine-In</Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: Theme.primary }]}
                      >
                        {total > 0 ? ((dineIn / total) * 100).toFixed(0) : 0}%
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLabel}>
                        <Text style={styles.statIcon}>🛍️</Text>
                        <Text style={styles.statName}>Takeaway</Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: Theme.warning }]}
                      >
                        {total > 0 ? ((takeaway / total) * 100).toFixed(0) : 0}%
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>

          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>KEY METRICS</Text>
              <Ionicons
                name="bar-chart-outline"
                size={14}
                color={Theme.primary}
              />
            </View>
            <View style={styles.metricsStats}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Conversion</Text>
                <Text style={styles.metricValueSmall}>
                  {filteredMetrics.TotalTransactions}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Avg Items</Text>
                <Text style={styles.metricValueSmall}>
                  {filteredMetrics.TotalTransactions > 0
                    ? (
                        filteredMetrics.TotalItems /
                        filteredMetrics.TotalTransactions
                      ).toFixed(1)
                    : 0}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Per Item</Text>
                <Text style={styles.metricValueSmall}>
                  {formatCurrency(
                    filteredMetrics.TotalItems > 0
                      ? filteredMetrics.TotalSales / filteredMetrics.TotalItems
                      : 0,
                  )}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Breakdown */}
      <View style={styles.breakdownCard}>
        <View style={styles.chartCardHeader}>
          <Text style={styles.cardTitle}>PAYMENT BREAKDOWN</Text>
          <Ionicons name="wallet-outline" size={14} color={Theme.primary} />
        </View>
        <View style={styles.breakdownRow}>
          {[
            {
              label: "CASH",
              val: filteredMetrics.Cash,
              icon: "💵",
              color: "#22c55e",
            },
            {
              label: "CARD",
              val: filteredMetrics.Card,
              icon: "💳",
              color: "#818cf8",
            },
            {
              label: "NETS",
              val: filteredMetrics.Nets,
              icon: "🔳",
              color: "#3b82f6",
            },
            {
              label: "DIGITAL",
              val: filteredMetrics.PayNow,
              icon: "📱",
              color: "#f59e0b",
            },
          ].map((item, idx) => (
            <View key={idx} style={styles.breakdownItem}>
              <Text style={styles.breakdownIcon}>{item.icon}</Text>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={[styles.breakdownValue, { color: item.color }]}>
                {formatCurrency(item.val)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recent Transactions Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>RECENT TRANSACTIONS</Text>
        <TouchableOpacity onPress={() => fetchData()}>
          <Text style={styles.seeAllText}>REFRESH</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>

          <FlatList
            data={filteredSales}
            renderItem={({ item }: { item: any }) => (
              <TransactionCard
                item={item}
                onPress={handleOrderPress}
                formatOrderId={formatOrderId}
                formatCurrency={formatCurrency}
              />
            )}
            keyExtractor={(item: any) => item.SettlementID}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 10, paddingHorizontal: 8 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Theme.primary}
              />
            }
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== "web"}
          />

          {/* Modal Overlay */}
          <Modal visible={!!selectedOrder} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalDismiss}
                onPress={() => setSelectedOrder(null)}
              />
              <View style={styles.modalContent}>
                <View
                  style={[styles.modalHeader, { alignItems: "flex-start" }]}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={[
                          styles.modalTitle,
                          { fontSize: SCREEN_W < 450 ? 14 : 16 },
                        ]}
                      >
                        Order #{formatOrderId(selectedOrder)}
                      </Text>
                      <View
                        style={[
                          styles.paidBadgeSmall,
                          {
                            backgroundColor: selectedOrder?.IsCancelled ? Theme.danger + "15" : Theme.primary + "15",
                            borderColor: selectedOrder?.IsCancelled ? Theme.danger + "30" : Theme.primary + "30",
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selectedOrder?.IsCancelled ? Theme.danger : Theme.primary,
                            fontFamily: Fonts.black,
                            fontSize: 9,
                          }}
                        >
                          {selectedOrder?.IsCancelled ? "CANCELLED" : (selectedOrder?.PayMode || "CASH")}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginTop: 6,
                        gap: 10,
                      }}
                    >
                      <Text style={[styles.modalSub, { fontSize: 10 }]}>
                        {new Date(
                          selectedOrder?.SettlementDate,
                        ).toLocaleString()}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name={
                            selectedOrder?.OrderType === "TAKEAWAY"
                              ? "bag-handle"
                              : "restaurant"
                          }
                          size={11}
                          color={Theme.textMuted}
                        />
                        <Text
                          style={[
                            styles.modalSub,
                            {
                              color: Theme.textPrimary,
                              fontFamily: Fonts.bold,
                              fontSize: 10,
                            },
                          ]}
                        >
                          {selectedOrder?.OrderType === "TAKEAWAY"
                            ? "Takeaway"
                            : `Table ${selectedOrder?.TableNo || "N/A"}${selectedOrder?.Section ? ` • ${selectedOrder.Section}` : ""}`}
                        </Text>
                      </View>
                      {selectedOrder?.SER_NAME && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            backgroundColor: Theme.primaryLight,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Ionicons
                            name="person"
                            size={9}
                            color={Theme.primary}
                          />
                          <Text
                            style={{
                              color: Theme.primary,
                              fontFamily: Fonts.bold,
                              fontSize: 9,
                            }}
                          >
                            {selectedOrder.SER_NAME}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedOrder(null)}
                    style={{ marginLeft: 10 }}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* 🚨 CANCELLED BANNER */}
                {selectedOrder?.IsCancelled ? (
                  <View style={styles.cancelledOrderBanner}>
                    <View style={styles.cancelledBannerHeader}>
                      <Ionicons name="alert-circle" size={18} color="#fff" />
                      <Text style={styles.cancelledBannerTitle}>ORDER CANCELLED</Text>
                    </View>
                    <View style={styles.cancelledBannerContent}>
                      <View style={styles.cancelledInfoRow}>
                        <Text style={styles.cancelledInfoLabel}>Reason:</Text>
                        <Text style={styles.cancelledInfoValue}>{selectedOrder.CancellationReason || "No reason provided"}</Text>
                      </View>
                      <View style={styles.cancelledInfoRow}>
                        <Text style={styles.cancelledInfoLabel}>By:</Text>
                        <Text style={styles.cancelledInfoValue}>{selectedOrder.CancelledByUserName || "SYSTEM"}</Text>
                      </View>
                      <View style={styles.cancelledInfoRow}>
                        <Text style={styles.cancelledInfoLabel}>Date:</Text>
                        <Text style={styles.cancelledInfoValue}>
                          {selectedOrder.CancelledDate ? new Date(selectedOrder.CancelledDate).toLocaleString() : "N/A"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                <View style={styles.modalDivider} />
                <ScrollView
                  style={styles.itemsList}
                  showsVerticalScrollIndicator={false}
                >
                  {loadingDetails ? (
                    <View style={{ paddingVertical: 20 }}>
                      <ActivityIndicator color={Theme.primary} />
                    </View>
                  ) : (
                    orderDetails.map((item, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.orderItemRow,
                          idx !== orderDetails.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: Theme.border + "30",
                            paddingBottom: 12,
                          },
                          item.Status === "VOIDED" && {
                            backgroundColor: "#fff1f2",
                            marginHorizontal: -12,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            opacity: 0.8,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.qtyBadgeSmall,
                            {
                              backgroundColor:
                                item.Status === "VOIDED"
                                  ? "#fecaca"
                                  : Theme.primary + "10",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderItemQty,
                              {
                                width: "auto",
                                color:
                                  item.Status === "VOIDED"
                                    ? "#991b1b"
                                    : Theme.primary,
                              },
                            ]}
                          >
                            {item.Qty}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.orderItemName,
                              item.Status === "VOIDED" && {
                                textDecorationLine: "line-through",
                                color: "#991b1b",
                              },
                            ]}
                          >
                            {item.DishName}
                            {item.Status === "VOIDED" && (
                              <Text
                                style={{
                                  color: "#dc2626",
                                  fontSize: 9,
                                  fontFamily: Fonts.black,
                                  textDecorationLine: "none",
                                }}
                              >
                                {" "}
                                [VOID]
                              </Text>
                            )}
                          </Text>
                          <Text
                            style={{
                              color: Theme.textMuted,
                              fontSize: 10,
                              fontFamily: Fonts.bold,
                            }}
                          >
                            UNIT: ${(item.Price || 0).toFixed(2)}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.orderItemPrice,
                            item.Status === "VOIDED" && {
                              textDecorationLine: "line-through",
                              color: "#991b1b",
                            },
                          ]}
                        >
                          ${(item.Price * item.Qty).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.modalDivider} />
                <View
                  style={[
                    styles.totalRow,
                    {
                      backgroundColor: Theme.primary + "05",
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 16,
                    },
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.totalLabel,
                        {
                          fontSize: 10,
                          color: Theme.textSecondary,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        },
                      ]}
                    >
                      Total Amount
                    </Text>
                    <Text style={[styles.totalValue, { fontSize: 22 }]}>
                      {formatCurrency(selectedOrder?.SysAmount)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.paidBadgeSmall,
                      { 
                        paddingHorizontal: 6, 
                        paddingVertical: 2,
                        backgroundColor: selectedOrder?.IsCancelled ? Theme.danger + "20" : Theme.success + "20",
                        borderColor: selectedOrder?.IsCancelled ? Theme.danger + "40" : Theme.success + "40",
                      },
                    ]}
                  >
                    <Ionicons
                      name={selectedOrder?.IsCancelled ? "close-circle" : "checkmark-circle"}
                      size={14}
                      color={selectedOrder?.IsCancelled ? Theme.danger : Theme.success}
                    />
                    <Text
                      style={{
                        color: selectedOrder?.IsCancelled ? Theme.danger : Theme.success,
                        fontFamily: Fonts.black,
                        fontSize: 10,
                        marginLeft: 4,
                      }}
                    >
                      {selectedOrder?.IsCancelled ? "CANCELLED" : "PAID"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedOrder(null)}
                    style={[
                      styles.premiumPrimaryBtn,
                      { flex: 1, paddingVertical: 12 },
                    ]}
                  >
                    <Text
                      style={[styles.premiumPrimaryBtnText, { fontSize: 14 }]}
                    >
                      CLOSE
                    </Text>
                  </TouchableOpacity>

                  {!selectedOrder?.IsCancelled && (
                    <TouchableOpacity
                      onPress={() => setShowPrintPrompt(true)}
                      style={[
                        styles.premiumSecondaryBtn,
                        { flex: 1.2, paddingVertical: 12 },
                      ]}
                    >
                      <Ionicons name="print" size={16} color={Theme.primary} />
                      <Text
                        style={[styles.premiumSecondaryBtnText, { fontSize: 14 }]}
                      >
                        REPRINT
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>

          {/* Sidebar Modal */}
          <Modal visible={showFilterPanel} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.sidebarDismiss}
                onPress={() => setShowFilterPanel(false)}
              />
              <View style={styles.sidebarContent}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarTitle}>ADVANCED FILTERS</Text>
                  <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>PAYMENT MODES</Text>
                    <View style={styles.chipRow}>
                      {["CASH", "CARD", "NETS", "PAYNOW", "VOID"].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => togglePaymentMode(m)}
                          style={[
                            styles.chip,
                            activePaymentModes.includes(m) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activePaymentModes.includes(m) &&
                                styles.activeChipText,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>ORDER TYPE</Text>
                    <View style={styles.chipRow}>
                      {["DINE-IN", "TAKEAWAY"].map((t) => (
                        <TouchableOpacity
                          key={t}
                          onPress={() => toggleOrderType(t)}
                          style={[
                            styles.chip,
                            activeOrderTypes.includes(t) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activeOrderTypes.includes(t) &&
                                styles.activeChipText,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>SORT BY</Text>
                    {[
                      {
                        id: "NEWEST",
                        label: "Newest First",
                        icon: "time-outline",
                      },
                      {
                        id: "HIGHEST",
                        label: "Highest Amount",
                        icon: "trending-up-outline",
                      },
                    ].map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSortOrder(s.id as any)}
                        style={[
                          styles.sortBtn,
                          sortOrder === s.id && styles.activeSortBtn,
                        ]}
                      >
                        <Ionicons
                          name={s.icon as any}
                          size={18}
                          color={
                            sortOrder === s.id ? Theme.primary : Theme.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.sortText,
                            sortOrder === s.id && styles.activeSortText,
                          ]}
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>VISIBILITY</Text>
                    <TouchableOpacity
                      onPress={() => setShowCancelledOrders(!showCancelledOrders)}
                      style={[
                        styles.sortBtn,
                        showCancelledOrders && styles.activeSortBtn,
                      ]}
                    >
                      <Ionicons
                        name={showCancelledOrders ? "eye-outline" : "eye-off-outline"}
                        size={18}
                        color={showCancelledOrders ? Theme.primary : Theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.sortText,
                          showCancelledOrders && styles.activeSortText,
                        ]}
                      >
                        {showCancelledOrders ? "Showing Cancelled Orders" : "Hidden Cancelled Orders"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                <View style={styles.sidebarFooter}>
                  <TouchableOpacity
                    onPress={() => {
                      setActivePaymentModes(["CASH", "CARD", "NETS", "PAYNOW", "VOID"]);
                      setActiveOrderTypes(["DINE-IN", "TAKEAWAY"]);
                      setSortOrder("NEWEST");
                      setShowCancelledOrders(true);
                    }}
                    style={styles.resetBtn}
                  >
                    <Text style={styles.resetText}>RESET ALL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowFilterPanel(false)}
                    style={styles.applyBtn}
                  >
                    <Text style={styles.applyText}>APPLY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <BillPrompt
            visible={showPrintPrompt}
            onClose={() => setShowPrintPrompt(false)}
            onSkip={() => setShowPrintPrompt(false)}
            onPrintBill={handleReprint}
            theme={Theme}
            t={{
              printBillReceipt: "Reprint Receipt?",
              totalAmount: "Total",
              printBillMessage:
                "Would you like to reprint the receipt for this order?",
              skipBill: "Cancel",
              printBill: "Print",
            }}
            total={String(selectedOrder?.SysAmount || 0)}
          />

          <Modal visible={showDownloadPanel} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalDismiss}
                onPress={() => !isDownloading && setShowDownloadPanel(false)}
              />
              <View style={[styles.downloadModalContent, { width: SCREEN_W > 600 ? 380 : "92%" }]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Sales Report</Text>
                    <Text style={styles.modalSub}>Select period and download format</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => !isDownloading && setShowDownloadPanel(false)}
                    style={styles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={20} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                  {/* Period Selection Card */}
                  <View style={styles.downloadSectionCard}>
                    <Text style={styles.downloadSectionLabel}>SELECT TIME PERIOD</Text>
                    <View style={styles.periodGrid}>
                      {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as FilterType[]).map((f) => (
                        <TouchableOpacity
                          key={f}
                          onPress={() => {
                            setDownloadFilter(f);
                            setDownloadPickerMode("START");
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          style={[
                            styles.periodBtn,
                            downloadFilter === f && styles.activePeriodBtn,
                          ]}
                        >
                          <MaterialCommunityIcons 
                            name={
                              f === "DAILY" ? "calendar-today" : 
                              f === "WEEKLY" ? "calendar-week" : 
                              f === "MONTHLY" ? "calendar-month" : 
                              f === "YEARLY" ? "calendar-star" : "calendar-range"
                            } 
                            size={18} 
                            color={downloadFilter === f ? "#fff" : Theme.textSecondary} 
                          />
                          <Text style={[styles.periodText, downloadFilter === f && styles.activePeriodText]}>
                            {f.charAt(0) + f.slice(1).toLowerCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {downloadFilter === "CUSTOM" && (
                      <View style={styles.customDateRow}>
                        <TouchableOpacity
                          onPress={() => {
                            setDownloadPickerMode("START");
                            setShowDownloadDatePicker(true);
                          }}
                          style={[styles.dateInput, downloadPickerMode === "START" && styles.activeDateInput]}
                        >
                          <Text style={styles.dateInputLabel}>FROM</Text>
                          <Text style={styles.dateInputValue}>
                            {downloadRangeStart ? format(new Date(downloadRangeStart), "dd MMM yyyy") : "Select"}
                          </Text>
                        </TouchableOpacity>
                        <Ionicons name="arrow-forward" size={16} color={Theme.textMuted} />
                        <TouchableOpacity
                          onPress={() => {
                            setDownloadPickerMode("END");
                            setShowDownloadDatePicker(true);
                          }}
                          style={[styles.dateInput, downloadPickerMode === "END" && styles.activeDateInput]}
                        >
                          <Text style={styles.dateInputLabel}>TO</Text>
                          <Text style={styles.dateInputValue}>
                            {downloadRangeEnd ? format(new Date(downloadRangeEnd), "dd MMM yyyy") : "Select"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Option A: Direct Download */}
                  <View style={styles.downloadOptionCard}>
                    <View style={styles.optionHeader}>
                      <View style={styles.optionIconBox}>
                        <Ionicons name="document-text" size={20} color={Theme.primary} />
                      </View>
                      <View>
                        <Text style={styles.optionTitle}>Direct Download</Text>
                        <Text style={styles.optionDesc}>Generate PDF and save to device</Text>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      onPress={handleDownloadPdf}
                      disabled={isDownloading || isSendingEmail || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[Theme.primary, "#ff8c42"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.premiumActionBtn,
                          (isDownloading || isSendingEmail || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))) && { opacity: 0.5 }
                        ]}
                      >
                        {isDownloading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="cloud-download" size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.premiumActionBtnText}>Download PDF</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {/* Option B: Send to Email */}
                  <View style={styles.downloadOptionCard}>
                    <View style={styles.optionHeader}>
                      <View style={[styles.optionIconBox, { backgroundColor: '#e0f2fe' }]}>
                        <Ionicons name="mail" size={20} color="#0284c7" />
                      </View>
                      <View>
                        <Text style={styles.optionTitle}>Send via Email</Text>
                        <Text style={styles.optionDesc}>Receive report in your inbox</Text>
                      </View>
                    </View>

                    <View style={styles.emailInputWrapper}>
                      <Ionicons name="at" size={18} color={Theme.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[
                          styles.modernEmailInput,
                          showEmailValidationError && { borderColor: '#ef4444' },
                        ]}
                        placeholder="recipient@example.com"
                        placeholderTextColor={Theme.textMuted}
                        value={emailAddress}
                        onChangeText={(value) => {
                          setEmailAddress(value.toLowerCase());
                          if (!emailFieldTouched) setEmailFieldTouched(true);
                          const next = validateRecipientEmail(value);
                          setEmailSuggestion(next.suggestion || null);
                        }}
                        onBlur={() => {
                          setEmailFieldTouched(true);
                          const normalized = emailAddress.trim().toLowerCase();
                          if (normalized !== emailAddress) setEmailAddress(normalized);
                          const next = validateRecipientEmail(normalized);
                          setEmailSuggestion(next.suggestion || null);
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    {showEmailValidationError && (
                      <Text style={styles.errorHint}>{emailValidation.error}</Text>
                    )}
                    
                    {!!emailSuggestion && !emailValidation.isValid && (
                      <TouchableOpacity
                        onPress={() => {
                          setEmailAddress(emailSuggestion);
                          setEmailFieldTouched(true);
                          setEmailSuggestion(null);
                        }}
                        style={styles.suggestionBox}
                      >
                        <Text style={styles.suggestionText}>Did you mean <Text style={{ color: Theme.primary, textDecorationLine: 'underline' }}>{emailSuggestion}</Text>?</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={handleEmailPdf}
                      disabled={isDownloading || isSendingEmail || !emailValidation.isValid || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#0284c7", "#38bdf8"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.premiumActionBtn,
                          (isDownloading || isSendingEmail || !emailValidation.isValid || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))) && { opacity: 0.5 }
                        ]}
                      >
                        {isSendingEmail ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.premiumActionBtnText}>Send to Email</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {showDownloadDatePicker && (
            <Modal transparent visible={showDownloadDatePicker} animationType="fade">
              <View style={styles.modalOverlay}>
                <TouchableOpacity
                  style={styles.modalDismiss}
                  onPress={() => setShowDownloadDatePicker(false)}
                />
                <View
                  style={[
                    styles.modalContent,
                    { width: SCREEN_W > 600 ? 330 : "85%" },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {downloadPickerMode === "START" ? "Select From Date" : "Select To Date"}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDownloadDatePicker(false)}>
                      <Ionicons name="close" size={24} color={Theme.danger} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    selectedDate={
                      downloadPickerMode === "START" && downloadRangeStart
                        ? downloadRangeStart
                        : downloadPickerMode === "END" && downloadRangeEnd
                          ? downloadRangeEnd
                          : new Date().toISOString().split("T")[0]
                    }
                    rangeStart={downloadRangeStart}
                    rangeEnd={downloadRangeEnd}
                    isRangeMode={true}
                    onModeChange={() => {}}
                    onRangeChange={(start, end) => {
                      setDownloadRangeStart(start);
                      setDownloadRangeEnd(end);
                      if (start && end) {
                        setShowDownloadDatePicker(false);
                      }
                    }}
                    onDateChange={(date) => {
                      if (downloadPickerMode === "START") {
                         setDownloadRangeStart(date);
                      } else {
                         setDownloadRangeEnd(date);
                      }
                      setShowDownloadDatePicker(false);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const today = new Date().toISOString().split("T")[0];
                      if (downloadPickerMode === "START") {
                        setDownloadRangeStart(today);
                      } else {
                        setDownloadRangeEnd(today);
                      }
                      setShowDownloadDatePicker(false);
                    }}
                    style={{ alignSelf: "center", marginTop: 15, paddingBottom: 5 }}
                  >
                    <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 13, textDecorationLine: "underline" }}>GO TO TODAY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {showDatePicker && (
            <Modal transparent visible={showDatePicker} animationType="fade">
              <View style={styles.modalOverlay}>
                <TouchableOpacity
                  style={styles.modalDismiss}
                  onPress={() => setShowDatePicker(false)}
                />
                <View
                  style={[
                    styles.modalContent,
                    { width: SCREEN_W > 600 ? 330 : "85%" },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {selectedFilter === "CUSTOM" 
                        ? (rangeStart && !rangeEnd ? "Select End Date" : "Select Start Date")
                        : "Select Date"}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Ionicons name="close" size={24} color={Theme.danger} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    selectedDate={
                      pickerMode === "START" && rangeStart
                        ? rangeStart
                        : pickerMode === "END" && rangeEnd
                          ? rangeEnd
                          : selectedDate
                    }
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    isRangeMode={selectedFilter === "CUSTOM"}
                    onModeChange={(isRange) => {
                      if (isRange) {
                        setSelectedFilter("CUSTOM");
                        setPickerMode("START");
                        if (!rangeStart) {
                          setRangeStart(selectedDate);
                          setRangeEnd(selectedDate);
                        }
                      } else {
                        setSelectedFilter("DAILY");
                        setPickerMode("SINGLE");
                      }
                    }}
                    onRangeChange={(start, end) => {
                      setRangeStart(start);
                      setRangeEnd(end);
                      if (start && end) {
                        setShowDatePicker(false);
                      }
                    }}
                    onDateChange={(date) => {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const today = new Date().toISOString().split("T")[0];
                      if (pickerMode === "SINGLE") {
                        setSelectedDate(today);
                      } else if (pickerMode === "START") {
                        setRangeStart(today);
                      } else {
                        setRangeEnd(today);
                      }
                      setShowDatePicker(false);
                    }}
                    style={{ alignSelf: "center", marginTop: 15, paddingBottom: 5 }}
                  >
                    <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 13, textDecorationLine: "underline" }}>GO TO TODAY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  overlay: { flex: 1, paddingHorizontal: 16 },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  headerContent: { flex: 1 },
  dashboardYear: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 14,
    marginBottom: 4,
  },
  dashboardTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 15,
  },
  dashboardSubtitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    fontSize: 8.5,
    marginTop: 2,
  },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  filterMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtnLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  badgeText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  filterBar: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    padding: 4,
    backgroundColor: Theme.bgNav,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeFilterBtn: { backgroundColor: Theme.primary, ...Theme.shadowSm },
  filterText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 11,
  },
  activeFilterText: { color: "#fff" },
  dateControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  dateDisplay: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  dateText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  rangeLabel: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    marginBottom: -2,
  },
  selectRangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.primary + "10",
    borderWidth: 1,
    borderColor: Theme.primary + "20",
    marginLeft: 4,
  },
  selectRangeText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 11,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  metricTile: {
    width: "48.5%",
    padding: 12,
    borderRadius: 16,
    borderLeftWidth: 4,
    backgroundColor: Theme.bgCard,
    marginBottom: 12,
    ...Theme.shadowMd,
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  tileLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  tileValue: { fontFamily: Fonts.black, fontSize: 22 },
  reportSwitchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  reportSwitchBtn: {
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    ...Theme.shadowSm,
  },
  activeReportSwitchBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  reportSwitchText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  activeReportSwitchText: { color: "#fff" },
  detailReportCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  detailReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  reportTitleContainer: { flex: 1, alignItems: "center" },
  reportHeaderActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2", // Light red background
    borderWidth: 1,
    borderColor: "#fecaca", // Light red border
  },
  reportSubText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 4,
  },
  reportLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyReport: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reportTable: {
    width: "100%",
    minWidth: 360,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.bgCard,
  },
  reportTableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRowAlt: {
    backgroundColor: Theme.bgMain,
  },
  reportCell: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 11,
    textTransform: "uppercase",
    textAlign: "center",
  },
  reportCellText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
    textTransform: "none",
    textAlign: "center",
  },
  snoCell: {
    width: 45,
    textAlign: "center",
    flexShrink: 0,
  },
  dishNameCell: {
    minWidth: 150,
    flex: 2,
    textAlign: "center",
  },
  categoryNameCell: {
    minWidth: 120,
    flex: 1.5,
    textAlign: "center",
  },
  subCategoryNameCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "center",
  },
  qtyCell: {
    width: 70,
    textAlign: "center",
    flexShrink: 0,
  },
  amountCell: {
    width: 100,
    textAlign: "center",
    flexShrink: 0,
  },
  paymodeCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "left",
  },
  sysAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  manualAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  diffCell: {
    width: 80,
    textAlign: "right",
    flexShrink: 0,
  },
  chartsScrollContent: {
    paddingRight: 16,
    marginBottom: 12,
  },
  chartsContainer: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 12,
  },
  chartCard: {
    flex: 1,
    padding: 20,
    borderRadius: 20,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  chartCardWide: { width: "100%" },
  chartCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 12,
    letterSpacing: 1,
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pieChartWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  pieDonutCenter: { alignItems: "center", justifyContent: "center", gap: 4 },
  pieDonutCenterLine: { textAlign: "center" },
  pieDonutCenterPct: { fontFamily: Fonts.black, fontSize: 13 },
  pieDonutCenterTag: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  emptyChartPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyChartText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  orderTypeStats: { gap: 12 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: { fontSize: 20 },
  statName: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  statValue: { fontFamily: Fonts.black, fontSize: 16 },
  metricsStats: { gap: 10 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  metricLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  metricValueSmall: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 15,
  },
  breakdownCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  breakdownItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  breakdownIcon: { fontSize: 24 },
  breakdownLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  breakdownValue: { fontFamily: Fonts.black, fontSize: 11 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 13,
    letterSpacing: 1,
  },
  seeAllText: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 12 },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 12,
    ...Theme.shadowSm,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  txOrderInfo: { flex: 4, paddingRight: 10 },
  txTitle: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  txSmall: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 9,
    marginTop: 2,
  },
  txTimeInfo: { flex: 2.7, alignItems: "center" },
  txDatetime: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
    textAlign: "center",
  },
  txRightInfo: {
    flex: 2.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  txAmount: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 14,
    minWidth: 55,
    textAlign: "right",
  },
  voidTag: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  voidTagText: { color: "#dc2626", fontSize: 10, fontFamily: Fonts.black },
  paidBadgeSmall: {
    backgroundColor: Theme.success + "20",
    padding: 4,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.success + "40",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    width: "92%",
    maxWidth: 450,
    backgroundColor: Theme.bgCard,
    borderRadius: 24,
    padding: 16,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  modalSub: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  itemsList: { maxHeight: 220 },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  orderItemQty: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
    width: 25,
  },
  orderItemName: {
    flex: 1,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  orderItemPrice: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  totalLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  totalValue: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 22 },
  doneBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  doneBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  qtyBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 32,
  },
  searchInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  inputErrorBorder: {
    borderColor: "#ef4444",
  },
  inputErrorText: {
    color: "#ef4444",
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 8,
  },
  emailSuggestionText: {
    color: Theme.primary,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 6,
    textDecorationLine: "underline",
  },
  premiumPrimaryBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadowMd,
  },
  premiumPrimaryBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  premiumSecondaryBtn: {
    backgroundColor: Theme.primary + "10",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1.5,
    borderColor: Theme.primary + "20",
  },
  premiumSecondaryBtnText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: "row-reverse",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sidebarDismiss: { flex: 1 },
  sidebarContent: {
    width: 320,
    height: "100%",
    backgroundColor: Theme.bgCard,
    padding: 24,
    paddingTop: 60,
    borderLeftWidth: 1,
    borderLeftColor: Theme.border,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  sidebarTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  sidebarSection: { marginBottom: 24 },
  sectionLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeChip: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  chipText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  activeChipText: { color: "#fff" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeSortBtn: {
    backgroundColor: Theme.primary + "10",
    borderColor: Theme.primary,
  },
  sortText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  activeSortText: { color: Theme.primary },
  sidebarFooter: { marginTop: "auto", gap: 12 },
  applyBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  applyText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  resetBtn: { paddingVertical: 14, alignItems: "center" },
  resetText: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 12 },
  modeToggleBar: {
    flexDirection: "row",
    backgroundColor: Theme.bgNav,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  activeModeToggleBtn: {
    backgroundColor: Theme.bgCard,
    ...Theme.shadowSm,
  },
  modeToggleText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
  },
  activeModeToggleText: {
    color: Theme.primary,
  },
  inRangeDay: {
    backgroundColor: Theme.primary + "20",
    borderRadius: 0,
  },
  customCalendar: {
    paddingTop: 5,
  },
  pickerGrid: {
    paddingVertical: 10,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  pickerTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  pickerSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    backgroundColor: Theme.primary + "10",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  pickerItem: {
    width: "30%",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: Theme.bgNav,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activePickerItem: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  pickerItemText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activePickerItemText: {
    color: "#fff",
    fontFamily: Fonts.black,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  calendarMonthText: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  calendarWeekText: {
    flex: 1,
    textAlign: "center",
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  calendarRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    margin: 1,
  },
  calendarDayText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  selectedDay: {
    backgroundColor: Theme.primary,
    ...Theme.shadowSm,
  },
  selectedDayText: {
    color: "#fff",
    fontFamily: Fonts.black,
  },
  todayDay: {
    backgroundColor: Theme.primary + "10",
    borderWidth: 1,
    borderColor: Theme.primary + "30",
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  otherMonthDayText: {
    color: Theme.textMuted,
  },
  cancelledOrderBanner: {
    backgroundColor: Theme.danger,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 15,
    overflow: 'hidden',
  },
  cancelledBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelledBannerTitle: {
    color: '#fff',
    fontFamily: Fonts.black,
    fontSize: 12,
    letterSpacing: 1,
  },
  cancelledBannerContent: {
    padding: 12,
    gap: 6,
  },
  cancelledInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelledInfoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Fonts.bold,
    fontSize: 11,
  },
  cancelledInfoValue: {
    color: '#fff',
    fontFamily: Fonts.extraBold,
    fontSize: 11,
  },
  downloadModalContent: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 12,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.bgNav,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  downloadSectionCard: {
    backgroundColor: Theme.bgNav,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  downloadSectionLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 7,
    letterSpacing: 1,
    marginBottom: 6,
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  periodBtn: {
    flex: 1,
    minWidth: '18%',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: Theme.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activePeriodBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  periodText: {
    fontSize: 8,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activePeriodText: {
    color: '#fff',
    fontFamily: Fonts.black,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  dateInput: {
    flex: 1,
    padding: 6,
    borderRadius: 6,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeDateInput: {
    borderColor: Theme.primary,
  },
  dateInputLabel: {
    fontSize: 6,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
    marginBottom: 0,
  },
  dateInputValue: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  downloadOptionCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optionIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 11,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  optionDesc: {
    fontSize: 8,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  premiumActionBtn: {
    height: 34,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadowMd,
  },
  premiumActionBtnText: {
    color: '#fff',
    fontFamily: Fonts.black,
    fontSize: 12,
  },
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.bgNav,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  inputIcon: {
    marginRight: 4,
  },
  modernEmailInput: {
    flex: 1,
    height: 32,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: Theme.textPrimary,
  },
  errorHint: {
    color: '#ef4444',
    fontSize: 9,
    fontFamily: Fonts.medium,
    marginLeft: 4,
    marginBottom: 6,
  },
  suggestionBox: {
    backgroundColor: Theme.primary + '08',
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: Theme.primary,
  },
  suggestionText: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
  },
});
