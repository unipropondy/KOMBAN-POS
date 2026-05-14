import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { API_URL } from "@/constants/Config";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useAuthStore } from "@/stores/authStore";


type MemberType = {
  MemberId: string;
  Name: string;
  Phone: string;
  Email?: string;
  Address?: string;
  IsActive?: boolean | number;
  CreditLimit?: number;
  CurrentBalance?: number;
  Balance?: number;
};

export default function MembersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [members, setMembers] = useState<MemberType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [modalMode, setModalMode] = useState<"ADD" | "EDIT" | "NONE">("NONE");
  const [editingMember, setEditingMember] = useState<MemberType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    isActive: true,
    creditLimit: "1000",
    currentBalance: "0",
    balance: "0",
  });

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/members`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[FETCH ERROR]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const openAddModal = () => {
    setFormData({ 
      name: "", 
      phone: "", 
      email: "", 
      address: "",
      isActive: true,
      creditLimit: "1000", 
      currentBalance: "0", 
      balance: "0" 
    });
    setEditingMember(null);
    setModalMode("ADD");
  };

  const openEditModal = (member: MemberType) => {
    setEditingMember(member);
    setFormData({
      name: member.Name,
      phone: member.Phone,
      email: member.Email || "",
      address: member.Address || "",
      isActive: member.IsActive === true || member.IsActive === 1,
      creditLimit: String(member.CreditLimit ?? 0),
      currentBalance: String(member.CurrentBalance ?? 0),
      balance: String(member.Balance ?? 0),
    });
    setModalMode("EDIT");
  };

  const handleSaveMember = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      Alert.alert("Required", "Please fill Name and Phone.");
      return;
    }

    setIsSaving(true);
    try {
      const isEdit = modalMode === "EDIT";
      const url = isEdit ? `${API_URL}/api/members/update` : `${API_URL}/api/members/add`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: editingMember?.MemberId,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          isActive: formData.isActive,
          creditLimit: parseFloat(formData.creditLimit) || 0,
          currentBalance: parseFloat(formData.currentBalance) || 0,
          balance: parseFloat(formData.balance) || 0,
          userId: user?.userId,
        }),
      });

      if (res.ok) {
        setModalMode("NONE");
        fetchMembers();
        Alert.alert("Success", isEdit ? "Member updated." : "Member added.");
      } else {
        Alert.alert("Error", "Save failed.");
      }
    } catch (err) {
      Alert.alert("Error", "Connection problem.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMember = (member: MemberType) => {
    setEditingMember(member);
    setShowDeleteModal(true);
  };

  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return members.filter(m =>
      m.Name.toLowerCase().includes(query) ||
      m.Phone.includes(searchQuery)
    );
  }, [members, searchQuery]);

  const MemberCard = React.memo(({ item, onEdit, onDelete }: { item: MemberType; onEdit: (m: MemberType) => void; onDelete: (m: MemberType) => void }) => {
    return (
      <View style={styles.memberCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{item.Name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{item.Name}</Text>
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={12} color={Theme.textSecondary} />
              <Text style={styles.memberPhone}>{item.Phone}</Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => onEdit(item)} 
              style={[styles.actionBtn, { backgroundColor: Theme.primary + "15" }]}
            >
              <Ionicons name="create-outline" size={18} color={Theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => onDelete(item)} 
              style={[styles.actionBtn, { backgroundColor: Theme.danger + "15" }]}
            >
              <Ionicons name="trash-outline" size={18} color={Theme.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dataGrid}>
          <View style={styles.dataBox}><Text style={styles.label}>EMAIL</Text><Text style={styles.val} numberOfLines={1}>{item.Email || "—"}</Text></View>
          <View style={styles.dataBox}><Text style={styles.label}>STATUS</Text><Text style={[styles.val, { color: (item.IsActive === true || item.IsActive === 1) ? Theme.success : Theme.danger }]}>{(item.IsActive === true || item.IsActive === 1) ? "ACTIVE" : "INACTIVE"}</Text></View>
          <View style={styles.dataBox}><Text style={styles.label}>CREDIT LIMIT</Text><Text style={[styles.val, { color: Theme.success }]}>${(item.CreditLimit || 0).toFixed(2)}</Text></View>
          <View style={styles.dataBox}><Text style={styles.label}>CURRENT BAL</Text><Text style={styles.val}>${(item.CurrentBalance || 0).toFixed(2)}</Text></View>
          <View style={[styles.dataBox, { width: '100%' }]}><Text style={styles.label}>ADDRESS</Text><Text style={styles.val}>{item.Address || "—"}</Text></View>
          <View style={styles.dataBox}><Text style={styles.label}>FINAL BALANCE</Text><Text style={[styles.val, { fontFamily: Fonts.black }]}>${(item.Balance || 0).toFixed(2)}</Text></View>
        </View>
      </View>
    );
  });

  const renderMember = useCallback(({ item }: { item: MemberType }) => {
    return <MemberCard item={item} onEdit={openEditModal} onDelete={handleDeleteMember} />;
  }, [openEditModal, handleDeleteMember]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circularBack}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Member Management</Text>
          <TouchableOpacity onPress={openAddModal} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Member</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrapper}>
          <View style={styles.searchInner}>
            <Ionicons name="search" size={20} color={Theme.textMuted} />
            <TextInput
              placeholder="Search members..."
              placeholderTextColor={Theme.textMuted}
              style={styles.searchField}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={Theme.primary} /></View>
        ) : (
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.MemberId}
            renderItem={renderMember}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMembers} tintColor={Theme.primary} />}
          />
        )}

        {/* Form Modal */}
        <Modal visible={modalMode !== "NONE"} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.formSheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{modalMode === "EDIT" ? "Edit Member" : "Add Member"}</Text>
                <TouchableOpacity onPress={() => setModalMode("NONE")} style={styles.sheetClose}>
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>NAME</Text>
                  <TextInput style={styles.sheetInput} value={formData.name} onChangeText={v => setFormData({ ...formData, name: v })} placeholder="Full Name" placeholderTextColor={Theme.textMuted} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>PHONE</Text>
                  <TextInput style={styles.sheetInput} keyboardType="phone-pad" value={formData.phone} onChangeText={v => setFormData({ ...formData, phone: v })} placeholder="Contact Number" placeholderTextColor={Theme.textMuted} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>EMAIL</Text>
                  <TextInput style={styles.sheetInput} keyboardType="email-address" value={formData.email} onChangeText={v => setFormData({ ...formData, email: v })} placeholder="Email Address" placeholderTextColor={Theme.textMuted} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>ADDRESS</Text>
                  <TextInput style={[styles.sheetInput, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]} multiline value={formData.address} onChangeText={v => setFormData({ ...formData, address: v })} placeholder="Member Address" placeholderTextColor={Theme.textMuted} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>STATUS</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity 
                      style={[styles.statusToggle, formData.isActive && styles.activeToggle]} 
                      onPress={() => setFormData({ ...formData, isActive: true })}
                    >
                      <Text style={[styles.statusText, formData.isActive && styles.activeStatusText]}>Active</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.statusToggle, !formData.isActive && styles.inactiveToggle]} 
                      onPress={() => setFormData({ ...formData, isActive: false })}
                    >
                      <Text style={[styles.statusText, !formData.isActive && styles.inactiveStatusText]}>Inactive</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>CREDIT LIMIT</Text>
                    <TextInput style={styles.sheetInput} keyboardType="numeric" value={formData.creditLimit} onChangeText={v => setFormData({ ...formData, creditLimit: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>FINAL BALANCE</Text>
                    <TextInput style={styles.sheetInput} keyboardType="numeric" value={formData.balance} onChangeText={v => setFormData({ ...formData, balance: v })} />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>CURRENT BALANCE</Text>
                  <TextInput style={styles.sheetInput} keyboardType="numeric" value={formData.currentBalance} onChangeText={v => setFormData({ ...formData, currentBalance: v })} />
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveMember} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{modalMode === "EDIT" ? "Update Record" : "Add Member"}</Text>}
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Delete Modal */}
        <Modal visible={showDeleteModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.alertCard}>
              <View style={styles.alertIconBg}>
                <Ionicons name="alert-circle" size={40} color={Theme.danger} />
              </View>
              <Text style={styles.alertTitle}>Delete Customer</Text>
              <Text style={styles.alertMessage}>
                Do you want to delete this customer?{"\n"}
                <Text style={{ color: Theme.primary, fontSize: 16, fontFamily: Fonts.black }}>{editingMember?.Name}</Text>
              </Text>
              
              <View style={styles.alertActions}>
                <TouchableOpacity 
                  style={[styles.alertBtn, styles.cancelBtn]} 
                  onPress={() => { setEditingMember(null); setShowDeleteModal(false); }}
                >
                  <Text style={styles.btnLabel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.alertBtn, styles.confirmDeleteBtn]} 
                  onPress={async () => {
                    const member = editingMember;
                    if (!member) return;
                    setIsSaving(true);
                    try {
                      const res = await fetch(`${API_URL}/api/members/delete`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ memberId: member.MemberId }),
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setMembers(prev => prev.filter(m => m.MemberId !== member.MemberId));
                        setEditingMember(null);
                        setShowDeleteModal(false);
                      }
                    } catch (err) {
                      console.error(err);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  <Text style={[styles.btnLabel, { color: '#fff' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 20, gap: 15 },
  circularBack: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgCard, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  screenTitle: { flex: 1, color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.black },
  addBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Theme.primary, borderRadius: 12, ...Theme.shadowSm },
  addBtnText: { color: "#fff", fontFamily: Fonts.bold, fontSize: 13 },
  searchWrapper: { marginHorizontal: 20, marginBottom: 20 },
  searchInner: { 
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 56, 
    borderRadius: 16, backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border,
    ...Theme.shadowSm 
  },
  searchField: { flex: 1, color: Theme.textPrimary, fontFamily: Fonts.medium, fontSize: 16, marginLeft: 12, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  listContainer: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  memberCard: { 
    backgroundColor: Theme.bgCard, borderRadius: 20, padding: 20, 
    borderLeftWidth: 5, borderLeftColor: Theme.primary, ...Theme.shadowMd,
    borderWidth: 1, borderColor: Theme.border
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Theme.primaryLight, justifyContent: "center", alignItems: "center" },
  avatarLetter: { color: Theme.primary, fontSize: 18, fontFamily: Fonts.black },
  memberName: { color: Theme.textPrimary, fontSize: 18, fontFamily: Fonts.bold },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  memberPhone: { color: Theme.textSecondary, fontSize: 13 },
  cardActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardDivider: { height: 1, backgroundColor: Theme.border, marginVertical: 15 },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 15 },
  dataBox: { width: '50%' },
  label: { color: Theme.textMuted, fontSize: 9, fontFamily: Fonts.black, marginBottom: 4, letterSpacing: 0.5 },
  val: { color: Theme.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
  formSheet: { backgroundColor: Theme.bgCard, borderRadius: 24, width: '100%', maxWidth: 500, ...Theme.shadowLg, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25, borderBottomWidth: 1, borderBottomColor: Theme.border },
  sheetTitle: { color: Theme.textPrimary, fontSize: 22, fontFamily: Fonts.black },
  sheetClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.bgMuted, justifyContent: 'center', alignItems: 'center' },
  sheetBody: { padding: 25 },
  inputGroup: { marginBottom: 20 },
  inputRow: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  inputLabel: { color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.black, marginBottom: 8, letterSpacing: 0.5 },
  sheetInput: { 
    height: 56, backgroundColor: Theme.bgInput, borderRadius: 14, color: Theme.textPrimary, 
    paddingHorizontal: 16, fontSize: 15, fontFamily: Fonts.bold, borderWidth: 1, borderColor: Theme.border,
    ...Platform.select({ web: { outlineStyle: "none" } as any })
  },
  statusToggle: { flex: 1, height: 50, borderRadius: 12, backgroundColor: Theme.bgInput, borderWidth: 1, borderColor: Theme.border, justifyContent: 'center', alignItems: 'center' },
  activeToggle: { backgroundColor: Theme.success + '15', borderColor: Theme.success },
  inactiveToggle: { backgroundColor: Theme.danger + '15', borderColor: Theme.danger },
  statusText: { fontFamily: Fonts.bold, color: Theme.textSecondary, fontSize: 14 },
  activeStatusText: { color: Theme.success },
  inactiveStatusText: { color: Theme.danger },
  submitBtn: { backgroundColor: Theme.primary, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 15, ...Theme.shadowMd },
  submitBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 16 },
  alertCard: { width: '100%', maxWidth: 360, backgroundColor: Theme.bgCard, borderRadius: 24, padding: 30, alignItems: 'center', ...Theme.shadowLg, borderWidth: 1, borderColor: Theme.border },
  alertIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: Theme.danger + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  alertTitle: { color: Theme.textPrimary, fontSize: 22, fontFamily: Fonts.black, marginBottom: 10 },
  alertMessage: { color: Theme.textSecondary, fontSize: 15, fontFamily: Fonts.medium, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  alertActions: { flexDirection: 'row', gap: 15, width: '100%' },
  alertBtn: { flex: 1, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { backgroundColor: Theme.bgMuted, borderWidth: 1, borderColor: Theme.border },
  confirmDeleteBtn: { backgroundColor: Theme.danger },
  btnLabel: { color: Theme.textSecondary, fontSize: 15, fontFamily: Fonts.bold },
});
