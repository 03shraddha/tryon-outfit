import { addLook, updateLook, getLookCount, findLookBySrc, getAllLooks } from '../lib/db.ts'
import { swapModel } from '../lib/openai.ts'
import { normalizeImageUrl, isUnfetchableUrl } from '../lib/imageUrl.ts'
import type { Look, MessageToBackground, QueueItem } from '../types.ts'

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
  console.log(`[Pose] processImage start: ${item.src.slice(-60)}`)
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

    if (enabled === false) {
      await updateLook(item.id, { status: 'error', errorMessage: 'Extension disabled — enable it in the popup' })
      return
    }
    if (!selfie1) {
      await updateLook(item.id, { status: 'error', errorMessage: 'No photo — add your selfie in the popup' })
      return
    }
    if (!apiKey) {
      await updateLook(item.id, { status: 'error', errorMessage: 'No API key — add your OpenAI key in the popup' })
      return
    }

    const selfies = [selfie1, ...(selfie2 ? [selfie2] : [])]

    const limit = dailyLimit ?? DAILY_LIMIT_DEFAULT
    const used = await getDailyCount()
    if (used >= limit) {
      await updateLook(item.id, { status: 'error', errorMessage: `Daily limit of ${limit} reached — increase it in the popup` })
      return
    }

    await updateLook(item.id, { status: 'processing' })

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

    console.log(`[Pose] processImage done: ${item.src.slice(-60)}`)
    await updateLook(item.id, { status: 'done', processedBlob })
    await incrementDailyCount()

    const count = await getLookCount()
    await chrome.action.setBadgeText({ text: String(count) })
    await chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Pose] processImage error for ${item.src.slice(-60)}:`, msg)
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

async function dbg(event: string, detail = ''): Promise<void> {
  await chrome.storage.local.set({
    poseDebug: { event, detail, t: new Date().toLocaleTimeString() },
  })
}

async function handleQueueImage(src: string, domain: string): Promise<void> {
  console.log('[Pose] handleQueueImage start:', src.slice(-60))
  void dbg('handleQueueImage', src.slice(-50))
  const existing = await findLookBySrc(src)

  if (existing?.status === 'done') {
    console.log('[Pose] already done, skipping')
    return
  }

  if (existing?.status === 'error') {
    console.log('[Pose] re-queuing errored look:', existing.id)
    await updateLook(existing.id, { status: 'pending', timestamp: Date.now() })
    queuedUrls.add(src)
    queue.push({ id: existing.id, src, domain })
    processNext()
    return
  }

  if (existing) {
    console.log('[Pose] look already exists (status:', existing.status, '), re-queuing')
    queuedUrls.add(src)
    queue.push({ id: existing.id, src, domain })
    processNext()
    return
  }

  const id = crypto.randomUUID()
  queuedUrls.add(src)

  try {
    await addLook({ id, originalSrc: src, domain, timestamp: Date.now(), status: 'pending' })
    console.log('[Pose] addLook success, queuing:', src.slice(-60))
    void dbg('addLook_ok', src.slice(-50))
    const count = await getLookCount()
    void chrome.action.setBadgeText({ text: String(count) })
    void chrome.action.setBadgeBackgroundColor({ color: '#888888' })
    queue.push({ id, src, domain })
    processNext()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[Pose] addLook failed:', msg)
    void dbg('addLook_err', msg)
    const dup = await findLookBySrc(src)
    if (dup) {
      console.log('[Pose] found duplicate look, status:', dup.status)
      void dbg('addLook_dup', dup.status)
      if (dup.status !== 'done') {
        queue.push({ id: dup.id, src, domain })
        processNext()
      }
    } else {
      console.error('[Pose] addLook failed AND no duplicate found — look lost:', src)
      void dbg('addLook_lost', msg)
    }
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
  if (isUnfetchableUrl(src)) {
    console.debug('[Pose] QUEUE_IMAGE rejected (unfetchable):', src.slice(-60))
    return
  }
  if (queuedUrls.has(src)) {
    console.debug('[Pose] QUEUE_IMAGE already queued:', src.slice(-60))
    return
  }

  console.log('[Pose] QUEUE_IMAGE received:', src.slice(-60))
  void dbg('QUEUE_IMAGE', src.slice(-50))
  void handleQueueImage(src, domain)
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' })
})

// Recover items that were left pending/processing when the service worker was killed.
// MV3 service workers die after ~30s of inactivity; the in-memory queue is wiped on
// restart but DB records remain, so we need to re-enqueue them here.
;(async () => {
  const looks = await getAllLooks().catch(() => [] as Look[])
  for (const look of looks) {
    if (look.status !== 'pending' && look.status !== 'processing') continue
    if (look.status === 'processing') await updateLook(look.id, { status: 'pending' })
    if (!queuedUrls.has(look.originalSrc)) {
      queuedUrls.add(look.originalSrc)
      queue.push({ id: look.id, src: look.originalSrc, domain: look.domain })
    }
  }
  if (queue.length > 0) processNext()
})()
