import type { MessageToBackground, MessageToContent } from '../types.ts'
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
  if (w < MIN_SIZE || h < MIN_SIZE) return false
  const ratio = h / w
  if (ratio >= PORTRAIT_RATIO) return true
  if (w >= SQUARE_MIN && h >= SQUARE_MIN && ratio >= SQUARE_RATIO_LO && ratio <= SQUARE_RATIO_HI)
    return FASHION_CDN_RE.test(url)
  return false
}

function sendToBackground(src: string): void {
  if (isUnfetchableUrl(src)) return

  const message: MessageToBackground = {
    type: 'QUEUE_IMAGE',
    src,
    domain: location.hostname.replace(/^www\./, ''),
  }
  chrome.runtime.sendMessage(message).catch(() => {
    // Extension context may be invalidated on navigation — ignore
  })
}

const seenThisPage = new Set<string>()

function evaluateImgNow(img: HTMLImageElement): void {
  const url = resolveUrl(img)
  if (!url || isUnfetchableUrl(url) || isPlaceholderDataUri(url) || seenThisPage.has(url)) return

  if (!img.complete || img.naturalWidth === 0 || img.naturalWidth < MIN_SIZE) {
    img.addEventListener(
      'load',
      () => {
        const loadedUrl = resolveUrl(img)
        if (!seenThisPage.has(loadedUrl) && isModelImage(img, loadedUrl)) {
          seenThisPage.add(loadedUrl)
          sendToBackground(loadedUrl)
        }
      },
      { once: true },
    )
    return
  }

  if (isModelImage(img, url) && !seenThisPage.has(url)) {
    seenThisPage.add(url)
    sendToBackground(url)
  }
}

// Only start scanning when popup explicitly requests it for this tab.
// Each click does a one-time snapshot of images currently visible in the
// viewport — no scroll observers, so only what you see right now gets queued.
chrome.runtime.onMessage.addListener((message: MessageToContent, _sender, sendResponse) => {
  if (message.type !== 'START_SCAN') return
  sendResponse({ ok: true })  // must respond or popup's await rejects

  const { innerHeight, innerWidth } = window
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const rect = img.getBoundingClientRect()
    const inViewport = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
    if (inViewport) evaluateImgNow(img)
  }
})
