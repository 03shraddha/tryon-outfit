import type { MessageToBackground, MessageToContent, ScanResult } from '../types.ts'
import { isUnfetchableUrl, isPlaceholderDataUri } from '../lib/imageUrl.ts'

const MIN_SIZE = 300
const PORTRAIT_RATIO = 1.1
const SQUARE_MIN = 500
const SQUARE_RATIO_LO = 0.8
const SQUARE_RATIO_HI = 1.25
const FASHION_CDN_RE = /myntassets\.com|media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com/

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-hi-res'] as const

function resolveUrl(img: HTMLImageElement): string {
  if (img.currentSrc) return img.currentSrc
  for (const attr of LAZY_ATTRS) {
    const val = img.getAttribute(attr)
    if (val && !val.startsWith('data:')) return val
  }
  return img.src
}

function isModelImage(img: HTMLImageElement, url: string): boolean {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w < MIN_SIZE || h < MIN_SIZE) {
    console.debug(`[Pose] skip (too small ${w}×${h}):`, url.slice(-60))
    return false
  }
  const ratio = h / w
  if (ratio >= PORTRAIT_RATIO) {
    console.debug(`[Pose] PASS (portrait ${ratio.toFixed(2)}):`, url.slice(-60))
    return true
  }
  if (w >= SQUARE_MIN && h >= SQUARE_MIN && ratio >= SQUARE_RATIO_LO && ratio <= SQUARE_RATIO_HI) {
    if (FASHION_CDN_RE.test(url)) {
      console.debug(`[Pose] PASS (square from fashion CDN):`, url.slice(-60))
      return true
    }
    console.debug(`[Pose] skip (square but not fashion CDN):`, url.slice(-60))
    return false
  }
  console.debug(`[Pose] skip (ratio ${ratio.toFixed(2)}, not portrait/square):`, url.slice(-60))
  return false
}

function sendToBackground(src: string): void {
  if (isUnfetchableUrl(src)) return

  const message: MessageToBackground = {
    type: 'QUEUE_IMAGE',
    src,
    domain: location.hostname.replace(/^www\./, ''),
  }
  chrome.runtime.sendMessage(message).catch((err) => {
    console.warn('[Pose] Failed to send QUEUE_IMAGE to background (lazy load):', err)
  })
}

const seenThisPage = new Set<string>()
const pendingLazyUrls: string[] = []

const resetSeen = () => seenThisPage.clear()
window.addEventListener('popstate', resetSeen)
window.addEventListener('hashchange', resetSeen)

type EvalResult = 'queued' | 'lazy' | 'skipped' | 'seen'

function evaluateImgNow(img: HTMLImageElement): EvalResult {
  const url = resolveUrl(img)
  if (!url) return 'skipped'
  if (isUnfetchableUrl(url)) {
    console.debug('[Pose] skip (unfetchable):', url.slice(-60))
    return 'skipped'
  }
  if (isPlaceholderDataUri(url)) return 'skipped'
  if (seenThisPage.has(url)) return 'seen'

  if (!img.complete || img.naturalWidth === 0 || img.naturalWidth < MIN_SIZE) {
    console.debug(`[Pose] lazy (not loaded yet, src=${img.naturalWidth}×${img.naturalHeight}):`, url.slice(-60))
    img.addEventListener(
      'load',
      () => {
        const loadedUrl = resolveUrl(img)
        if (!seenThisPage.has(loadedUrl) && isModelImage(img, loadedUrl)) {
          seenThisPage.add(loadedUrl)
          sendToBackground(loadedUrl)    // primary: works in production at all times
          pendingLazyUrls.push(loadedUrl) // fallback: popup follow-up drains this in dev
        }
      },
      { once: true },
    )
    return 'lazy'
  }

  if (isModelImage(img, url)) {
    seenThisPage.add(url)
    sendToBackground(url)
    return 'queued'
  }
  return 'skipped'
}

chrome.runtime.onMessage.addListener((message: MessageToContent, _sender, sendResponse) => {
  if (message.type !== 'START_SCAN') return

  const { innerHeight, innerWidth } = window
  let queued = 0, lazy = 0, skipped = 0, viewport = 0
  const srcs: string[] = []
  const domain = location.hostname.replace(/^www\./, '')

  // Drain URLs from lazy-load events that fired since the last scan.
  // These are stored here instead of calling sendToBackground() directly,
  // since that fails silently when the content script context is invalidated.
  const drained = pendingLazyUrls.splice(0)
  for (const u of drained) {
    srcs.push(u)
    queued++
  }

  const allImgs = document.querySelectorAll<HTMLImageElement>('img')
  console.log(`[Pose] Scan started — ${allImgs.length} total <img> elements on page`)

  for (const img of Array.from(allImgs)) {
    const rect = img.getBoundingClientRect()
    const inViewport =
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
    if (!inViewport) continue
    viewport++
    const result = evaluateImgNow(img)
    if (result === 'queued') {
      queued++
      // Collect the URL so the popup (which has a valid chrome context) can send it to the background.
      // This avoids the invalidated-context problem: after an extension reload the content script can
      // still respond to messages but its chrome.runtime / chrome.storage APIs are dead.
      const url = resolveUrl(img)
      if (url) srcs.push(url)
    } else if (result === 'lazy') lazy++
    else skipped++
  }

  console.log(
    `[Pose] Scan done — viewport: ${viewport}, queued: ${queued}, lazy: ${lazy}, skipped: ${skipped}`,
  )

  const result: ScanResult = { ok: true, viewport, queued, lazy, skipped, srcs, domain }
  sendResponse(result)
})
