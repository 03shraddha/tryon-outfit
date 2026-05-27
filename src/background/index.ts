import { addLook, updateLook, getLookCount, hasProcessed } from '../lib/db.ts'
import { swapModel } from '../lib/openai.ts'
import type { MessageToBackground, QueueItem } from '../types.ts'

const queue: QueueItem[] = []
const queuedUrls = new Set<string>()
let inflight = 0
const MAX_CONCURRENT = 2
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
    const stored = await chrome.storage.local.get(['selfie', 'apiKey', 'enabled', 'dailyLimit'])
    const { selfie, apiKey, enabled } = stored as {
      selfie?: string
      apiKey?: string
      enabled?: boolean
      dailyLimit?: number
    }
    const dailyLimit = stored.dailyLimit as number | undefined

    if (enabled === false) return
    if (!selfie || !apiKey) return

    const limit = dailyLimit ?? DAILY_LIMIT_DEFAULT
    const used = await getDailyCount()
    if (used >= limit) return

    await updateLook(item.id, { status: 'processing' })

    const productRes = await fetch(item.src)
    if (!productRes.ok) throw new Error('Failed to fetch product image')
    const productBlob = await productRes.blob()

    const processedBlob = await swapModel(productBlob, selfie, apiKey)

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

chrome.runtime.onMessage.addListener((message: MessageToBackground, _sender, _sendResponse) => {
  if (message.type !== 'QUEUE_IMAGE') return

  const { src, domain } = message

  if (queuedUrls.has(src)) return

  hasProcessed(src).then((already) => {
    if (already) return

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
