import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../constants/theme';
import { Fonts } from '../constants/Fonts';
import BillPDFGenerator from '../components/BillPDFGenerator';
import { useToast } from '../components/Toast';
import { API_URL } from '@/constants/Config';
import { useCompanySettingsStore } from '../stores/companySettingsStore';

export default function CompanySettingsScreen() {
  const { settings, loading, fetchSettings, updateSettings } = useCompanySettingsStore();
  const [userId, setUserId] = useState('1');
  const [saving, setSaving] = useState(false);
  const [kitchenPrinters, setKitchenPrinters] = useState<any[]>([]);
  const [loadingKitchens, setLoadingKitchens] = useState(false);
  const [showAddPrinterModal, setShowAddPrinterModal] = useState(false);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterIP, setNewPrinterIP] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      // ✅ CONSISTENT ID LOGIC: Match BillPDFGenerator
      const outletId = await AsyncStorage.getItem('selectedOutletId');
      const storedUserId = await AsyncStorage.getItem('userId') || '1';
      const targetId = outletId || storedUserId;
      
      setUserId(targetId);
      await fetchSettings(targetId);
      await fetchKitchenPrinters();
    };
    load();
  }, []);

  const fetchKitchenPrinters = async () => {
    try {
      setLoadingKitchens(true);
      const response = await fetch(`${API_URL}/api/settings/kitchen-printers`);
      const data = await response.json();
      if (Array.isArray(data)) {
        // 🟢 Deduplicate by KitchenTypeValue
        const uniquePrinters = data.filter((item, index, self) =>
          index === self.findIndex(p => p.KitchenTypeValue === item.KitchenTypeValue)
        );
        setKitchenPrinters(uniquePrinters);
      }
    } catch (error) {
      console.error('Failed to fetch kitchen printers:', error);
    } finally {
      setLoadingKitchens(false);
    }
  };

  const handleAddPrinter = async () => {
    if (!newPrinterName || !newPrinterIP) {
      showToast({ type: 'error', message: 'Please enter name and IP' });
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/api/settings/kitchen-printers/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPrinterName, ip: newPrinterIP })
      });
      if (res.ok) {
        showToast({ type: 'success', message: 'Printer added' });
        setShowAddPrinterModal(false);
        setNewPrinterName('');
        setNewPrinterIP('');
        fetchKitchenPrinters();
      }
    } catch (err) {
      showToast({ type: 'error', message: 'Failed to add printer' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrinter = async (id: number, name: string) => {
    setPendingDeleteId(id);
    setPin('');
    setShowPinModal(true);
  };

  const confirmDelete = async () => {
    if (!pin) {
      showToast({ type: 'error', message: 'Enter admin password' });
      return;
    }

    try {
      setSaving(true);
      // 1. Verify admin password
      const authRes = await fetch(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin })
      });
      const authData = await authRes.json();

      if (!authData.success) {
        showToast({ type: 'error', message: 'Incorrect admin password' });
        return;
      }

      // 2. Proceed with delete
      const res = await fetch(`${API_URL}/api/settings/kitchen-printers/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingDeleteId })
      });

      if (res.ok) {
        showToast({ type: 'success', message: 'Printer removed' });
        setShowPinModal(false);
        fetchKitchenPrinters();
      }
    } catch (err) {
      showToast({ type: 'error', message: 'Failed to delete printer' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // ✅ CONSISTENT ID LOGIC: Match BillPDFGenerator
    const outletId = await AsyncStorage.getItem('selectedOutletId');
    const storedUserId = await AsyncStorage.getItem('userId') || '1';
    const targetId = outletId || storedUserId;

    if (!targetId) return;
    setSaving(true);
    try {
      const success = await BillPDFGenerator.saveSettings(settings, targetId);
      
      // ✅ Also save Kitchen Printers
      const printerUpdateResponse = await fetch(`${API_URL}/api/settings/kitchen-printers/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printers: kitchenPrinters.map(kp => ({
            id: kp.KitchenTypeValue,
            ip: kp.PrinterPath
          }))
        })
      });

      if (success && printerUpdateResponse.ok) {
        showToast({ type: 'success', message: 'All settings saved successfully' });
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      showToast({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type: 'company' | 'halal') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'error', message: 'Permission needed to access images' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6, // Slightly lower quality to keep DB size manageable
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSaving(true);
      try {
        let base64Data = result.assets[0].base64;
        
        // ✅ SMART MIME-TYPE DETECTION: Ensure PNG/JPEG accuracy for PDF engine
        let finalMime = result.assets[0].mimeType || 'image/jpeg';
        if (base64Data?.startsWith('iVBOR')) finalMime = 'image/png';

        const dataUri = `data:${finalMime};base64,${base64Data}`;
        const isCompany = type === 'company';
        updateSettings({
          [isCompany ? 'companyLogo' : 'halalLogo']: dataUri,
          [isCompany ? 'showCompanyLogo' : 'showHalalLogo']: true
        });
        showToast({ type: 'success', message: 'Logo processed successfully' });
      } catch (error) {
        showToast({ type: 'error', message: 'Failed to process image' });
      } finally {
        setSaving(false);
      }
    }
  };

  const removeLogo = async (type: 'company' | 'halal') => {
    const field = type === 'company' ? 'companyLogo' : 'halalLogo';
    const toggleField = type === 'company' ? 'showCompanyLogo' : 'showHalalLogo';
    const updated = { ...settings, [field]: '', [toggleField]: false };
    updateSettings({ [field]: '', [toggleField]: false });
    
    setSaving(true);
    try {
      // Sync with DB immediately
      await BillPDFGenerator.saveSettings(updated, userId);
      showToast({ type: 'info', message: 'Logo removed successfully' });
    } catch (err) {
      showToast({ type: 'error', message: 'Failed to remove logo' });
    } finally {
      setSaving(false);
    }
  };

  const getLogoUri = (logo: string) => {
    if (!logo) return undefined;
    if (logo.startsWith('data:image')) return logo;
    if (logo.startsWith('http')) return `${logo}?t=${Date.now()}`;
    return `${API_URL}${logo.startsWith('/') ? '' : '/'}${logo}?t=${Date.now()}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.primary} />
        <Text style={{ marginTop: 20, fontFamily: Fonts.bold, color: Theme.textSecondary }}>
          Loading Shop Settings...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop Settings</Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Branding</Text>
            <View style={styles.logoGrid}>
              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Company Logo</Text>
                <View style={styles.logoPickerContainer}>
                  <TouchableOpacity 
                    style={[styles.logoPicker, settings.companyLogo ? styles.logoPickerActive : null]} 
                    onPress={() => pickImage('company')}
                  >
                    {settings.companyLogo ? (
                      <Image source={{ uri: getLogoUri(settings.companyLogo) }} style={styles.logoPreview} />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={30} color={Theme.textMuted} />
                    )}
                  </TouchableOpacity>
                  {settings.companyLogo && (
                    <TouchableOpacity 
                      style={styles.removeIconBtn} 
                      onPress={() => removeLogo('company')}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.statusContainer}>
                   <Text style={[styles.statusText, settings.companyLogo ? styles.statusSuccess : styles.statusMuted]}>
                     {settings.companyLogo ? '✅ Uploaded' : '❌ Not Uploaded'}
                   </Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>{settings.showCompanyLogo ? 'Show on bill' : 'Hidden on bill'}</Text>
                  <Switch 
                    value={settings.showCompanyLogo} 
                    onValueChange={(val) => { 
                      if (val && !settings.companyLogo) {
                        showToast({ type: 'error', message: 'Upload a logo first' });
                        return;
                      }
                      updateSettings({ showCompanyLogo: val }); 
                    }}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>

              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Halal Logo</Text>
                <View style={styles.logoPickerContainer}>
                  <TouchableOpacity 
                    style={[styles.logoPicker, settings.halalLogo ? styles.logoPickerActive : null]} 
                    onPress={() => pickImage('halal')}
                  >
                    {settings.halalLogo ? (
                      <Image source={{ uri: getLogoUri(settings.halalLogo) }} style={styles.logoPreview} />
                    ) : (
                      <Ionicons name="ribbon-outline" size={30} color={Theme.textMuted} />
                    )}
                  </TouchableOpacity>
                  {settings.halalLogo && (
                    <TouchableOpacity 
                      style={styles.removeIconBtn} 
                      onPress={() => removeLogo('halal')}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.statusContainer}>
                   <Text style={[styles.statusText, settings.halalLogo ? styles.statusSuccess : styles.statusMuted]}>
                     {settings.halalLogo ? '✅ Uploaded' : '❌ Not Uploaded'}
                   </Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>{settings.showHalalLogo ? 'Show on bill' : 'Hidden on bill'}</Text>
                  <Switch 
                    value={settings.showHalalLogo} 
                    onValueChange={(val) => { 
                      if (val && !settings.halalLogo) {
                        showToast({ type: 'error', message: 'Upload a logo first' });
                        return;
                      }
                      updateSettings({ showHalalLogo: val }); 
                    }}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Shop Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shop Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Company Name</Text>
              <TextInput 
                style={styles.input}
                value={settings.name}
                onChangeText={(val) => { updateSettings({ name: val }); }}
                placeholder="Enter shop name"
                placeholderTextColor={Theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput 
                style={[styles.input, styles.textArea]}
                value={settings.address}
                onChangeText={(val) => { updateSettings({ address: val }); }}
                placeholder="Enter shop address"
                placeholderTextColor={Theme.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.phone}
                  onChangeText={(val) => { updateSettings({ phone: val }); }}
                  placeholder="+65 ..."
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.email}
                  onChangeText={(val) => { updateSettings({ email: val }); }}
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={{ marginTop: 20 }}>
              <Text style={styles.inputLabel}>Cashier / Receipt Printer IP</Text>
              <TextInput 
                style={styles.input}
                value={settings.printerIp}
                onChangeText={(val) => { updateSettings({ printerIp: val }); }}
                placeholder="e.g. 192.168.1.100"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
              />
              <Text style={[styles.note, { textAlign: 'left', marginTop: 5 }]}>
                Used for printing Payment Receipts and Checkout Bills at the cashier counter.
              </Text>
            </View>
          </View>

          {/* Tax & Currency */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax & Currency</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstNo}
                  onChangeText={(val) => { updateSettings({ gstNo: val }); }}
                  placeholder="Registration No"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>GST (%)</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstPercentage.toString()}
                  onChangeText={(val) => { updateSettings({ gstPercentage: parseFloat(val) || 0 }); }}
                  placeholder="9.0"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Currency Code</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currency}
                  onChangeText={(val) => { updateSettings({ currency: val }); }}
                  placeholder="SGD"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Symbol</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currencySymbol}
                  onChangeText={(val) => { updateSettings({ currencySymbol: val }); }}
                  placeholder="$"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
            </View>
          </View>
          
          {/* Kitchen Printer Settings */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Smart Kitchen Routing</Text>
              <TouchableOpacity 
                style={styles.addPrinterBtn} 
                onPress={() => setShowAddPrinterModal(true)}
              >
                <Ionicons name="add-circle-outline" size={24} color={Theme.primary} />
                <Text style={styles.addPrinterText}>Add New</Text>
              </TouchableOpacity>
            </View>

            {loadingKitchens ? (
              <ActivityIndicator size="small" color={Theme.primary} />
            ) : kitchenPrinters.length > 0 ? (
              kitchenPrinters.map((printer, index) => (
                <View key={printer.KitchenTypeValue} style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>{printer.KitchenTypeName} Printer IP</Text>
                    {printer.KitchenTypeValue !== 0 && (
                      <TouchableOpacity onPress={() => handleDeletePrinter(printer.KitchenTypeValue, printer.KitchenTypeName)}>
                        <Ionicons name="ellipsis-vertical" size={20} color={Theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput 
                    style={styles.input}
                    value={printer.PrinterPath || ''}
                    onChangeText={(val) => {
                      const updated = [...kitchenPrinters];
                      updated[index].PrinterPath = val;
                      setKitchenPrinters(updated);
                    }}
                    placeholder="e.g. 192.168.1.101"
                    placeholderTextColor={Theme.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              ))
            ) : (
              <Text style={styles.note}>No kitchen types found in database.</Text>
            )}
            <Text style={[styles.note, { textAlign: 'left', marginTop: 5 }]}>
              These IPs are used to automatically route items to specific kitchens.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add Printer Modal */}
      <Modal visible={showAddPrinterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Kitchen Printer</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Kitchen Name</Text>
              <TextInput 
                style={styles.input}
                value={newPrinterName}
                onChangeText={setNewPrinterName}
                placeholder="e.g. THAI KITCHEN"
                placeholderTextColor={Theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Printer IP Address</Text>
              <TextInput 
                style={styles.input}
                value={newPrinterIP}
                onChangeText={setNewPrinterIP}
                placeholder="e.g. 192.168.1.101"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setShowAddPrinterModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.confirmBtn]} 
                onPress={handleAddPrinter}
              >
                <Text style={styles.confirmBtnText}>Add Kitchen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 320 }]}>
            <Ionicons name="lock-closed" size={40} color={Theme.primary} style={{ alignSelf: 'center', marginBottom: 15 }} />
            <Text style={styles.modalTitle}>Admin Verification</Text>
            <Text style={[styles.note, { marginBottom: 20 }]}>Enter admin password to delete this kitchen routing.</Text>
            
            <TextInput 
              style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 5 }]}
              value={pin}
              onChangeText={setPin}
              placeholder="••••"
              placeholderTextColor={Theme.textMuted}
              secureTextEntry
              autoFocus
            />

            <View style={[styles.modalActions, { marginTop: 20 }]}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setShowPinModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.confirmBtn]} 
                onPress={confirmDelete}
              >
                <Text style={styles.confirmBtnText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.bgMain, // 🟢 Force correct background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  backButton: {
    padding: 5,
  },
  saveButton: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...Theme.shadowSm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  logoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoItem: {
    width: '48%',
    alignItems: 'center',
  },
  logoLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 10,
  },
  logoPicker: {
    width: 100,
    height: 100,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Theme.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.bgNav,
    overflow: 'hidden',
  },
  logoPickerContainer: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  removeIconBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Theme.danger,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    ...Theme.shadowSm,
    zIndex: 10,
  },
  logoPickerActive: {
    borderStyle: 'solid',
    borderColor: Theme.primaryBorder,
    backgroundColor: Theme.primaryLight,
  },
  statusContainer: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Theme.bgNav,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  statusSuccess: {
    color: Theme.success,
  },
  statusMuted: {
    color: Theme.textMuted,
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.bgNav,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  note: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  addPrinterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addPrinterText: {
    color: Theme.primary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: Theme.bgNav,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  confirmBtn: {
    backgroundColor: Theme.primary,
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
  },
  confirmBtnText: {
    color: '#fff',
    fontFamily: Fonts.bold,
  },
});
