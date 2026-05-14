import { create } from 'zustand';
import { API_URL } from '@/constants/Config';

interface MenuState {
  kitchens: any[];
  dishGroups: Record<string, any[]>;
  dishesByGroup: Record<string, any[]>;
  allDishes: any[];
  modifierCache: Record<string, any[]>;
  lastFetched: number | null;
  isLoading: boolean;

  fetchMenu: () => Promise<void>;
  fetchGroups: (kitchenId: string) => Promise<any[]>;
  fetchDishes: (groupId: string) => Promise<any[]>;
  fetchModifiersForGroup: (groupId: string) => Promise<void>;
  clearCache: () => void;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  kitchens: [],
  dishGroups: {},
  dishesByGroup: {},
  allDishes: [],
  modifierCache: {},
  lastFetched: null,
  isLoading: false,

  fetchMenu: async () => {
    const { lastFetched, kitchens } = get();
    // Cache for 10 minutes
    if (lastFetched && kitchens.length > 0 && Date.now() - lastFetched < 600000) {
      return;
    }

    set({ isLoading: true });
    try {
      // 1. Fetch kitchens
      const kRes = await fetch(`${API_URL}/api/menu/kitchens`);
      const kData = await kRes.json();
      const rawKitchens = Array.isArray(kData) ? kData.filter((k: any) => k.KitchenTypeName && !k.KitchenTypeName.includes("TEST")) : [];
      // 🟢 Deduplicate kitchens by CategoryId (since backend returns CategoryId)
      const kitchensData = Array.from(
        new Map(rawKitchens.map((k: any) => [k.CategoryId, k])).values()
      );

      // 2. Fetch all dishes (for search)
      const dRes = await fetch(`${API_URL}/api/menu/dishes/all`);
      const dData = await dRes.json();
      const allDishesRaw = Array.isArray(dData) ? dData : [];
      
      // Deduplicate dishes by DishId
      const allDishesData = Array.from(
        new Map(allDishesRaw.map((d: any) => [d.DishId || d.id, d])).values()
      );

      set({ 
        kitchens: kitchensData, 
        allDishes: allDishesData,
        lastFetched: Date.now(),
        isLoading: false 
      });
    } catch (error) {
      console.error("Failed to fetch menu:", error);
      set({ isLoading: false });
    }
  },

  fetchGroups: async (kitchenId) => {
    const { dishGroups } = get();
    if (dishGroups[kitchenId]) return dishGroups[kitchenId];

    try {
      const res = await fetch(`${API_URL}/api/menu/dishgroups/${kitchenId}`);
      const data = await res.json();
      const rawGroups = Array.isArray(data) ? data : [];
      // 🟢 Deduplicate groups by DishGroupId
      const groups = Array.from(
        new Map(rawGroups.map((g: any) => [g.DishGroupId || g.id, g])).values()
      );
      
      set((state) => ({
        dishGroups: { ...state.dishGroups, [kitchenId]: groups }
      }));
      return groups;
    } catch (error) {
      console.error(`Failed to fetch groups for kitchen ${kitchenId}:`, error);
      return [];
    }
  },

  fetchDishes: async (groupId) => {
    const { dishesByGroup } = get();
    if (dishesByGroup[groupId]) return dishesByGroup[groupId];

    try {
      const res = await fetch(`${API_URL}/api/menu/dishes/group/${groupId}`);
      const data = await res.json();
      const dishesRaw = Array.isArray(data) ? data : [];
      
      // Deduplicate dishes by DishId
      const dishes = Array.from(
        new Map(dishesRaw.map((d: any) => [d.DishId || d.id, d])).values()
      );

      set((state) => ({
        dishesByGroup: { ...state.dishesByGroup, [groupId]: dishes }
      }));

      // 🚀 BACKGROUND PRE-FETCH: Load all modifiers for this group
      get().fetchModifiersForGroup(groupId);

      return dishes;
    } catch (error) {
      console.error(`Failed to fetch dishes for group ${groupId}:`, error);
      return [];
    }
  },

  fetchModifiersForGroup: async (groupId) => {
    try {
      const res = await fetch(`${API_URL}/api/menu/modifiers/group/${groupId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const newModifiers: Record<string, any[]> = {};
        data.forEach(m => {
          if (!newModifiers[m.DishId]) newModifiers[m.DishId] = [];
          newModifiers[m.DishId].push(m);
        });
        
        set(state => ({
          modifierCache: { ...state.modifierCache, ...newModifiers }
        }));
      }
    } catch (err) {
      console.error("Failed to fetch group modifiers:", err);
    }
  },

  clearCache: () => set({ kitchens: [], dishGroups: {}, dishesByGroup: {}, allDishes: [], modifierCache: {}, lastFetched: null }),
}));
