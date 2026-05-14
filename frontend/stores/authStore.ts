import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/* ================= TYPES ================= */

export type UserRole = "ADMIN" | "CASHIER" | "MANAGER" | "SUPERVISOR" | "KDS" | "WAITER" | "OWNER";

export type AuthUser = {
  userId: string;
  userCode: string;
  userName: string;
  fullName: string;
  role: UserRole;
  roleName: string;
  userGroupId?: string;
};

export type FormPermission = {
  canAdd: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRead: boolean;
};

// Map of FormCode → permissions
export type PermissionsMap = Record<string, FormPermission>;

/* ============================================================
   FormCode → POS Screen mapping (from [dbo].[UserPermission])
   ============================================================
   OPRORD  → Ordering / Tables (main POS flow)
   RPTSAL  → Sales Report
   OPRMBR  → Members
   OPRTEN  → Time Entry / Attendance
   MSTTBL  → Lock Tables / Table Management
   OPRSTK  → KDS (Kitchen Display System / Stock)
   OPROLS  → Held Orders / Online Orders
   VWORDR  → Void Order
   OPRDED  → Daily End / Deductions
   SECUSR  → Security: Users (admin only)
   SECUGR  → Security: User Groups (admin only)
   SECPRM  → Security: Permissions (admin only)
   ============================================================ */

export const FORM_CODES = {
  ORDERING:     "OPRORD",  // Tables and ordering
  SALES_REPORT: "RPTSAL",  // Sales Report
  MEMBERS:      "OPRMBR",  // Members
  TIME_ENTRY:   "OPRTEN",  // Time Entry
  TABLES:       "MSTTBL",  // Lock Tables
  KDS:          "OPRSTK",  // Kitchen Display / Stock
  HELD_ORDERS:  "OPROLS",  // Held Orders
  VOID_ORDER:   "VWORDR",  // Void Orders
  DAILY_END:    "OPRDED",  // Daily End
} as const;

type AuthState = {
  user: AuthUser | null;
  isLoggedIn: boolean;
  permissions: PermissionsMap;
  permissionsLoaded: boolean;
  token: string | null;

  setUser: (user: AuthUser, token?: string) => void;
  setPermissions: (permissions: PermissionsMap) => void;
  logout: () => void;

  // Low-level permission check by FormCode
  can: (formCode: string) => boolean;
  canDelete: (formCode: string) => boolean;

  // High-level screen access checks (mapped to FormCodes)
  canAccessOrdering: () => boolean;
  canAccessSalesReport: () => boolean;
  canAccessMembers: () => boolean;
  canAccessTimeEntry: () => boolean;
  canAccessLockTables: () => boolean;
  canAccessKDS: () => boolean;
  canAccessHeldOrders: () => boolean;
  canVoidOrder: () => boolean;
  canAccessDayEnd: () => boolean;
  canAccessStoreSettings: () => boolean;
  canAccessReceiptSettings: () => boolean;
  canAccessWaiters: () => boolean;

  // Role helpers
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSupervisor: () => boolean;
  isCashier: () => boolean;
  isWaiter: () => boolean;
};

/* ================= STORE ================= */

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoggedIn: false,
      permissions: {},
      permissionsLoaded: false,
      token: null,

      setUser: (user, token) => set({ user, token: token || null, isLoggedIn: true }),

      setPermissions: (permissions) => set({ permissions, permissionsLoaded: true }),

      logout: () => set({ user: null, token: null, isLoggedIn: false, permissions: {}, permissionsLoaded: false }),

      /* ─── Low-level: check if user can READ a given FormCode ─── */
      can: (formCode) => {
        const { permissions, user } = get();
        if (user?.role === "ADMIN" || user?.role === "MANAGER") return true;
        const perm = permissions[formCode];
        return perm?.canRead === true;
      },

      canDelete: (formCode) => {
        const { permissions, user } = get();
        if (user?.role === "ADMIN" || user?.role === "MANAGER") return true;
        const perm = permissions[formCode];
        return perm?.canDelete === true;
      },

      /* ─── High-level screen access helpers ─── */
      canAccessOrdering:    () => get().can(FORM_CODES.ORDERING),
      canAccessSalesReport: () => get().can(FORM_CODES.SALES_REPORT),
      canAccessMembers:     () => get().can(FORM_CODES.MEMBERS),
      canAccessTimeEntry:   () => get().can(FORM_CODES.TIME_ENTRY),
      canAccessLockTables:  () => get().can(FORM_CODES.TABLES),
      canAccessKDS:         () => get().can(FORM_CODES.KDS),
      canAccessHeldOrders:  () => get().can(FORM_CODES.HELD_ORDERS),
      canVoidOrder:         () => get().can(FORM_CODES.VOID_ORDER),
      canAccessDayEnd:      () => get().can(FORM_CODES.DAILY_END),
      canAccessStoreSettings: () => {
        const role = get().user?.role;
        return role === "ADMIN" || role === "MANAGER" || role === "OWNER" || role === "WAITER";
      },
      canAccessReceiptSettings: () => {
        const role = get().user?.role;
        return role === "ADMIN" || role === "MANAGER" || role === "OWNER" || role === "WAITER";
      },
      canAccessWaiters: () => {
        const role = get().user?.role;
        return role === "ADMIN" || role === "MANAGER" || role === "OWNER" || role === "WAITER";
      },

      /* ─── Role helpers ─── */
      isAdmin:      () => get().user?.role === "ADMIN",
      isManager:    () => get().user?.role === "MANAGER",
      isSupervisor: () => get().user?.role === "SUPERVISOR",
      isCashier:    () => get().user?.role === "CASHIER",
      isWaiter:     () => get().user?.role === "WAITER",
      isKDS:        () => get().user?.role === "KDS",
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() =>
        Platform.OS === "web" ? window.sessionStorage : AsyncStorage
      ),
      // Only persist what's needed — no function fields
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        permissions: state.permissions,
        permissionsLoaded: state.permissionsLoaded,
        token: state.token,
      }),
    }
  )
);
