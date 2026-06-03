import { addLook, updateLook, getLookCount, findLookBySrc } from '../lib/db.ts'
import { swapModel } from '../lib/openai.ts'
import { normalizeImageUrl, isUnfetchableUrl } from '../lib/imageUrl.ts'
import type { MessageToBackground, QueueItem } from '../types.ts'

const queue: QueueItem[] = []
const queuedUrls = new Set<string>()
let inflight = 0
const MAX_CONCURRENT = 1
const DAILY_LIMIT_DEFAULT = 50

async function getDailyCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const result = await chrome.storage.local.get('dailyUsage')
  const usage = result.dailyUsage as { date: string; count: number } | undefined
  if (!usage || usage.date !== today) return 0
  return usage.count
}

async function incrementDailyCount(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const count = await getDailyCount()
  await chrome.storage.local.set({ dailyUsage: { date: today, count: count + 1 } })
}

async function processImage(item: QueueItem): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(['selfie1', 'selfie2', 'selfie', 'apiKey', 'enabled', 'dailyLimit'])
    const raw = stored as {
      selfie1?: string
      selfie2?: string
      selfie?: string
      apiKey?: string
      enabled?: boolean
      dailyLimit?: number
    }
    const dailyLimit = raw.dailyLimit

    // Migrate old single-selfie key to selfie1 and remove the old key
    if (!raw.selfie1 && raw.selfie) {
      await chrome.storage.local.set({ selfie1: raw.selfie })
      await chrome.storage.local.remove('selfie')
      raw.selfie1 = raw.selfie
    }

    const { selfie1, selfie2, apiKey, enabled } = raw

    if (enabled === false) return
    if (!selfie1 || !apiKey) return

    const selfies = [selfie1, ...(selfie2 ? [selfie2] : [])]

    const limit = dailyLimit ?? DAILY_LIMIT_DEFAULT
    const used = await getDailyCount()
    if (used >= limit) return

    await updateLook(item.id, { status: 'processing' })

    // Defensive re-check: the content script should never send these, but
    // guard here too so a stale queue entry can't cause a confusing error.
    if (isUnfetchableUrl(item.src)) {
      throw new Error(`Unfetchable URL scheme: ${item.src.slice(0, 30)}`)
    }

    // Upgrade low-res CDN URLs to the highest-quality variant available
    // without authentication (Myntra Cloudinary transforms, Amazon size tokens).
    const fetchUrl = normalizeImageUrl(item.src)

    const productRes = await fetch(fetchUrl)
    if (!productRes.ok) throw new Error(`Failed to fetch product image: HTTP ${productRes.status}`)

    // Reject responses that look like HTML error pages served with 200 status
    // (common from CDNs that serve a "Not Found" HTML page instead of 404).
    const contentType = productRes.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unexpected content-type from CDN: ${contentType.split(';')[0]}`)
    }

    const productBlob = await productRes.blob()

    // A valid image blob should have non-zero size. A 1×1 placeholder that
    // somehow slipped through would typically be < 100 bytes.
    if (productBlob.size < 1024) {
      throw new Error(`Product image too small to process (${productBlob.size} bytes)`)
    }

    const processedBlob = await swapModel(productBlob, selfies, apiKey)

    await updateLook(item.id, { status: 'done', processedBlob })
    await incrementDailyCount()

    const count = await getLookCount()
    await chrome.action.setBadgeText({ text: String(count) })
    await chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await updateLook(item.id, { status: 'error', errorMessage: msg })
  }
}

function processNext(): void {
  while (inflight < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!
    inflight++
    processImage(item).finally(() => {
      inflight--
      processNext()
    })
  }
}

chrome.runtime.onMessage.addListener((message: MessageToBackground, _sender, sendResponse) => {
  if (message.type === 'CLEAR_QUEUE') {
    queue.length = 0
    queuedUrls.clear()
    sendResponse({ ok: true })
    return
  }

  if (message.type === 'GET_QUEUE_SIZE') {
    sendResponse({ size: queue.length + inflight })
    return
  }

  if (message.type !== 'QUEUE_IMAGE') return

  const { src, domain } = message

  // Drop data: and blob: URLs immediately — they can't be fetched from a
  // service worker and were not supposed to be sent by the content script.
  if (isUnfetchableUrl(src)) return

  if (queuedUrls.has(src)) return

  findLookBySrc(src).then(async (existing) => {
    // Already successfully processed — don't re-run
    if (existing?.status === 'done') return

    if (existing?.status === 'error') {
      // Reset the failed record and requeue it for a retry
      await updateLook(existing.id, { status: 'pending', timestamp: Date.now() })
      queuedUrls.add(src)
      queue.push({ id: existing.id, src, domain })
      processNext()
      return
    }

    if (existing) {
      // pending/processing from a previous service-worker session — just requeue
      queuedUrls.add(src)
      queue.push({ id: existing.id, src, domain })
      processNext()
      return
    }

    const id = crypto.randomUUID()
    queuedUrls.add(src)

    addLook({
      id,
      originalSrc: src,
      domain,
      timestamp: Date.now(),
      status: 'pending',
    }).then(() => {
      queue.push({ id, src, domain })
      processNext()
    })
  })
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' })
})
