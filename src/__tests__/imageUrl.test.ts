import { describe, it, expect } from 'vitest'
import {
  normalizeMyntraUrl,
  normalizeAmazonUrl,
  normalizeImageUrl,
  isUnfetchableUrl,
  isPlaceholderDataUri,
} from '../lib/imageUrl.ts'

// ---------------------------------------------------------------------------
// normalizeMyntraUrl
// ---------------------------------------------------------------------------
describe('normalizeMyntraUrl', () => {
  it('strips a typical h_/q_/w_ transform segment', () => {
    expect(
      normalizeMyntraUrl(
        'https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/images/foo.jpg',
      ),
    ).toBe('https://assets.myntassets.com/v1/assets/images/foo.jpg')
  })

  it('strips a single-param transform segment (w_ only)', () => {
    expect(
      normalizeMyntraUrl('https://assets.myntassets.com/w_200/v1/assets/images/bar.jpg'),
    ).toBe('https://assets.myntassets.com/v1/assets/images/bar.jpg')
  })

  it('leaves non-Myntra URLs unchanged', () => {
    const url = 'https://example.com/h_720,q_90,w_540/image.jpg'
    expect(normalizeMyntraUrl(url)).toBe(url)
  })

  it('returns the URL unchanged when there is no transform segment', () => {
    const url = 'https://assets.myntassets.com/v1/assets/images/clean.jpg'
    expect(normalizeMyntraUrl(url)).toBe(url)
  })

  it('handles URLs with query strings and preserves them', () => {
    const result = normalizeMyntraUrl(
      'https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/images/foo.jpg?v=2',
    )
    expect(result).toBe('https://assets.myntassets.com/v1/assets/images/foo.jpg?v=2')
  })

  it('strips a multi-param transform segment with c_fill', () => {
    expect(
      normalizeMyntraUrl(
        'https://assets.myntassets.com/w_200,c_fill,q_auto/v1/assets/images/bar.jpg',
      ),
    ).toBe('https://assets.myntassets.com/v1/assets/images/bar.jpg')
  })

  it('strips only the first transform segment when multiple are present', () => {
    // After stripping the first segment /h_720,q_90,w_540/, the second /w_200,c_fill/
    // remains — this is correct behaviour (real Myntra URLs have at most one segment).
    const result = normalizeMyntraUrl(
      'https://assets.myntassets.com/h_720,q_90,w_540/w_200,c_fill/v1/assets/images/multi.jpg',
    )
    expect(result).toBe(
      'https://assets.myntassets.com/w_200,c_fill/v1/assets/images/multi.jpg',
    )
  })
})

// ---------------------------------------------------------------------------
// normalizeAmazonUrl
// ---------------------------------------------------------------------------
describe('normalizeAmazonUrl', () => {
  it('replaces _SX500_ with _SL1500_', () => {
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71abc._SX500_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('replaces _AC_UL320_ with _SL1500_', () => {
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71abc._AC_UL320_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('replaces _AC_UL1500_ with _SL1500_ (already large, still normalizes token form)', () => {
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71abc._AC_UL1500_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('replaces _AC_SL1500_ with _SL1500_', () => {
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('leaves URLs without a size specifier unchanged', () => {
    const url = 'https://m.media-amazon.com/images/I/71abc.jpg'
    expect(normalizeAmazonUrl(url)).toBe(url)
  })

  it('leaves non-Amazon URLs unchanged', () => {
    const url = 'https://example.com/images/71abc._SX500_.jpg'
    expect(normalizeAmazonUrl(url)).toBe(url)
  })

  it('handles ssl-images-amazon.com hostname', () => {
    expect(
      normalizeAmazonUrl('https://images-amazon.com/images/I/foo._SX300_.jpg'),
    ).toBe('https://images-amazon.com/images/I/foo._SL1500_.jpg')
  })

  it('handles images-na.ssl-images-amazon.com hostname', () => {
    expect(
      normalizeAmazonUrl(
        'https://images-na.ssl-images-amazon.com/images/I/71abc._AC_SY355_.jpg',
      ),
    ).toBe('https://images-na.ssl-images-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('replaces _AC_SY355_ with _SL1500_', () => {
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71abc._AC_SY355_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('handles a size token mid-filename (multiple dots before extension)', () => {
    // Token is not at the very first dot — still replaced because regex is not anchored.
    expect(
      normalizeAmazonUrl('https://m.media-amazon.com/images/I/71a.b.c._SX500_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71a.b.c._SL1500_.jpg')
  })
})

// ---------------------------------------------------------------------------
// normalizeImageUrl (combined)
// ---------------------------------------------------------------------------
describe('normalizeImageUrl', () => {
  it('applies Myntra normalization', () => {
    expect(
      normalizeImageUrl('https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/foo.jpg'),
    ).toBe('https://assets.myntassets.com/v1/assets/foo.jpg')
  })

  it('applies Amazon normalization', () => {
    expect(
      normalizeImageUrl('https://m.media-amazon.com/images/I/71abc._AC_UL320_.jpg'),
    ).toBe('https://m.media-amazon.com/images/I/71abc._SL1500_.jpg')
  })

  it('leaves unrecognized CDN URLs unchanged', () => {
    const url = 'https://cdn.shopify.com/s/files/1/product.jpg'
    expect(normalizeImageUrl(url)).toBe(url)
  })

  it('Amazon normalization is a no-op for Myntra URL (wrong hostname)', () => {
    // normalizeAmazonUrl should not touch myntassets.com URLs
    const myntraUrl = 'https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/foo._SX500_.jpg'
    expect(normalizeImageUrl(myntraUrl)).toBe(
      'https://assets.myntassets.com/v1/assets/foo._SX500_.jpg',
    )
  })

  it('Myntra normalization is a no-op for Amazon URL (wrong hostname)', () => {
    // normalizeMyntraUrl should not touch media-amazon.com URLs
    const amazonUrl = 'https://m.media-amazon.com/images/I/71abc._AC_UL320_.jpg'
    expect(normalizeImageUrl(amazonUrl)).toBe(
      'https://m.media-amazon.com/images/I/71abc._SL1500_.jpg',
    )
  })
})

// ---------------------------------------------------------------------------
// isUnfetchableUrl
// ---------------------------------------------------------------------------
describe('isUnfetchableUrl', () => {
  it('rejects data: URIs', () => {
    expect(isUnfetchableUrl('data:image/gif;base64,R0lGODlh...')).toBe(true)
  })

  it('rejects blob: URLs', () => {
    expect(isUnfetchableUrl('blob:https://example.com/uuid-123')).toBe(true)
  })

  it('accepts https URLs', () => {
    expect(isUnfetchableUrl('https://assets.myntassets.com/foo.jpg')).toBe(false)
  })

  it('accepts http URLs', () => {
    expect(isUnfetchableUrl('http://example.com/product.jpg')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isPlaceholderDataUri
// ---------------------------------------------------------------------------
describe('isPlaceholderDataUri', () => {
  it('detects the transparent GIF placeholder used by most lazy-loaders', () => {
    expect(
      isPlaceholderDataUri(
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      ),
    ).toBe(true)
  })

  it('detects a short unknown data URI as a likely placeholder', () => {
    expect(isPlaceholderDataUri('data:image/gif;base64,abc123')).toBe(true)
  })

  it('returns false for a real https URL', () => {
    expect(isPlaceholderDataUri('https://assets.myntassets.com/foo.jpg')).toBe(false)
  })

  it('returns false for a long data URI that could be a real image', () => {
    const longB64 = 'A'.repeat(300)
    expect(isPlaceholderDataUri(`data:image/png;base64,${longB64}`)).toBe(false)
  })

  it('detects the second known GIF placeholder (alt encoding)', () => {
    expect(
      isPlaceholderDataUri(
        'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      ),
    ).toBe(true)
  })

  it('detects the known PNG placeholder', () => {
    expect(
      isPlaceholderDataUri(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      ),
    ).toBe(true)
  })

  it('returns false for a blob: URL', () => {
    expect(isPlaceholderDataUri('blob:https://example.com/uuid-123')).toBe(false)
  })
})
