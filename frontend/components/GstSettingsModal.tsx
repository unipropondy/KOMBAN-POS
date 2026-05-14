import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useCompanySettingsStore } from "../stores/companySettingsStore";

interface Props {
  visible: boolean;
  onClose: () => void;
  previewSubtotal?: number;
}

const PRESETS = [0, 5, 7, 10, 12, 18];

export default function GstSettingsModal({
  visible,
  onClose,
  previewSubtotal = 100,
}: Props) {
  const { settings, updateSettings, loading } = useCompanySettingsStore();

  const [percentStr, setPercentStr] = useState("0");
  const [regNo, setRegNo] = useState("");
  const [regErr, setRegErr] = useState(false);
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (visible) {
      setPercentStr(settings.gstPercentage.toString());
      setRegNo(settings.gstNo);
      setTaxMode(settings.taxMode || "exclusive");
      setEnabled(settings.gstPercentage > 0);
      setRegErr(false);
    }
  }, [visible, settings]);

  const rate = parseFloat(percentStr) || 0;
  const gstAmt = taxMode === "exclusive"
    ? +((previewSubtotal * rate) / 100).toFixed(2)
    : +(previewSubtotal - previewSubtotal / (1 + rate / 100)).toFixed(2);

  const total = taxMode === "exclusive" ? +(previewSubtotal + gstAmt).toFixed(2) : previewSubtotal;
  const baseAmt = taxMode === "inclusive" ? +(previewSubtotal - gstAmt).toFixed(2) : previewSubtotal;
  const isValid = !isNaN(rate) && rate >= 0 && rate <= 100;

  const handleRegChange = (v: string) => {
    setRegNo(v);
    setRegErr(v.trim().length > 0 && v.trim().length < 5);
  };

  const handleSave = async () => {
    if (!isValid || regErr) return;
    
    // ✅ CONSISTENT ID LOGIC: Match BillPDFGenerator
    const outletId = await AsyncStorage.getItem('selectedOutletId');
    const storedUserId = await AsyncStorage.getItem('userId') || '1';
    const targetId = outletId || storedUserId;

    const success = await updateSettings({
      gstPercentage: enabled ? rate : 0,
      gstNo: regNo.trim(),
      taxMode: taxMode,
    }, targetId);

    if (success) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.titleRow}>
            <View style={s.titleLeft}>
              <View style={[s.dot, { backgroundColor: enabled ? Theme.success : Theme.textMuted }]} />
              <Text style={s.title}>Global Tax Settings</Text>
            </View>
            <View style={s.titleRight}>
              <Text style={[s.toggleLabel, { color: enabled ? Theme.success : Theme.textSecondary }]}>{enabled ? "ACTIVE" : "INACTIVE"}</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: Theme.border, true: Theme.success + "80" }}
                thumbColor={enabled ? Theme.success : Theme.textMuted}
                ios_backgroundColor={Theme.bgMuted}
              />
              <TouchableOpacity onPress={onClose} style={s.closeBtn}><Ionicons name="close" size={20} color={Theme.textSecondary} /></TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flexShrink: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }} style={{ flexGrow: 0 }}>
              <View style={{ opacity: enabled ? 1 : 0.5 }} pointerEvents={enabled ? "auto" : "none"}>
                <View style={s.modeRow}>
                  <TouchableOpacity style={[s.modeBtn, taxMode === "exclusive" && s.modeBtnActive]} onPress={() => setTaxMode("exclusive")}>
                    <Ionicons name="add-circle" size={18} color={taxMode === "exclusive" ? "#fff" : Theme.textSecondary} />
                    <Text style={[s.modeTxt, taxMode === "exclusive" && s.modeTxtActive]}>Excl. GST</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modeBtn, taxMode === "inclusive" && s.modeBtnActive]} onPress={() => setTaxMode("inclusive")}>
                    <Ionicons name="checkmark-circle" size={18} color={taxMode === "inclusive" ? "#fff" : Theme.textSecondary} />
                    <Text style={[s.modeTxt, taxMode === "inclusive" && s.modeTxtActive]}>Incl. GST</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.modeHint}>
                  {taxMode === "exclusive" ? "Tax is added on top of the menu price" : "Tax is already included in the price"}
                </Text>

                <View style={s.preview}>
                  <View>
                    <Text style={s.previewLabel}>SUBTOTAL</Text>
                    <Text style={s.previewVal}>{settings.currencySymbol}{baseAmt.toFixed(2)}</Text>
                  </View>
                  <View style={s.previewDivider} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.previewLabel}>TAX ({rate}%)</Text>
                    <Text style={[s.previewVal, { color: Theme.success }]}>+{settings.currencySymbol}{gstAmt.toFixed(2)}</Text>
                  </View>
                  <View style={s.previewDivider} />
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.previewLabel}>GRAND TOTAL</Text>
                    <Text style={[s.previewVal, { color: Theme.primary }]}>{settings.currencySymbol}{total.toFixed(2)}</Text>
                  </View>
                </View>

                <Text style={s.label}>QUICK SELECT</Text>
                <View style={s.presetRow}>
                  {PRESETS.map((p) => (
                    <TouchableOpacity key={p} style={[s.preset, rate === p && s.presetActive]} onPress={() => setPercentStr(p.toString())}>
                      <Text style={[s.presetTxt, rate === p && s.presetTxtActive]}>{p}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.label}>CUSTOM RATE (%)</Text>
                <View style={s.inputWrap}>
                  <TextInput style={s.input} value={percentStr} onChangeText={setPercentStr} keyboardType="numeric" placeholder="2.15" placeholderTextColor={Theme.textMuted} selectTextOnFocus />
                  <Ionicons name="calculator-outline" size={20} color={Theme.primary} />
                </View>

                <Text style={[s.label, { marginTop: 12 }]}>GST REGISTRATION NO. <Text style={{ color: Theme.textMuted }}>(Optional)</Text></Text>
                <TextInput style={[s.inputFull, regErr && s.inputErr]} value={regNo} onChangeText={handleRegChange} placeholder="e.g. M2-1234567-X" placeholderTextColor={Theme.textMuted} autoCapitalize="characters" />
                {regErr && <Text style={s.errTxt}>Invalid format — check registration number</Text>}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={s.btns}>
            <TouchableOpacity style={s.btnCancel} onPress={onClose}><Text style={s.btnCancelTxt}>Discard</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnSave, (!isValid || regErr) && s.btnDisabled]} onPress={handleSave} disabled={!isValid || regErr || loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnSaveTxt}>Save Globally</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 15 },
  card: { backgroundColor: Theme.bgCard, width: "100%", maxWidth: 420, maxHeight: "90%", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowLg },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16, letterSpacing: 0.5 },
  titleRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleLabel: { fontSize: 9, fontFamily: Fonts.black, letterSpacing: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  modeRow: { flexDirection: "row", backgroundColor: Theme.bgMuted, borderRadius: 12, padding: 4, marginBottom: 8, borderWidth: 1, borderColor: Theme.border },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  modeBtnActive: { backgroundColor: Theme.primary, ...Theme.shadowSm },
  modeTxt: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 12 },
  modeTxtActive: { color: "#fff" },
  modeHint: { color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.medium, textAlign: "center", marginBottom: 16 },
  preview: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Theme.bgMuted, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Theme.border },
  previewLabel: { color: Theme.textMuted, fontSize: 9, fontFamily: Fonts.black, letterSpacing: 1.2, marginBottom: 4 },
  previewVal: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 14 },
  previewDivider: { width: 1, height: 26, backgroundColor: Theme.border },
  label: { color: Theme.textSecondary, fontSize: 10, fontFamily: Fonts.black, letterSpacing: 1.2, marginBottom: 8 },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  preset: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Theme.bgCard, alignItems: "center", borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  presetActive: { backgroundColor: Theme.primary + "10", borderColor: Theme.primary },
  presetTxt: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 13 },
  presetTxtActive: { color: Theme.primary },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Theme.bgInput, borderRadius: 12, borderWidth: 1, borderColor: Theme.border, paddingHorizontal: 16, height: 48, marginBottom: 8 },
  input: { flex: 1, color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16, paddingVertical: 8, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  inputFull: { backgroundColor: Theme.bgInput, borderWidth: 1, borderColor: Theme.border, borderRadius: 12, paddingHorizontal: 16, height: 48, color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  inputErr: { borderColor: Theme.danger },
  errTxt: { color: Theme.danger, fontSize: 10, fontFamily: Fonts.medium, marginTop: 4 },
  btns: { flexDirection: "row", gap: 10, marginTop: 16 },
  btnCancel: { flex: 1, height: 48, justifyContent: "center", alignItems: "center", backgroundColor: Theme.bgMuted, borderRadius: 12, borderWidth: 1, borderColor: Theme.border },
  btnCancelTxt: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 13 },
  btnSave: { flex: 2, height: 48, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: Theme.primary, borderRadius: 12, ...Theme.shadowMd },
  btnSaveTxt: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
