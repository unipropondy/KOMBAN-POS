import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Animated,
} from "react-native";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";

export default function TimeEntryScreen() {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [staffName, setStaffName] = useState("");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Animation values for hover/press effect
  const btnScales: { [key: number]: Animated.Value } = {
    0: useRef(new Animated.Value(1)).current,
    1: useRef(new Animated.Value(1)).current,
    3: useRef(new Animated.Value(1)).current,
    4: useRef(new Animated.Value(1)).current,
  };

  const handlePressIn = (id: number) => {
    Animated.spring(btnScales[id], { toValue: 0.96, useNativeDriver: true }).start();
  };
  const handlePressOut = (id: number) => {
    Animated.spring(btnScales[id], { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadSavedCredentials();
  }, []);

  useEffect(() => {
    if (userId) fetchTodaySummary();
  }, [userId]);

  useEffect(() => {
    if (userName.length > 0) {
      const delayFetch = setTimeout(() => fetchStaffName(userName), 500);
      return () => clearTimeout(delayFetch);
    } else {
      setStaffName("");
      setUserId("");
    }
  }, [userName]);

  const loadSavedCredentials = async () => {
    try {
      const savedUser = await AsyncStorage.getItem("lastUserName");
      const savedUserId = await AsyncStorage.getItem("lastUserId");
      if (savedUser) setUserName(savedUser);
      if (savedUserId) setUserId(savedUserId);
    } catch (_) {}
  };

  const fetchStaffName = async (name: string) => {
    try {
      const res = await fetch(`${API_URL}/api/attendance/getUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: name }),
      });
      const data = await res.json();
      if (res.ok) {
        setStaffName(data.FullName);
        setUserId(data.UserId);
        await AsyncStorage.setItem("lastUserName", name);
        await AsyncStorage.setItem("lastUserId", data.UserId);
      } else {
        setStaffName("");
        setUserId("");
      }
    } catch (_) {
      setStaffName("");
      setUserId("");
    }
  };

  const fetchTodayLogs = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/attendance/today/${id}`);
      const data = await response.json();
      if (response.ok) setTodayLogs(data);
    } catch (_) {}
  };

  const fetchTodaySummary = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/api/attendance/summary/${userId}`);
      const data = await response.json();
      if (response.ok && data.summary) {
        setTodaySummary(data.summary);
        await fetchTodayLogs(userId);
      }
    } catch (_) {}
  };

  const handleAction = async (status: number) => {
    if (!userId || !password) {
      Alert.alert("Error", "Enter ID & Password");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/attendance/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status, userName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      if (status !== 1) setPassword("");
      Alert.alert("Success", data.message);
      await fetchTodaySummary();
      if (status === 0) {
        setUserName(""); setPassword(""); setStaffName(""); setUserId("");
        setTodaySummary(null); setTodayLogs([]);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const lastStatus = todaySummary?.lastStatus;
  const canLogin = (lastStatus === 0 || lastStatus === null || !userId);
  const canOut = (lastStatus === 1 || lastStatus === 4);
  const canBreakIn = (lastStatus === 1 || lastStatus === 4);
  const canBreakOut = (lastStatus === 3);

  const getStatus = () => {
    switch (lastStatus) {
      case 1: return { text: "ACTIVE", color: "#22c55e" };
      case 3: return { text: "BREAK", color: "#f59e0b" };
      case 4: return { text: "ACTIVE", color: "#3b82f6" };
      default: return { text: "OFF", color: "#6b7280" };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Attendance</Text>
        <Text style={styles.headerTime}>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchTodaySummary} tintColor={Theme.primary} />}
        >
          {/* USER CARD (Based on Snippet) */}
          <View style={styles.userCard}>
            <View>
              <Text style={styles.userName}>{staffName || "Select Staff"}</Text>
              <View style={styles.statusRow}>
                <Text style={[styles.statusText, { color: getStatus().color }]}>● {getStatus().text}</Text>
                {todaySummary && <Text style={styles.hoursText}> • {todaySummary.netHours.toFixed(2)}h Today</Text>}
              </View>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{staffName ? staffName.charAt(0) : "?"}</Text>
            </View>
          </View>

          {/* INPUTS (Compact Row) */}
          <View style={styles.inputRow}>
            <View style={styles.inputField}>
              <Ionicons name="person-outline" size={16} color={Theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.textInput}
                value={userName}
                onChangeText={setUserName}
                placeholder="User ID"
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inputField}>
              <Ionicons name="lock-closed-outline" size={16} color={Theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="PIN"
                placeholderTextColor={Theme.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* ACTION BUTTONS (With Icons & Clear Labels) */}
          <View style={styles.grid}>
            {[
              { id: 1, label: "CLOCK IN", icon: "enter", color: "#22c55e", active: canLogin },
              { id: 3, label: "BREAK IN", icon: "cafe", color: "#f97316", active: canBreakIn },
              { id: 4, label: "BREAK OUT", icon: "play", color: "#3b82f6", active: canBreakOut },
              { id: 0, label: "CLOCK OUT", icon: "power", color: "#ef4444", active: canOut },
            ].map((btn) => (
              <Animated.View key={btn.id} style={{ flex: 1, transform: [{ scale: btnScales[btn.id] }] }}>
                <TouchableOpacity
                  disabled={!btn.active}
                  onPressIn={() => handlePressIn(btn.id)}
                  onPressOut={() => handlePressOut(btn.id)}
                  onPress={() => handleAction(btn.id)}
                  style={[
                    styles.actionBtn, 
                    { backgroundColor: btn.active ? btn.color : "#e2e8f0" }
                  ]}
                >
                  <Ionicons name={btn.icon as any} size={24} color={btn.active ? "#fff" : "#94a3b8"} style={{ marginBottom: 4 }} />
                  <Text style={[styles.btnText, { color: btn.active ? "#fff" : "#94a3b8" }]}>
                    {btn.label}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>

          {/* DETAILED HISTORY SECTION */}
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>RECENT RECORDS</Text>
              <Ionicons name="list" size={16} color="#9ca3af" />
            </View>
            
            {todayLogs.length > 0 ? (
              todayLogs.slice(0, 6).map((log, i) => {
                const isClockIn = log.ActionName.toLowerCase().includes('in');
                const isOut = log.ActionName.toLowerCase().includes('out');
                const isBreak = log.ActionName.toLowerCase().includes('break');
                
                let iconName = "time-outline";
                let iconColor = "#6b7280";
                if (isClockIn) { iconName = "checkmark-circle"; iconColor = "#22c55e"; }
                if (isOut) { iconName = "power"; iconColor = "#ef4444"; }
                if (isBreak) { iconName = "cafe"; iconColor = "#f97316"; }

                return (
                  <View key={i} style={[styles.historyRow, { borderLeftColor: iconColor }]}>
                    <View style={styles.historyDetailLeft}>
                      <View style={[styles.historyIconBox, { backgroundColor: iconColor + '15' }]}>
                        <Ionicons name={iconName as any} size={16} color={iconColor} />
                      </View>
                      <View>
                        <Text style={styles.historyAction}>{log.ActionName}</Text>
                        <Text style={styles.historyStatusText}>Staff activity recorded successfully</Text>
                      </View>
                    </View>
                    <View style={styles.historyDetailRight}>
                      <Text style={styles.historyTime}>{new Date(log.ClockinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      <Text style={styles.historyDate}>{new Date(log.ClockinTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No records recorded for today</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && <View style={styles.loader}><ActivityIndicator color={Theme.primary} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: Fonts.black, color: "#111827" },
  headerTime: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.primary },
  
  content: { padding: 16 },
  
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userName: { fontSize: 18, fontFamily: Fonts.black, color: "#111827" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusText: { fontSize: 13, fontFamily: Fonts.bold },
  hoursText: { fontSize: 13, fontFamily: Fonts.medium, color: "#6b7280" },
  avatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 12, 
    backgroundColor: "#ffedd5", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  avatarText: { fontSize: 20, fontFamily: Fonts.black, color: "#9a3412" },

  inputRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  inputField: { 
    flex: 1, 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#fff", 
    height: 56, 
    borderRadius: 14, 
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  textInput: { flex: 1, fontSize: 16, fontFamily: Fonts.bold, color: "#111827" },

  grid: { flexDirection: "row", gap: 12, marginBottom: 24 },
  actionBtn: { 
    flex: 1, 
    height: 100, 
    borderRadius: 20, 
    alignItems: "center", 
    justifyContent: "center",
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden'
  },
  btnText: { fontSize: 13, fontFamily: Fonts.black, textAlign: "center", includeFontPadding: false },

  historySection: { 
    backgroundColor: "#fff", 
    borderRadius: 16, 
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 40,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: Fonts.black, color: "#9ca3af", textTransform: "uppercase" },
  historyRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    borderLeftWidth: 4,
    paddingLeft: 12,
    paddingVertical: 15,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  historyDetailLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  historyIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  historyAction: { fontSize: 15, fontFamily: Fonts.bold, color: "#111827", includeFontPadding: false },
  historyStatusText: { fontSize: 11, fontFamily: Fonts.medium, color: "#9ca3af", marginTop: 2 },
  historyDetailRight: { alignItems: 'flex-end' },
  historyTime: { fontSize: 14, fontFamily: Fonts.black, color: "#111827", includeFontPadding: false },
  historyDate: { fontSize: 11, fontFamily: Fonts.medium, color: "#9ca3af", marginTop: 2 },
  emptyText: { textAlign: "center", color: "#9ca3af", fontSize: 13, fontFamily: Fonts.medium, paddingVertical: 20 },

  loader: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }
});
