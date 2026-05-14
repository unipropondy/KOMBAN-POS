import { create } from 'zustand';
export type TableStatusType = 'EMPTY' | 'HOLD' | 'SENT' | 'BILL_REQUESTED' | 'LOCKED' | 'CART' | 'DELIVERY';

export type TableStatus = {
  tableId: string;
  section: string;
  tableNo: string;
  orderId: string;
  startTime: number;
  status: TableStatusType | number;
  lockedByName?: string;
  totalAmount?: number;
  isHoldOvertime?: boolean;
};

type TableStatusState = {
  tables: TableStatus[];
  tableMap: Record<string, TableStatus>; // 🚀 O(1) Lookup Optimization
  lockedTables: string[];
  lockedTableNames: Record<string, string>; // Map tableNo to locked person name
  lastLocalUpdate: Record<string, number>;
  updateTableStatus: (
    tableId: string,
    section: string,
    tableNo: string,
    orderId: string,
    status: TableStatusType,
    startTime?: number | string,
    lockedByName?: string,
    totalAmount?: number,
    isExternal?: boolean,
    isHoldOvertime?: boolean
  ) => void;
  clearTable: (section: string, tableNo: string) => void;
  lockTable: (tableId: string, lockedByName?: string) => void;
  unlockTable: (tableId: string) => void;
  isTableLocked: (tableId: string) => boolean;
  getLockedName: (tableNo: string, section?: string) => string | undefined;
  setLockedName: (tableNo: string, name: string) => void;
  syncLockedTables: (lockedTables: Array<{ tableId: string; tableNo: string; section: string; lockedByName?: string }>) => void;
  batchUpdateTableStatus: (updates: TableStatus[]) => void;
  getTables: () => TableStatus[];
};

export const useTableStatusStore = create<TableStatusState>((set, get) => ({
  tables: [],
  tableMap: {},
  lockedTables: [],
  lockedTableNames: {},
  lastLocalUpdate: {},

  updateTableStatus: (tableId, section, tableNo, orderId, status, startTime, lockedByName, totalAmount, isExternal, isHoldOvertime) => {
    const cleanTableId = String(tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
    const key = `${section}_${tableNo}`;
    set((state) => {
      const now = Date.now();
      const lastEdit = state.lastLocalUpdate[key] || 0;

      // 🛡️ SYNC SHIELD: Ignore stale external updates
      if (isExternal && now - lastEdit < 3000) return state;

      const parsedStartTime = typeof startTime === 'string' 
        ? new Date(startTime).getTime() 
        : startTime;

      const existingIndex = state.tables.findIndex(
        (t) => (String(t.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase() === cleanTableId && !!cleanTableId) || (t.section === section && t.tableNo === tableNo)
      );

      const updateTimestamp = isExternal ? state.lastLocalUpdate[key] : now;
      const updatedTable: TableStatus = {
        tableId: cleanTableId || (existingIndex > -1 ? state.tables[existingIndex].tableId : ""),
        section,
        tableNo,
        orderId,
        status,
        startTime: parsedStartTime || (existingIndex > -1 ? state.tables[existingIndex].startTime : 0) || Date.now(),
        lockedByName,
        totalAmount: totalAmount !== undefined ? totalAmount : (existingIndex > -1 ? state.tables[existingIndex].totalAmount : 0),
        isHoldOvertime: isHoldOvertime !== undefined ? isHoldOvertime : (existingIndex > -1 ? state.tables[existingIndex].isHoldOvertime : false),
      };

      const newTables = [...state.tables];
      if (existingIndex > -1) newTables[existingIndex] = updatedTable;
      else newTables.push(updatedTable);

      const newMap = { ...state.tableMap };
      if (updatedTable.tableId) {
        const cleanKey = String(updatedTable.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
        newMap[cleanKey] = updatedTable;
      }

      return {
        ...state,
        tables: newTables,
        tableMap: newMap,
        lastLocalUpdate: { ...state.lastLocalUpdate, [key]: updateTimestamp }
      };
    });
  },

  clearTable: (section, tableNo) => {
    set((state) => {
      const { [tableNo]: _, ...rest } = state.lockedTableNames;
      return {
        tables: state.tables.filter(
          (t) => !(t.section === section && t.tableNo === tableNo)
        ),
        lockedTableNames: rest,
      };
    });
  },

  lockTable: (tableId, lockedByName) => {
    set((state) => {
      const normalizedId = tableId.toLowerCase();
      if (!state.lockedTables.includes(normalizedId)) {
        const newState: any = { lockedTables: [...state.lockedTables, normalizedId] };
        if (lockedByName) {
          newState.lockedTableNames = { ...state.lockedTableNames, [normalizedId]: lockedByName };
        }
        return newState;
      }
      return state;
    });
  },

  unlockTable: (tableId) => {
    set((state) => {
      const normalizedId = tableId.toLowerCase();
      const { [normalizedId]: _, ...rest } = state.lockedTableNames;
      return {
        lockedTables: state.lockedTables.filter((id) => id !== normalizedId),
        lockedTableNames: rest,
      };
    });
  },

  isTableLocked: (tableId) => {
    return get().lockedTables.includes(tableId.toLowerCase());
  },

  getLockedName: (tableNo, section) => {
    const normalize = (n: any) => n?.toString().replace(/^T/i, "").trim();
    const sTableNo = normalize(tableNo);

    if (section) {
      const name = get().lockedTableNames[`${section}_${sTableNo}`] || get().lockedTableNames[`${section}_${tableNo}`];
      if (name) return name;
    }

    // Fallback search in tables array
    const table = get().tables.find(t => 
      (normalize(t.tableNo) === sTableNo || t.tableNo === tableNo) && 
      (!section || t.section === section)
    );
    return table?.lockedByName;
  },

  setLockedName: (tableNo, name) => {
    set((state) => ({
      lockedTableNames: { ...state.lockedTableNames, [tableNo]: name },
    }));
  },

  syncLockedTables: (lockedList) => {
    set((state) => {
      const lockedMap: Record<string, { name: string; section: string }> = {};
      lockedList.forEach((t) => {
        const key = `${t.section}_${t.tableNo}`;
        lockedMap[key] = { name: t.lockedByName || "", section: t.section };
      });

      // 1. Update existing tables in state
      const updatedTables = state.tables.map((t) => {
        const key = `${t.section}_${t.tableNo}`;
        const lockedData = lockedMap[key];
        if (lockedData !== undefined) {
          return { ...t, status: "LOCKED" as TableStatusType, lockedByName: lockedData.name };
        } else if (t.status === "LOCKED") {
          return { ...t, status: "EMPTY" as TableStatusType, lockedByName: undefined };
        }
        return t;
      });

      // 2. Add tables that are locked but were not in the store
      lockedList.forEach((lockedItem) => {
        const exists = updatedTables.find(t => t.tableId === lockedItem.tableId.toLowerCase());
        if (!exists) {
          updatedTables.push({
            tableId: lockedItem.tableId.toLowerCase(),
            section: lockedItem.section,
            tableNo: lockedItem.tableNo,
            orderId: "RESERVED",
            startTime: 0,
            status: "LOCKED",
            lockedByName: lockedItem.lockedByName
          });
        }
      });

      const finalTables = updatedTables.filter(t => t.status !== 'EMPTY');
      const nameMap: Record<string, string> = {};
      lockedList.forEach(t => {
        const key = `${t.section}_${t.tableNo}`;
        nameMap[key] = t.lockedByName || "";
      });

      return {
        tables: finalTables,
        lockedTableNames: { ...state.lockedTableNames, ...nameMap },
      };
    });
  },

  batchUpdateTableStatus: (updates) => {
    set((state) => {
      const now = Date.now();
      const newTables = [...state.tables];
      const newMap = { ...state.tableMap };

      updates.forEach((update) => {
        const cleanUpdateId = String(update.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
        const key = `${update.section}_${update.tableNo}`;
        const lastEdit = state.lastLocalUpdate[key] || 0;

        // 🛡️ SYNC SHIELD: Ignore stale background updates
        if (now - lastEdit < 3000) return;

        const existingIndex = newTables.findIndex(
          (t) => (String(t.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase() === cleanUpdateId && !!cleanUpdateId) || (t.section === update.section && t.tableNo === update.tableNo)
        );

        const updatedTable: TableStatus = {
          ...(existingIndex > -1 ? newTables[existingIndex] : {}),
          ...update,
          tableId: cleanUpdateId || (existingIndex > -1 ? newTables[existingIndex].tableId : ""),
          startTime: update.startTime || (existingIndex > -1 ? newTables[existingIndex].startTime : 0) || Date.now(),
        };

        if (existingIndex > -1) newTables[existingIndex] = updatedTable;
        else newTables.push(updatedTable);
        
        if (updatedTable.tableId) {
          const cleanKey = String(updatedTable.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
          newMap[cleanKey] = updatedTable;
        }
      });

      return { ...state, tables: newTables, tableMap: newMap };
    });
  },

  getTables: () => get().tables,
}));

// Legacy wrappers for compatibility if needed, but components should use useTableStatusStore
export const getTables = () => useTableStatusStore.getState().getTables();
export const updateTableStatus = (
  tableId: string,
  section: string,
  tableNo: string,
  orderId: string,
  status: TableStatusType,
  startTime?: number | string,
  lockedByName?: string,
  totalAmount?: number,
  isExternal?: boolean,
  isHoldOvertime?: boolean
) => useTableStatusStore.getState().updateTableStatus(tableId, section, tableNo, orderId, status, startTime, lockedByName, totalAmount, isExternal, isHoldOvertime);
export const clearTable = (section: string, tableNo: string) => 
  useTableStatusStore.getState().clearTable(section, tableNo);

export const setTableActive = (
  tableId: string,
  section: string,
  tableNo: string,
  orderId: string,
) => {
  updateTableStatus(tableId, section, tableNo, orderId, 'SENT', Date.now());
};

export const setTableHold = (
  tableId: string,
  section: string,
  tableNo: string,
  orderId: string,
) => {
  updateTableStatus(tableId, section, tableNo, orderId, 'HOLD', Date.now());
};

