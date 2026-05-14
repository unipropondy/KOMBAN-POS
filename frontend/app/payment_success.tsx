import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";
import BillPrompt from "../components/BillPrompt";
import UniversalPrinter from "../components/UniversalPrinter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCompanySettingsStore } from "../stores/companySettingsStore";

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

export default function PaymentSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const settings = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settings.currencySymbol || "$";

  const total = String(params.total ?? "0");
  const paid = String(params.paidNum ?? "0");
  const change = String(params.change ?? "0");

  const orderId = String(params.orderId ?? "");
  const tableNo = String(params.tableNo ?? "");
  const section = String(params.section ?? "");
  const orderType = String(params.orderType ?? "");
  const method = String(params.method ?? "");
  const discountInfoRaw = String(params.discountInfo ?? "{}");
  const itemsRaw = String(params.items ?? "[]");
  const roundOff = String(params.roundOff ?? "0");
  const waiterName = String(params.waiterName ?? "");

  const [promptVisible, setPromptVisible] = React.useState(true);

  React.useEffect(() => {
    // Clear cart and context on success screen mount
    const cleanup = async () => {
      try {
        const { clearCart } = await import("../stores/cartStore");
        const { clearOrderContext } = await import("../stores/orderContextStore");
        clearCart();
        clearOrderContext();
      } catch (err) {
        console.error("Cleanup error in PaymentSuccess:", err);
      }
    };
    cleanup();
  }, []);

  const handleDone = () => {
    router.replace({
      pathname: "/(tabs)/category",
      params: { section },
    });
  };

  const handlePrint = async () => {
    setPromptVisible(false);
    try {
      const discountInfo = JSON.parse(discountInfoRaw);
      const items = JSON.parse(itemsRaw);
      const userId = await AsyncStorage.getItem("userId") || "1";
      
      const saleData = {
        invoiceNumber: orderId,
        tableNo: tableNo,
        total: parseFloat(total) || 0,
        paymentMethod: method,
        cashPaid: parseFloat(paid) || 0,
        change: parseFloat(change) || 0,
        items: items,
        roundOff: parseFloat(roundOff) || 0,
        waiterName: waiterName,
        date: new Date().toISOString(),
      };

      await UniversalPrinter.smartPrint(saleData, userId, {}, discountInfo);
    } catch (error) {
      console.error("Print error:", error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgMain} />
      
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={Theme.success} />
          </View>

          <Text style={styles.title}>Payment Successful</Text>
          <Text style={styles.orderText}>Order #{orderId}</Text>

          <Text style={styles.sub}>
            {orderType === "DINE_IN"
              ? `Table ${tableNo} • ${formatSection(section)}`
              : `Takeaway • ${formatSection(section)}`}
          </Text>

          <View style={styles.divider} />

          <View style={styles.detailsContainer}>
            <View style={styles.row}>
              <Text style={styles.label}>Payment Method</Text>
              <Text style={styles.value}>{method}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Total Amount</Text>
              <Text style={styles.value}>{currencySymbol}{total}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Amount Paid</Text>
              <Text style={styles.value}>{currencySymbol}{paid}</Text>
            </View>

            <View style={[styles.row, styles.changeRow]}>
              <Text style={styles.label}>Change Due</Text>
              <Text style={[styles.value, { color: Theme.primary }]}>{currencySymbol}{change}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BillPrompt
        visible={promptVisible}
        onClose={() => setPromptVisible(false)}
        onSkip={() => setPromptVisible(false)}
        onPrintBill={handlePrint}
        theme={Theme}
        t={{
          printBillReceipt: "Print Receipt?",
          totalAmount: "Total",
          printBillMessage: "Would you like to print a receipt for this order?",
          skipBill: "Skip",
          printBill: "Print",
        }}
        total={total}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.bgCard,
    borderRadius: 30,
    padding: 30,
    alignItems: "center",
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  iconContainer: {
    marginBottom: 15,
  },
  title: {
    color: Theme.textPrimary,
    fontSize: 26,
    fontFamily: Fonts.black,
    textAlign: "center",
  },
  orderText: {
    color: Theme.success,
    fontSize: 18,
    fontFamily: Fonts.bold,
    marginTop: 5,
  },
  sub: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 14,
    marginTop: 5,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.border,
    width: "100%",
    marginVertical: 20,
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 1,
  },
  detailsContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  changeRow: {
    marginTop: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  label: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  value: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  doneBtn: {
    marginTop: 10,
    backgroundColor: Theme.primary,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 16,
    ...Theme.shadowMd,
    width: "100%",
    alignItems: "center",
  },
  doneText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 18,
  },
});
