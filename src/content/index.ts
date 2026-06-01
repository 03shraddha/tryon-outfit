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

const intersectionObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const img = entry.target as HTMLImageElement
      intersectionObserver.unobserve(img)

      if (!img.complete || img.naturalWidth === 0 || img.naturalWidth < MIN_SIZE) {
        img.addEventListener(
          'load',
          () => {
            const url = resolveUrl(img)
            if (isUnfetchableUrl(url) || isPlaceholderDataUri(url)) return
            if (isModelImage(img, url) && !seenThisPage.has(url)) {
              seenThisPage.add(url)
              sendToBackground(url)
            }
          },
          { once: true },
        )
        continue
      }

      const url = resolveUrl(img)
      if (isModelImage(img, url) && !seenThisPage.has(url)) {
        seenThisPage.add(url)
        sendToBackground(url)
      }
    }
  },
  { threshold: 0.3 },
)

function observeImg(img: HTMLImageElement): void {
  if (img.dataset.poseObserved) return
  img.dataset.poseObserved = '1'
  intersectionObserver.observe(img)
}

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

let scanStarted = false

// Only start scanning when popup explicitly requests it for this tab
chrome.runtime.onMessage.addListener((message: MessageToContent) => {
  if (message.type !== 'START_SCAN') return
  if (scanStarted) return
  scanStarted = true

  document.querySelectorAll<HTMLImageElement>('img').forEach(observeImg)

  new MutationObserver(() => {
    document.querySelectorAll<HTMLImageElement>('img:not([data-pose-observed])').forEach(observeImg)
  }).observe(document.documentElement, { childList: true, subtree: true })

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'attributes') continue
      const img = mutation.target as HTMLImageElement
      evaluateImgNow(img)
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true })
})
