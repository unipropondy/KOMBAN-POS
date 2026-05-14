import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { API_URL } from "@/constants/Config";
import { useToast } from "./Toast";

interface AttendanceRecord {
  AttendanceId: string;
  DeliveryPersonId: string;
  EmployeeName: string;
  StartDateTime: string;
  BreakInTime?: string;
  BreakOutTime?: string;
  EndDateTime?: string;
  NoofHours?: number;
  CreatedOn: string;
}

interface AttendanceViewProps {
  employeeId: string;
  employeeName?: string;
  onClose?: () => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  employeeId,
  employeeName,
  onClose,
}) => {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shiftActive, setShiftActive] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const isMobile = width < 768;

  useEffect(() => {
    fetchTodayAttendance();
    const interval = setInterval(fetchTodayAttendance, 30000);
    return () => clearInterval(interval);
  }, [employeeId]);

  const fetchTodayAttendance = async () => {
    try {
      const response = await fetch(`${API_URL}/api/attendance/today/${employeeId}`);
      const data = await response.json();
      setAttendance(data);
      if (data) {
        setShiftActive(!data.EndDateTime);
        setOnBreak(data.BreakInTime && !data.BreakOutTime);
      }
      setError("");
    } catch (err) {
      setError("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  const trackAction = async (action: "START" | "BREAK_IN" | "BREAK_OUT" | "END") => {
    try {
      const response = await fetch(`${API_URL}/api/attendance/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          employeeName: employeeName || employeeId,
          action,
          timestamp: new Date().toISOString(),
          businessUnitId: "default",
          userId: "current-user",
        }),
      });
      const result = await response.json();
      if (result.success) {
        showToast({ type: "success", message: `Shift ${action.replace('_', ' ')}` });
        fetchTodayAttendance();
      }
    } catch (err) {
      showToast({ type: "error", message: `Failed to track ${action}` });
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "--:--";
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const calculateElapsedTime = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading && !attendance) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.employeeId}>ID: {employeeId}</Text>
          <Text style={styles.employeeName}>{employeeName || "Staff Member"}</Text>
        </View>
        {shiftActive && (
          <View style={styles.badge}>
            <View style={styles.pulseDot} />
            <Text style={styles.badgeText}>ON DUTY</Text>
          </View>
        )}
      </View>

      <View style={styles.cardGrid}>
        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: Theme.success + "15" }]}><Ionicons name="log-in" size={20} color={Theme.success} /></View>
          <Text style={styles.cardLabel}>Clock In</Text>
          <Text style={styles.cardValue}>{attendance ? formatTime(attendance.StartDateTime) : "--:--"}</Text>
          {attendance?.StartDateTime && <Text style={styles.cardSub}>{new Date(attendance.StartDateTime).toLocaleDateString()}</Text>}
        </View>

        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: Theme.primary + "15" }]}><MaterialIcons name="pause-circle-outline" size={20} color={Theme.primary} /></View>
          <Text style={styles.cardLabel}>Break Status</Text>
          <Text style={styles.cardValue}>{onBreak ? "ON BREAK" : attendance?.BreakOutTime ? "Completed" : "Active"}</Text>
          {attendance?.BreakInTime && <Text style={styles.cardSub}>{formatTime(attendance.BreakInTime)} - {attendance.BreakOutTime ? formatTime(attendance.BreakOutTime) : "..."}</Text>}
        </View>

        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: Theme.danger + "15" }]}><Ionicons name="log-out" size={20} color={Theme.danger} /></View>
          <Text style={styles.cardLabel}>Clock Out</Text>
          <Text style={styles.cardValue}>{attendance?.EndDateTime ? formatTime(attendance.EndDateTime) : "--:--"}</Text>
          {!attendance?.EndDateTime && shiftActive && <Text style={styles.cardSub}>Ongoing Shift</Text>}
        </View>

        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: Theme.warning + "15" }]}><Ionicons name="time" size={20} color={Theme.warning} /></View>
          <Text style={styles.cardLabel}>Shift Duration</Text>
          <Text style={styles.cardValue}>{attendance?.NoofHours !== undefined ? (attendance.NoofHours).toFixed(2) + "h" : shiftActive ? calculateElapsedTime(attendance?.StartDateTime || "", undefined) : "--"}</Text>
          <Text style={styles.cardSub}>Total logged time</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {!shiftActive && !attendance && (
          <TouchableOpacity style={[styles.btn, styles.btnStart]} onPress={() => trackAction("START")}>
            <Ionicons name="log-in" size={22} color="#fff" />
            <Text style={styles.btnText}>Clock In</Text>
          </TouchableOpacity>
        )}

        {shiftActive && !onBreak && (
          <TouchableOpacity style={[styles.btn, styles.btnBreak]} onPress={() => trackAction("BREAK_IN")}>
            <MaterialIcons name="pause-circle-outline" size={22} color="#fff" />
            <Text style={styles.btnText}>Start Break</Text>
          </TouchableOpacity>
        )}

        {onBreak && (
          <TouchableOpacity style={[styles.btn, styles.btnBreakEnd]} onPress={() => trackAction("BREAK_OUT")}>
            <MaterialIcons name="play-circle-outline" size={22} color="#fff" />
            <Text style={styles.btnText}>End Break</Text>
          </TouchableOpacity>
        )}

        {shiftActive && !onBreak && (
          <TouchableOpacity style={[styles.btn, styles.btnEnd]} onPress={() => trackAction("END")}>
            <Ionicons name="log-out" size={22} color="#fff" />
            <Text style={styles.btnText}>Clock Out</Text>
          </TouchableOpacity>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!isMobile && onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeBtnText}>Back to Dashboard</Text></TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, backgroundColor: Theme.bgMain },
  content: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 25 },
  employeeId: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textMuted, marginBottom: 5 },
  employeeName: { fontSize: 24, fontFamily: Fonts.black, color: Theme.textPrimary },
  badge: { flexDirection: "row", alignItems: "center", backgroundColor: Theme.success + "15", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 8, borderWidth: 1, borderColor: Theme.success + "30" },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Theme.success },
  badgeText: { color: Theme.success, fontFamily: Fonts.black, fontSize: 11, letterSpacing: 0.5 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 25 },
  card: { flex: 1, minWidth: 160, backgroundColor: Theme.bgCard, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 15 },
  cardLabel: { fontSize: 11, fontFamily: Fonts.black, color: Theme.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  cardValue: { fontSize: 20, fontFamily: Fonts.black, color: Theme.textPrimary },
  cardSub: { fontSize: 12, fontFamily: Fonts.medium, color: Theme.textSecondary, marginTop: 5 },
  actions: { flexDirection: "row", gap: 12, marginBottom: 25, flexWrap: "wrap" },
  btn: { flex: 1, minWidth: 160, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 18, borderRadius: 16, gap: 10, ...Theme.shadowMd },
  btnStart: { backgroundColor: Theme.primary },
  btnBreak: { backgroundColor: Theme.warning },
  btnBreakEnd: { backgroundColor: Theme.primary },
  btnEnd: { backgroundColor: Theme.danger },
  btnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 16 },
  errorText: { color: Theme.danger, fontFamily: Fonts.bold, fontSize: 14, textAlign: "center", marginBottom: 20 },
  closeBtn: { paddingVertical: 16, borderRadius: 14, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  closeBtnText: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 14 },
});
