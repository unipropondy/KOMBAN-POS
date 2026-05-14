import "react-native-get-random-values";
import "react-native-reanimated";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { ToastProvider } from "../components/Toast";

import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuthStore } from "@/stores/authStore";
import { useRouter, useSegments, Slot } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { Theme } from "@/constants/theme";

// Set root background immediately to match theme
SystemUI.setBackgroundColorAsync(Theme.bgMain);

// Keep the splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

import { useGlobalSocketSync } from "@/hooks/useGlobalSocketSync";

export default function RootLayout() {
  useGlobalSocketSync();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const user = useAuthStore((s) => s.user);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  // ✅ AUTH GUARD: Redirect based on auth state and role
  useEffect(() => {
    if (!fontsLoaded) return;

    const rootSegment = segments[0];
    const isInsideApp = !!rootSegment && rootSegment !== "login";
    
    if (!user && isInsideApp) {
      // 1. Not logged in -> Go to Login
      router.replace("/login");
    } else if (user && (!rootSegment || rootSegment === "login")) {
      // 2. Already logged in -> Go to Role-Specific Dashboard
      const role = user.role;
      const userName = (user.userName || "").trim().toUpperCase();

      if (userName === "KDS") {
        router.replace("/kds" as any);
      } else if (role === "WAITER") {
        router.replace("/(tabs)/category"); // Waiter starts at Ordering
      } else {
        router.replace("/(tabs)/category"); // Others start at POS
      }
    }
  }, [user, segments, fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="menu" />
        </Stack>
        <StatusBar style="light" />
      </ToastProvider>
    </ThemeProvider>
  );
}