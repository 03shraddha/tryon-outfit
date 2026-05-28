import { describe, it, expect, beforeEach } from 'vitest'
import {
  addLook,
  updateLook,
  getAllLooks,
  hasProcessed,
  getLookCount,
  getDomains,
  getLooksByDomain,
  _clearAll,
} from '../lib/db.ts'
import type { Look } from '../types.ts'

function makeLook(overrides: Partial<Look> = {}): Look {
  return {
    id: crypto.randomUUID(),
    originalSrc: `https://example.com/img-${Math.random()}.jpg`,
    domain: 'example.com',
    timestamp: Date.now(),
    status: 'pending',
    ...overrides,
  }
}

beforeEach(async () => {
  await _clearAll()
})

describe('hasProcessed', () => {
  it('returns false for a URL that has never been added', async () => {
    expect(await hasProcessed('https://never-seen.com/img.jpg')).toBe(false)
  })

  it('returns true once a look with that src is added', async () => {
    const look = makeLook({ originalSrc: 'https://shop.com/jacket.jpg' })
    await addLook(look)
    expect(await hasProcessed('https://shop.com/jacket.jpg')).toBe(true)
  })

  it('does not confuse two different URLs', async () => {
    await addLook(makeLook({ originalSrc: 'https://shop.com/a.jpg' }))
    expect(await hasProcessed('https://shop.com/b.jpg')).toBe(false)
  })
})

describe('getLookCount', () => {
  it('returns 0 when the store is empty', async () => {
    expect(await getLookCount()).toBe(0)
  })

  it('increments correctly with each add', async () => {
    await addLook(makeLook())
    expect(await getLookCount()).toBe(1)
    await addLook(makeLook())
    expect(await getLookCount()).toBe(2)
  })
})

describe('updateLook', () => {
  it('applies a partial patch without overwriting other fields', async () => {
    const look = makeLook({ status: 'pending', domain: 'nike.com' })
    await addLook(look)
    await updateLook(look.id, { status: 'done' })

    const all = await getAllLooks()
    const updated = all.find((l) => l.id === look.id)
    expect(updated?.status).toBe('done')
    expect(updated?.domain).toBe('nike.com')   // untouched field preserved
  })

  it('does not throw when updating a non-existent id', async () => {
    // Should silently do nothing rather than crash
    await expect(updateLook('ghost-id-000', { status: 'done' })).resolves.toBeUndefined()
  })

  it('stores errorMessage when patching status to error', async () => {
    const look = makeLook({ status: 'processing' })
    await addLook(look)
    await updateLook(look.id, { status: 'error', errorMessage: 'Rate limit exceeded' })

    const all = await getAllLooks()
    const updated = all.find((l) => l.id === look.id)
    expect(updated?.status).toBe('error')
    expect(updated?.errorMessage).toBe('Rate limit exceeded')
  })
})

describe('getDomains', () => {
  it('returns an empty array when no looks exist', async () => {
    expect(await getDomains()).toEqual([])
  })

  it('deduplicates domains across multiple looks', async () => {
    await addLook(makeLook({ domain: 'nike.com' }))
    await addLook(makeLook({ domain: 'nike.com' }))
    await addLook(makeLook({ domain: 'suitsupply.com' }))

    const domains = await getDomains()
    expect(domains).toHaveLength(2)
    expect(domains).toContain('nike.com')
    expect(domains).toContain('suitsupply.com')
  })
})

describe('getLooksByDomain', () => {
  it('returns only looks matching the requested domain', async () => {
    await addLook(makeLook({ domain: 'nike.com' }))
    await addLook(makeLook({ domain: 'nike.com' }))
    await addLook(makeLook({ domain: 'prada.com' }))

    const nike = await getLooksByDomain('nike.com')
    expect(nike).toHaveLength(2)
    expect(nike.every((l) => l.domain === 'nike.com')).toBe(true)
  })

  it('returns empty array for a domain with no looks', async () => {
    expect(await getLooksByDomain('unknown-brand.com')).toEqual([])
  })
})

describe('addLook duplicate src', () => {
  it('throws a constraint error on duplicate originalSrc', async () => {
    const src = 'https://shop.com/unique.jpg'
    await addLook(makeLook({ originalSrc: src }))
    // The unique index on originalSrc should reject the second insert
    await expect(addLook(makeLook({ originalSrc: src }))).rejects.toThrow()
  })
})
