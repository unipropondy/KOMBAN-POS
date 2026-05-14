import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Theme } from "@/constants/theme";
import { Fonts } from "@/constants/Fonts";
import { API_URL } from "@/constants/Config";
import { useAuthStore } from "@/stores/authStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  startOfYear, 
  endOfYear,
  subDays 
} from "date-fns";

export default function DayEndScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [selectedFilter, setSelectedFilter] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM">("DAILY");
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    fetchDaySummary();
    
    // Auto-update date if the day changes while the app is open
    const interval = setInterval(() => {
      const now = new Date().toISOString().split("T")[0];
      if (now !== dateRange.start && selectedFilter === "DAILY") {
        setDateRange({ start: now, end: now });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [dateRange, selectedFilter]);

  const fetchDaySummary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sales/day-end-summary?startDate=${dateRange.start}&endDate=${dateRange.end}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to fetch summary");
    } finally {
      setLoading(false);
    }
  };

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const onDateChange = (event: any, selectedDate?: Date, type: "start" | "end" = "start") => {
    if (type === "start") {
      setShowStartPicker(false);
      if (selectedDate) {
        setDateRange(prev => ({ ...prev, start: format(selectedDate, "yyyy-MM-dd") }));
      }
    } else {
      setShowEndPicker(false);
      if (selectedDate) {
        setDateRange(prev => ({ ...prev, end: format(selectedDate, "yyyy-MM-dd") }));
      }
    }
  };

  const handleFilterChange = (filter: typeof selectedFilter) => {
    setSelectedFilter(filter);
    const today = new Date();
    let start = today;
    let end = today;

    if (filter === "DAILY") {
      start = today;
      end = today;
    } else if (filter === "WEEKLY") {
      start = startOfWeek(today);
      end = endOfWeek(today);
    } else if (filter === "MONTHLY") {
      start = startOfMonth(today);
      end = endOfMonth(today);
    } else if (filter === "YEARLY") {
      start = startOfYear(today);
      end = endOfYear(today);
    }

    if (filter !== "CUSTOM") {
      setDateRange({
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleDayEnd = () => {
    Alert.alert(
      "Confirm Day End",
      "Are you sure you want to close the day? This will finalize all transactions and prepare for the next business day.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          style: "destructive",
          onPress: () => {
            // Logic for Day End would go here (e.g. archiving or resetting)
            Alert.alert("Success", "Day ended successfully. Report generated.");
            router.replace("/login");
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Theme.primary} />
        <Text style={{ marginTop: 10, fontFamily: Fonts.medium, color: Theme.textSecondary }}>Fetching Summary...</Text>
      </View>
    );
  }

  const analysis = data?.salesAnalysis;
  const paymodes = data?.paymodeDetail || [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Day End Report</Text>
            {(data?.terminalCode || data?.refNo) && (
              <Text style={styles.headerSubtitle}>
                {data.terminalCode ? `Terminal: ${data.terminalCode}` : ""}
                {data.terminalCode && data.refNo ? "  •  " : ""}
                {data.refNo ? `Ref: ${data.refNo}` : ""}
              </Text>
            )}
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, selectedFilter === f && styles.filterBtnActive]}
                onPress={() => handleFilterChange(f)}
              >
                <Text style={[styles.filterBtnText, selectedFilter === f && styles.filterBtnTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedFilter === "CUSTOM" && (
            <View style={styles.customDateContainer}>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
                <Text style={styles.dateInputLabel}>From:</Text>
                <Text style={styles.dateInputValue}>{dateRange.start}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
                <Text style={styles.dateInputLabel}>To:</Text>
                <Text style={styles.dateInputValue}>{dateRange.end}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.dateDisplay}>
            <Ionicons name="calendar-outline" size={16} color={Theme.textSecondary} />
            <Text style={styles.dateDisplayText}>
              {dateRange.start === dateRange.end 
                ? format(new Date(dateRange.start), "dd MMM yyyy")
                : `${format(new Date(dateRange.start), "dd MMM")} - ${format(new Date(dateRange.end), "dd MMM yyyy")}`
              }
            </Text>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={new Date(dateRange.start)}
              mode="date"
              onChange={(e: any, d?: Date) => onDateChange(e, d, "start")}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={new Date(dateRange.end)}
              mode="date"
              onChange={(e: any, d?: Date) => onDateChange(e, d, "end")}
            />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Sales</Text>
              <Text style={styles.statValue}>{formatCurrency(analysis?.totalSales || 0)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Bills</Text>
              <Text style={styles.statValue}>{analysis?.billCount || 0}</Text>
            </View>
          </View>

          {/* Paymode Detail Table */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="credit-card-outline" size={20} color={Theme.primary} />
              <Text style={styles.sectionTitle}>Paymode Detail</Text>
            </View>
            
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Particulars</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Qty</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: "right" }]}>Amount</Text>
            </View>

            {paymodes.length > 0 ? (
              paymodes.map((pm: any, idx: number) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCellText, { flex: 2, fontFamily: Fonts.bold }]}>{pm.Paymode}</Text>
                  <Text style={[styles.tableCellText, { flex: 1, textAlign: "center" }]}>{pm.Count}</Text>
                  <Text style={[styles.tableCellText, { flex: 1.5, textAlign: "right", color: Theme.success }]}>
                    {formatCurrency(pm.Amount)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No transactions yet</Text>
            )}
            
            <View style={styles.tableFooter}>
              <Text style={[styles.footerText, { flex: 2 }]}>Total</Text>
              <Text style={[styles.footerText, { flex: 1, textAlign: "center" }]}>
                {paymodes.reduce((acc: number, curr: any) => acc + curr.Count, 0)}
              </Text>
              <Text style={[styles.footerText, { flex: 1.5, textAlign: "right" }]}>
                {formatCurrency(paymodes.reduce((acc: number, curr: any) => acc + curr.Amount, 0))}
              </Text>
            </View>
          </View>

          {/* Settlement Detail Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="bank-outline" size={20} color={Theme.primary} />
              <Text style={styles.sectionTitle}>Settlement Detail</Text>
            </View>
            
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Cash Total</Text>
              <Text style={styles.analysisValue}>{formatCurrency(data?.settlementDetail?.cashTotal || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Other Total</Text>
              <Text style={styles.analysisValue}>{formatCurrency(data?.settlementDetail?.otherTotal || 0)}</Text>
            </View>
          </View>

          {/* Analysis Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="chart-line" size={20} color={Theme.primary} />
              <Text style={styles.sectionTitle}>Analysis</Text>
            </View>
            
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Sales Amount</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.totalSales || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Total Tax</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.totalTax || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Discount</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.totalDiscount || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Service Charge</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.totalServiceCharge || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Round Off</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.roundOff || 0)}</Text>
            </View>
            <View style={[styles.analysisRow, { borderTopWidth: 1, borderTopColor: Theme.border, paddingTop: 8, marginTop: 4 }]}>
              <Text style={[styles.analysisLabel, { fontFamily: Fonts.black, color: Theme.primary }]}>Net Total</Text>
              <Text style={[styles.analysisValue, { fontFamily: Fonts.black, color: Theme.primary }]}>{formatCurrency(analysis?.netTotal || 0)}</Text>
            </View>
            <View style={[styles.analysisRow, { marginTop: 12 }]}>
              <Text style={styles.analysisLabel}>No of Bills</Text>
              <Text style={styles.analysisValue}>{analysis?.billCount || 0}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Avg/Bill</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.avgPerBill || 0)}</Text>
            </View>
          </View>

          {/* Void Detail Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="close-circle-outline" size={20} color="#ff4444" />
              <Text style={styles.sectionTitle}>Void Detail</Text>
            </View>
            
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Void Item Qty</Text>
              <Text style={[styles.analysisValue, { color: "#ff4444" }]}>{data?.voidDetail?.voidQty || 0}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Void Item Amount</Text>
              <Text style={[styles.analysisValue, { color: "#ff4444" }]}>{formatCurrency(data?.voidDetail?.voidAmount || 0)}</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  headerSubtitle: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  filterContainer: {
    backgroundColor: Theme.bgCard,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  filterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  filterBtnTextActive: {
    color: "#fff",
  },
  customDateContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  dateInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  dateInputLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
  },
  dateInputValue: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  dateDisplayText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: Theme.bgCard,
    padding: 16,
    borderRadius: 16,
    ...Theme.shadowSm,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  sectionCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 16,
    ...Theme.shadowSm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.border,
  },
  tableCellText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  tableFooter: {
    flexDirection: "row",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: Theme.border,
  },
  footerText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  analysisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.border,
  },
  analysisLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  analysisValue: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  actionBtn: {
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 16,
    marginTop: 10,
    ...Theme.shadowMd,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: Fonts.black,
  },
  infoText: {
    textAlign: "center",
    color: Theme.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
});
