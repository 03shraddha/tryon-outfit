import { describe, it, expect } from 'vitest'

// Pure helpers extracted from the content script detection logic.
// These cover the heuristic path (no FaceDetector available).

const MIN_WIDTH = 200
const MIN_HEIGHT = 300
const MIN_PORTRAIT_RATIO = 1.1

function isLargeEnough(w: number, h: number): boolean {
  return w >= MIN_WIDTH && h >= MIN_HEIGHT
}

function isPortrait(w: number, h: number): boolean {
  return h / w >= MIN_PORTRAIT_RATIO
}

function shouldQueue(w: number, h: number): boolean {
  return isLargeEnough(w, h) && isPortrait(w, h)
}

describe('size filter', () => {
  it('rejects images narrower than 200px', () => {
    expect(isLargeEnough(199, 400)).toBe(false)
  })

  it('rejects images shorter than 300px', () => {
    expect(isLargeEnough(300, 299)).toBe(false)
  })

  it('accepts images exactly at the minimum', () => {
    expect(isLargeEnough(200, 300)).toBe(true)
  })

  it('accepts large product images', () => {
    expect(isLargeEnough(800, 1000)).toBe(true)
  })
})

describe('portrait ratio heuristic', () => {
  it('rejects landscape images (banner ads, hero shots)', () => {
    expect(isPortrait(1200, 400)).toBe(false)
  })

  it('rejects square images', () => {
    // ratio = 1.0, below threshold of 1.1
    expect(isPortrait(500, 500)).toBe(false)
  })

  it('accepts typical clothing product shots (2:3 ratio)', () => {
    expect(isPortrait(400, 600)).toBe(true)
  })

  it('accepts tall editorial / model shots', () => {
    expect(isPortrait(400, 800)).toBe(true)
  })

  it('accepts ratio right at the threshold (1.1)', () => {
    expect(isPortrait(100, 110)).toBe(true)
  })

  it('rejects ratio just below threshold (1.09)', () => {
    expect(isPortrait(100, 109)).toBe(false)
  })
})

describe('shouldQueue (combined filter)', () => {
  it('rejects a small portrait image (too small)', () => {
    expect(shouldQueue(100, 200)).toBe(false)
  })

  it('rejects a large landscape image (wrong shape)', () => {
    expect(shouldQueue(800, 400)).toBe(false)
  })

  it('accepts a typical model product image', () => {
    // 600x900 — standard product photography ratio
    expect(shouldQueue(600, 900)).toBe(true)
  })

  it('rejects a tiny icon even if portrait', () => {
    expect(shouldQueue(50, 80)).toBe(false)
  })

  it('accepts a suitsupply-style full-body shot', () => {
    // Suitsupply usually 640x960
    expect(shouldQueue(640, 960)).toBe(true)
  })
})
