import { Redirect } from "expo-router";
import { useAuthStore } from "../stores/authStore";

export default function Index() {
  const user = useAuthStore((s) => s.user);

  if (user) {
    const userName = (user.userName || "").trim().toUpperCase();
    if (userName === "KDS") {
      return <Redirect href="/(tabs)/kds" />;
    }
    return <Redirect href="/(tabs)/category" />;
  }

  return <Redirect href="/login" />;
}
