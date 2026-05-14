import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type GstTaxMode = "exclusive" | "inclusive";

interface GstState {
  enabled: boolean;
  percentage: number;
  registrationNumber: string;
  isConfigured: boolean;
  taxMode: GstTaxMode;

  loadSettings: () => Promise<void>;
  updateSettings: (
    percentage: number,
    regNo: string,
    taxMode: GstTaxMode,
    enabled?: boolean,
  ) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

export const useGstStore = create<GstState>((set, get) => ({
  enabled: false,
  percentage: 2.15,
  registrationNumber: "",
  isConfigured: false,
  taxMode: "exclusive",

  loadSettings: async () => {
    try {
      const data = await AsyncStorage.getItem("gst-settings-v5");
      if (data) {
        const parsed = JSON.parse(data);
        set({
          enabled: parsed.enabled ?? false,
          percentage: parsed.percentage ?? 2.15,
          registrationNumber: parsed.registrationNumber ?? "",
          isConfigured: parsed.isConfigured ?? false,
          taxMode: parsed.taxMode ?? "exclusive",
        });
      }
    } catch (e) {
      console.error("Failed to load GST settings:", e);
    }
  },

  updateSettings: async (percentage, regNo, taxMode, enabled = true) => {
    const newState = {
      percentage,
      registrationNumber: regNo,
      taxMode,
      isConfigured: true,
      enabled,
    };
    set(newState);
    try {
      await AsyncStorage.setItem(
        "gst-settings-v5",
        JSON.stringify({ ...get(), ...newState }),
      );
    } catch (e) {
      console.error("Failed to save GST settings:", e);
    }
  },

  setEnabled: async (enabled) => {
    set({ enabled });
    try {
      await AsyncStorage.setItem(
        "gst-settings-v5",
        JSON.stringify({ ...get(), enabled }),
      );
    } catch (e) {
      console.error("Failed to set GST enabled:", e);
    }
  },
}));
