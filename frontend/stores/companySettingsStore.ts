import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";
import API from "../api";

export interface CompanySettings {
  name: string;
  address: string;
  gstNo: string;
  gstPercentage: number;
  phone: string;
  email: string;
  cashierName: string;
  currency: string;
  currencySymbol: string;
  companyLogo: string;
  halalLogo: string;
  printerIp: string;
  showCompanyLogo: boolean;
  showHalalLogo: boolean;
  taxMode: "exclusive" | "inclusive";
  waiterRequired: boolean;
  holdOvertimeMinutes: number;
}

interface CompanySettingsState {
  settings: CompanySettings;
  loading: boolean;
  fetchSettings: (userId: string) => Promise<void>;
  updateSettings: (newSettings: Partial<CompanySettings>, userId?: string) => Promise<boolean>;
}

const DEFAULT_SETTINGS: CompanySettings = {
  name: "",
  address: "",
  gstNo: "",
  gstPercentage: 0,
  phone: "",
  email: "",
  cashierName: "",
  currency: "SGD",
  currencySymbol: "$",
  companyLogo: "",
  halalLogo: "",
  printerIp: "",
  showCompanyLogo: false,
  showHalalLogo: false,
  taxMode: "exclusive",
  waiterRequired: true,
  holdOvertimeMinutes: 30,
};

export const useCompanySettingsStore = create<CompanySettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      loading: false,

      fetchSettings: async (userId: string) => {
        if (!userId) return;
        set({ loading: true });
        try {
          const response = await API.get(`/company-settings/${userId}`);
          const data = response.data;
          
          if (data && data.success && data.settings) {
            const s = data.settings;
            
            set({
              settings: {
                name: s.CompanyName || "",
                address: s.Address || "",
                gstNo: s.GSTNo || "",
                gstPercentage: parseFloat(s.GSTPercentage) || 0,
                phone: s.Phone || "",
                email: s.Email || "",
                cashierName: s.CashierName || "",
                currency: s.Currency || "SGD",
                currencySymbol: s.CurrencySymbol || "$",
                companyLogo: s.CompanyLogoUrl || "",
                halalLogo: s.HalalLogoUrl || "",
                printerIp: s.PrinterIP || "",
                showCompanyLogo: !!s.ShowCompanyLogo && !!s.CompanyLogoUrl,
                showHalalLogo: !!s.ShowHalalLogo && !!s.HalalLogoUrl,
                taxMode: s.TaxMode || "exclusive",
                waiterRequired: s.WaiterRequired !== undefined ? !!s.WaiterRequired : true,
                holdOvertimeMinutes: parseInt(s.HoldOvertimeMinutes) || 30,
              },
            });
            console.log("✅ [CompanySettingsStore] Settings loaded");
          }
        } catch (error) {
          console.error("❌ [CompanySettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: async (newSettings, userId) => {
        const current = get().settings;
        const updated = { ...current, ...newSettings };
        
        // Update local state first for immediate UI response
        set({ settings: updated });

        if (!userId) return true; // Just local update if no user ID
        try {
          // Map frontend names back to backend DB names
          const payload = {
            CompanyName: updated.name,
            Address: updated.address,
            GSTNo: updated.gstNo,
            GSTPercentage: updated.gstPercentage,
            Phone: updated.phone,
            Email: updated.email,
            CashierName: updated.cashierName,
            Currency: updated.currency,
            CurrencySymbol: updated.currencySymbol,
            CompanyLogoUrl: updated.companyLogo,
            HalalLogoUrl: updated.halalLogo,
            PrinterIP: updated.printerIp,
            ShowCompanyLogo: updated.showCompanyLogo,
            ShowHalalLogo: updated.showHalalLogo,
            TaxMode: updated.taxMode,
            WaiterRequired: updated.waiterRequired,
            HoldOvertimeMinutes: updated.holdOvertimeMinutes,
          };

          const response = await API.post(`/company-settings/${userId}`, payload);
          if (response.data?.success) {
            console.log("✅ [CompanySettingsStore] Global settings saved to DB");
            return true;
          }
          return false;
        } catch (error) {
          console.error("❌ [CompanySettingsStore] Save Error:", error);
          return false;
        }
      },
    }),
    {
      name: "company-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
