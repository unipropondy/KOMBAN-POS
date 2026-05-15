export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://komban-pos-production.up.railway.app";

console.log(`🌐 [Config] API_URL: ${API_URL} | Platform: ${require('react-native').Platform.OS} | Env: ${process.env.NODE_ENV}`);