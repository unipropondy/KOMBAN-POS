import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";

interface TransactionCardProps {
  item: any;
  onPress: (item: any) => void;
  formatOrderId: (order: any) => string;
  formatCurrency: (amount: number) => string;
}

const TransactionCard = React.memo(
  ({ item, onPress, formatOrderId, formatCurrency }: TransactionCardProps) => {
    const { width: SCREEN_W } = useWindowDimensions();
    const settlementDate = new Date(item.SettlementDate);

    return (
      <TouchableOpacity
        onPress={() => onPress(item)}
        style={[
          styles.transactionCard,
          (item.VoidAmount > 0 || item.IsCancelled) && {
            borderColor: Theme.danger,
            borderWidth: 1.5,
            backgroundColor: Theme.danger + "05",
          },
        ]}
      >
        <View style={styles.txIconWrap}>
          <Ionicons
            name={item.PayMode === "CASH" ? "cash-outline" : "card-outline"}
            size={16}
            color={item.PayMode === "CASH" ? "#22c55e" : Theme.primary}
          />
        </View>
        <View style={styles.txOrderInfo}>
          <Text style={styles.txTitle} numberOfLines={1}>
            {SCREEN_W < 450 ? `#${formatOrderId(item).split("-").pop()}` : `Order #${formatOrderId(item)}`}
          </Text>
          <Text style={styles.txSmall} numberOfLines={1}>
            {item.OrderType === "TAKEAWAY" ? "🛍️ Takeaway" : `🪑 Table ${item.TableNo || "N/A"}`}
            {item.SER_NAME ? ` • ${item.SER_NAME}` : ""}
          </Text>
        </View>
        <View style={styles.txRightInfo}>
          <Text style={[styles.txAmount, item.IsCancelled && { color: Theme.danger, textDecorationLine: 'line-through' }]}>
            {formatCurrency(item.SysAmount || 0)}
          </Text>
          <Text style={styles.txDatetime}>
            {settlementDate.toLocaleDateString([], { day: 'numeric', month: 'short' })} • {settlementDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {item.IsCancelled && item.CancellationReason && (
             <Text style={styles.cancelledReason} numberOfLines={1}>
               {item.CancellationReason}
             </Text>
          )}
        </View>
        <View style={styles.paidIndicator}>
           {item.IsCancelled ? (
             <View style={styles.cancelledBadge}>
               <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
             </View>
           ) : (
             <Ionicons name="checkmark-circle" size={16} color={Theme.success} />
           )}
        </View>
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  txIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  txOrderInfo: { flex: 1, marginRight: 8 },
  txTitle: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
  },
  txSmall: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    marginTop: 2,
  },
  txDatetime: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    marginTop: 2,
  },
  txRightInfo: { alignItems: "flex-end", marginRight: 10 },
  txAmount: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  paidIndicator: {
    justifyContent: "center",
    alignItems: "center",
  },
  voidTag: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Theme.danger + "30",
  },
  voidTagText: {
    color: Theme.danger,
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  paidBadgeSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.success + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelledBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
    alignItems: 'center',
  },
  cancelledBadgeText: {
    color: Theme.danger,
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  cancelledReason: {
    color: Theme.danger,
    fontSize: 10,
    fontFamily: Fonts.bold,
    marginTop: 2,
    fontStyle: 'italic',
  },
});

export default TransactionCard;
