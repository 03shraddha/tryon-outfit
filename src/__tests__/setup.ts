// Polyfills all IDB globals (IDBFactory, IDBRequest, IDBDatabase, etc.)
import 'fake-indexeddb/auto'

// Minimal chrome stub (only what the tested modules actually call)
Object.defineProperty(globalThis, 'chrome', {
  value: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
  },
  writable: true,
})
