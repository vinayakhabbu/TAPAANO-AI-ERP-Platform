const fallbackStorage = new Map<string, string>();

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const safeBrowserStorage = {
  getItem(key: string): string | null {
    try {
      const value = browserStorage()?.getItem(key);
      if (value !== null && value !== undefined) {
        fallbackStorage.set(key, value);
        return value;
      }
    } catch {
      // Continue with the process-local fallback when browser storage is blocked.
    }
    return fallbackStorage.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    fallbackStorage.set(key, value);
    try {
      browserStorage()?.setItem(key, value);
    } catch {
      // Authentication remains usable for this page lifecycle without persistence.
    }
  },

  removeItem(key: string): void {
    fallbackStorage.delete(key);
    try {
      browserStorage()?.removeItem(key);
    } catch {
      // The fallback has already been cleared.
    }
  },
};
