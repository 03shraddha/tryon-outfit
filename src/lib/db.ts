import { openDB, type IDBPDatabase } from 'idb'
import type { Look } from '../types.ts'

const DB_NAME = 'pose-db'
const DB_VERSION = 1
const STORE = 'looks'

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('domain', 'domain')
      store.createIndex('timestamp', 'timestamp')
      store.createIndex('originalSrc', 'originalSrc', { unique: true })
    },
  })
}

export async function addLook(look: Look): Promise<void> {
  const db = await getDb()
  await db.add(STORE, look)
}

export async function updateLook(id: string, patch: Partial<Look>): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  const existing = await tx.store.get(id)
  if (existing) {
    await tx.store.put({ ...existing, ...patch })
  }
  await tx.done
}

export async function getAllLooks(): Promise<Look[]> {
  const db = await getDb()
  return db.getAllFromIndex(STORE, 'timestamp')
}

// test-only: not called from production code
export async function getLooksByDomain(domain: string): Promise<Look[]> {
  const db = await getDb()
  return db.getAllFromIndex(STORE, 'domain', domain)
}

export async function findLookBySrc(src: string): Promise<Look | undefined> {
  const db = await getDb()
  return db.getFromIndex(STORE, 'originalSrc', src) as Promise<Look | undefined>
}

// test-only: not called from production code
export async function hasProcessed(src: string): Promise<boolean> {
  const result = await findLookBySrc(src)
  return result?.status === 'done'
}

export async function getLookCount(): Promise<number> {
  const db = await getDb()
  return db.count(STORE)
}

export async function getDomains(): Promise<string[]> {
  const all = await getAllLooks()
  return [...new Set(all.map((l) => l.domain))]
}

export async function clearFailedLooks(): Promise<void> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as Look[]
  const tx = db.transaction(STORE, 'readwrite')
  for (const look of all) {
    if (look.status === 'error') await tx.store.delete(look.id)
  }
  await tx.done
}

// Only used in tests — clears all records without dropping the database
export async function _clearAll(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
