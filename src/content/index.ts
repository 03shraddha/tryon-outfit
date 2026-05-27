import type { MessageToBackground } from '../types.ts'

const MIN_WIDTH = 200
const MIN_HEIGHT = 300
const MIN_PORTRAIT_RATIO = 1.1

declare class FaceDetector {
  constructor(options?: { fastMode?: boolean; maxDetectedFaces?: number })
  detect(image: HTMLImageElement): Promise<Array<{ boundingBox: DOMRectReadOnly }>>
}

const faceDetector: FaceDetector | null =
  'FaceDetector' in window
    ? new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
    : null

async function isModelImage(img: HTMLImageElement): Promise<boolean> {
  if (img.naturalWidth < MIN_WIDTH || img.naturalHeight < MIN_HEIGHT) return false

  if (faceDetector) {
    try {
      const faces = await faceDetector.detect(img)
      return faces.length > 0
    } catch {
      // Cross-origin or tainted canvas — fall through to heuristic
    }
  }

  return img.naturalHeight / img.naturalWidth >= MIN_PORTRAIT_RATIO
}

function sendToBackground(src: string): void {
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

      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener(
          'load',
          () => {
            isModelImage(img).then((yes) => {
              if (yes && !seenThisPage.has(img.src)) {
                seenThisPage.add(img.src)
                sendToBackground(img.src)
              }
            })
          },
          { once: true },
        )
        return
      }

      isModelImage(img).then((yes) => {
        if (yes && !seenThisPage.has(img.src)) {
          seenThisPage.add(img.src)
          sendToBackground(img.src)
        }
      })
    }
  },
  { threshold: 0.3 },
)

function observeImg(img: HTMLImageElement): void {
  if (img.dataset.poseObserved) return
  img.dataset.poseObserved = '1'
  intersectionObserver.observe(img)
}

document.querySelectorAll<HTMLImageElement>('img').forEach(observeImg)

new MutationObserver(() => {
  document.querySelectorAll<HTMLImageElement>('img:not([data-pose-observed])').forEach(observeImg)
}).observe(document.documentElement, { childList: true, subtree: true })
