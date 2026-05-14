import React, { useEffect, useRef, createContext, useContext, useCallback, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../constants/Fonts";
import { BlurView } from "expo-blur";

// ─── Types ──────────────────────────────────────────────────────────────────
export type ToastType = "success" | "error" | "info" | "warning";

interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number; // ms, default 3000
  subtitle?: string;
}

interface ToastContextValue {
  showToast: (config: ToastConfig) => void;
}

// ─── Config per type ─────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ToastType, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  border: string;
}> = {
  success: {
    icon:   "checkmark-circle",
    color:  "#4ade80",
    bg:     "rgba(20,83,45,0.85)",
    border: "rgba(74,222,128,0.4)",
  },
  error: {
    icon:   "close-circle",
    color:  "#f87171",
    bg:     "rgba(127,29,29,0.85)",
    border: "rgba(248,113,113,0.4)",
  },
  warning: {
    icon:   "warning",
    color:  "#fbbf24",
    bg:     "rgba(120,53,15,0.85)",
    border: "rgba(251,191,36,0.4)",
  },
  info: {
    icon:   "information-circle",
    color:  "#60a5fa",
    bg:     "rgba(30,58,138,0.85)",
    border: "rgba(96,165,250,0.4)",
  },
};

// ─── Context ─────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

// ─── Single Toast Item ────────────────────────────────────────────────────────
function ToastItem({
  message,
  subtitle,
  type = "info",
  onDone,
  duration = 3000,
}: ToastConfig & { onDone: () => void }) {
  const slideY  = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const tc = TYPE_CONFIG[type];

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    const timer = setTimeout(() => dismiss(), duration);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -120,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  };

  return (
    <Animated.View
      style={[
        styles.toastWrap,
        {
          transform: [{ translateY: slideY }],
          opacity,
        },
      ]}
    >
      <BlurView intensity={60} tint="dark" style={[styles.toast, { borderColor: tc.border }]}>
        {/* Color accent strip on left */}
        <View style={[styles.accentStrip, { backgroundColor: tc.color }]} />

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: `${tc.color}20` }]}>
          <Ionicons name={tc.icon} size={22} color={tc.color} />
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={[styles.toastMsg, { color: tc.color }]} numberOfLines={3}>
            {message}
          </Text>
          {subtitle ? (
            <Text style={styles.toastSub} numberOfLines={5}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Dismiss */}
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
let _id = 0;

interface ToastEntry extends ToastConfig {
  id: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback((config: ToastConfig) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { ...config, id }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Render at top of screen */}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            {...t}
            onDone={() => remove(t.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    pointerEvents: "box-none",
  },
  toastWrap: {
    width: "90%",
    maxWidth: 480,
    marginBottom: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingRight: 12,
    paddingVertical: 12,
    gap: 10,
  },
  accentStrip: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  textBlock: {
    flex: 1,
  },
  toastMsg: {
    fontFamily: Fonts.extraBold,
    fontSize: 14,
    letterSpacing: 0.1,
  },
  toastSub: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
});
