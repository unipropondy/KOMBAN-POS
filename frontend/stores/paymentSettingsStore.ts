import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";

interface PaymentSettings {
  upiId: string | null;
  payNowQrUrl: string | null;
  shopName: string;
}

interface PaymentSettingsState {
  settings: PaymentSettings;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<PaymentSettings>) => void;
}

export const usePaymentSettingsStore = create<PaymentSettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        upiId: null,
        payNowQrUrl: null,
        shopName: "My Restaurant",
      },
      loading: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const response = await fetch(`${API_URL}/api/settings`);
          const data = await response.json();
          
          if (data) {
            set({
              settings: {
                upiId: data.UPI_ID || null,
                payNowQrUrl: data.PayNow_QR_Url || null,
                shopName: data.ShopName || "My Restaurant",
              },
            });
          }
        } catch (error) {
          console.error("❌ [PaymentSettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },
    }),
    {
      name: "payment-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
