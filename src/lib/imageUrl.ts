/**
 * URL normalization utilities for CDN image URLs.
 *
 * Rules implemented:
 *  - Myntra: strip Cloudinary-style transformation segment from the path
 *    e.g. /h_720,q_90,w_540/v1/assets/... → /v1/assets/...
 *  - Amazon: replace underscore-delimited size specifiers with a larger preset
 *    e.g. ._SX500_  ._AC_UL320_  ._AC_SL1500_ → ._SL1500_
 *  - Placeholder detection: data URIs, blob: URLs, 1×1 tracking pixels
 */

// Matches any Cloudinary-style transform segment at the start of a path component,
// e.g. /h_720,q_90,w_540/ or /w_200,c_fill,q_auto/
const CLOUDINARY_TRANSFORM_RE = /\/(?:[a-z]{1,2}_[^,/]+,?)+\//

// test-only: prefer normalizeImageUrl in production
/**
 * Strip Cloudinary transform parameters from Myntra CDN URLs.
 *
 * Input:  https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/images/foo.jpg
 * Output: https://assets.myntassets.com/v1/assets/images/foo.jpg
 */
export function normalizeMyntraUrl(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('myntassets.com')) return url
    // Replace the first transform segment in the path
    const cleaned = u.pathname.replace(CLOUDINARY_TRANSFORM_RE, '/')
    if (cleaned === u.pathname) return url
    u.pathname = cleaned
    return u.toString()
  } catch {
    return url
  }
}

// Matches Amazon size/quality specifiers like ._SX500_  ._AC_UL1500_  ._SL320_  ._AC_SX425_
// They appear as dot-underscore tokens before the file extension.
const AMAZON_SIZE_RE = /\._[A-Z0-9_]+_(?=\.\w{2,5}$)/

// test-only: prefer normalizeImageUrl in production
/**
 * Upgrade Amazon product image URLs to a higher-resolution variant.
 *
 * Strategy: replace any size specifier token with ._SL1500_ (max side = 1500px,
 * the largest standard Amazon preset that doesn't require authentication).
 *
 * Input:  https://m.media-amazon.com/images/I/71xxx._AC_UL320_.jpg
 * Output: https://m.media-amazon.com/images/I/71xxx._SL1500_.jpg
 *
 * Input:  https://m.media-amazon.com/images/I/71xxx._SX500_.jpg
 * Output: https://m.media-amazon.com/images/I/71xxx._SL1500_.jpg
 */
export function normalizeAmazonUrl(url: string): string {
  try {
    const u = new URL(url)
    if (
      !u.hostname.includes('media-amazon.com') &&
      !u.hostname.includes('images-amazon.com') &&
      !u.hostname.includes('ssl-images-amazon.com')
    ) {
      return url
    }
    const cleaned = u.pathname.replace(AMAZON_SIZE_RE, '._SL1500_')
    if (cleaned === u.pathname) return url
    u.pathname = cleaned
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Apply all CDN normalizations. Safe to call on any URL — unknown domains
 * are returned unchanged.
 */
export function normalizeImageUrl(url: string): string {
  let out = url
  out = normalizeMyntraUrl(out)
  out = normalizeAmazonUrl(out)
  return out
}

/** Known 1×1 placeholder data-URIs used by lazy-loading libraries. */
const PLACEHOLDER_DATA_URIS = new Set([
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
])

/**
 * Return true if the URL should be skipped entirely before queuing or fetching.
 *
 * Rejected cases:
 *  - data: URIs (can't be re-fetched at higher res; may be a placeholder)
 *  - blob: URLs (local object URLs created by JS; not available in the service worker)
 *  - Known 1×1 placeholder data URIs from lazy-loaders
 */
export function isUnfetchableUrl(url: string): boolean {
  if (url.startsWith('data:')) return true
  if (url.startsWith('blob:')) return true
  return false
}

/**
 * Return true if the src is a known 1×1 transparent placeholder.
 * More specific than isUnfetchableUrl — used in the content script where
 * we can cheaply check before even doing naturalWidth/Height checks.
 */
export function isPlaceholderDataUri(src: string): boolean {
  if (!src.startsWith('data:')) return false
  // Exact match against known placeholders
  if (PLACEHOLDER_DATA_URIS.has(src)) return true
  // Heuristic: any data: URI shorter than 200 chars is almost certainly a 1×1 pixel
  return src.length < 200
}
