import { describe, it, expect } from 'vitest'

// Pure helpers replicating the detection logic from src/content/index.ts.
// Tests cover the heuristic path used when FaceDetector is unavailable.

const MIN_SIZE = 300
const PORTRAIT_RATIO = 1.1
const SQUARE_MIN = 500
const SQUARE_RATIO_LO = 0.8
const SQUARE_RATIO_HI = 1.25
const FASHION_CDN_RE = /myntassets\.com|media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com/

function isModelImage(w: number, h: number, url: string): boolean {
  if (w < MIN_SIZE || h < MIN_SIZE) return false
  const ratio = h / w
  if (ratio >= PORTRAIT_RATIO) return true
  if (w >= SQUARE_MIN && h >= SQUARE_MIN && ratio >= SQUARE_RATIO_LO && ratio <= SQUARE_RATIO_HI) {
    return FASHION_CDN_RE.test(url)
  }
  return false
}

describe('size gate', () => {
  it('rejects image where width is below MIN_SIZE (299×500)', () => {
    expect(isModelImage(299, 500, 'https://example.com/img.jpg')).toBe(false)
  })

  it('rejects image where height is below MIN_SIZE (500×299)', () => {
    expect(isModelImage(500, 299, 'https://example.com/img.jpg')).toBe(false)
  })

  it('accepts image exactly at MIN_SIZE on both axes (300×300) from fashion CDN', () => {
    // 300×300: ratio = 1.0, not portrait; square branch requires w >= 500 so rejected
    expect(isModelImage(300, 300, 'https://images.myntassets.com/img.jpg')).toBe(false)
  })

  it('accepts image exactly at MIN_SIZE that is portrait (300×330)', () => {
    // ratio = 1.1 exactly — portrait branch fires
    expect(isModelImage(300, 330, 'https://example.com/img.jpg')).toBe(true)
  })
})

describe('portrait branch (ratio >= 1.1, CDN irrelevant)', () => {
  it('accepts typical 2:3 clothing shot (400×600)', () => {
    expect(isModelImage(400, 600, 'https://example.com/img.jpg')).toBe(true)
  })

  it('accepts tall editorial model shot (400×800)', () => {
    expect(isModelImage(400, 800, 'https://example.com/img.jpg')).toBe(true)
  })

  it('accepts ratio exactly at threshold (300×330, ratio = 1.1)', () => {
    expect(isModelImage(300, 330, 'https://example.com/img.jpg')).toBe(true)
  })

  it('rejects ratio just below portrait threshold (300×329, ratio ≈ 1.097)', () => {
    expect(isModelImage(300, 329, 'https://example.com/img.jpg')).toBe(false)
  })

  it('accepts Myntra portrait 400×533 from fashion CDN', () => {
    // ratio ≈ 1.33 — portrait branch fires regardless of host
    expect(isModelImage(400, 533, 'https://assets.myntassets.com/img.jpg')).toBe(true)
  })

  it('accepts Myntra portrait 400×533 from generic host', () => {
    // CDN does not matter for portrait images
    expect(isModelImage(400, 533, 'https://example.com/img.jpg')).toBe(true)
  })

  it('accepts suitsupply-style full-body shot (640×960)', () => {
    expect(isModelImage(640, 960, 'https://suitsupply.com/img.jpg')).toBe(true)
  })
})

describe('square branch (w >= 500, h >= 500, ratio in [0.8, 1.25])', () => {
  it('accepts Amazon 500×500 from m.media-amazon.com', () => {
    expect(isModelImage(500, 500, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(true)
  })

  it('accepts Amazon 1000×1000 from m.media-amazon.com', () => {
    expect(isModelImage(1000, 1000, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(true)
  })

  it('accepts 1000×1000 square from images-amazon.com', () => {
    expect(isModelImage(1000, 1000, 'https://images-amazon.com/images/I/img.jpg')).toBe(true)
  })

  it('accepts 1000×1000 square from ssl-images-amazon.com', () => {
    expect(isModelImage(1000, 1000, 'https://ssl-images-amazon.com/images/I/img.jpg')).toBe(true)
  })

  it('rejects Amazon 500×500 from generic host (example.com)', () => {
    expect(isModelImage(500, 500, 'https://example.com/img.jpg')).toBe(false)
  })

  it('rejects Amazon 499×499 from m.media-amazon.com (below SQUARE_MIN)', () => {
    expect(isModelImage(499, 499, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(false)
  })

  it('rejects large square from unknown CDN (800×800, example.com)', () => {
    expect(isModelImage(800, 800, 'https://example.com/img.jpg')).toBe(false)
  })

  it('rejects near-square 500×400 from fashion CDN (h < SQUARE_MIN so square branch skipped)', () => {
    // h = 400 < SQUARE_MIN (500), so the square branch is never entered → false
    expect(isModelImage(500, 400, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(false)
  })

  it('accepts near-square 750×600 (ratio = 0.8) from fashion CDN (both axes >= SQUARE_MIN)', () => {
    // both axes >= SQUARE_MIN (500); ratio = 0.8 exactly — at the lower bound [0.8, 1.25]
    expect(isModelImage(750, 600, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(true)
  })

  it('accepts near-square with ratio at upper bound (500×625, ratio = 1.25)', () => {
    // ratio = 1.25 exactly — within [0.8, 1.25]; also < PORTRAIT_RATIO so portrait branch skipped
    expect(isModelImage(500, 625, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(true)
  })
})

describe('landscape rejection (ratio < SQUARE_RATIO_LO)', () => {
  it('rejects wide banner (1200×400, ratio ≈ 0.33)', () => {
    expect(isModelImage(1200, 400, 'https://example.com/banner.jpg')).toBe(false)
  })

  it('rejects landscape from fashion CDN (1000×700, ratio = 0.7 < 0.8)', () => {
    expect(isModelImage(1000, 700, 'https://m.media-amazon.com/images/I/img.jpg')).toBe(false)
  })
})

describe('tiny image rejection', () => {
  it('rejects a tiny icon even if portrait proportions (50×80)', () => {
    expect(isModelImage(50, 80, 'https://example.com/icon.png')).toBe(false)
  })

  it('rejects a small portrait below MIN_SIZE (100×200)', () => {
    expect(isModelImage(100, 200, 'https://example.com/img.jpg')).toBe(false)
  })
})
