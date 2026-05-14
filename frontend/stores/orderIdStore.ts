// ⚠️ DEPRECATED: This store was used for legacy local Order ID generation.
// Order IDs are now generated strictly on the Backend for professionalism and database integrity.
// Do NOT use getNextOrderId() or this store for new features.

export const getNextOrderId = () => {
  console.warn("⚠️ [DEPRECATED] getNextOrderId called. Please use backend-generated IDs.");
  return "OLD-GEN";
};

export const useOrderIdStore = {
  getState: () => ({
    nextNumber: 0,
    syncWithBackend: async () => {}
  })
};
