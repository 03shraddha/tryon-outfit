import { normalizeImageUrl } from '../lib/imageUrl.ts'
import { swapModel } from '../lib/openai.ts'
import type { ScanResult } from '../types.ts'

type CardState =
  | { status: 'pending'; src: string }
  | { status: 'processing'; src: string }
  | { status: 'done'; src: string; resultB64: string }
  | { status: 'error'; src: string; message: string }

const BATCH = 3

const params = new URLSearchParams(location.search)
const targetTabId: number | null = params.has('tabId') ? parseInt(params.get('tabId')!, 10) : null
let domain = params.get('domain') ?? ''

let cards: CardState[] = []
let selfie1: string | null = null
let selfie2: string | null = null
let apiKey: string | null = null
let isGenerating = false

const grid = document.getElementById('grid') as HTMLDivElement
const statusEl = document.getElementById('status') as HTMLDivElement
const scanBtn = document.getElementById('scanBtn') as HTMLButtonElement
const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement
const loadMoreBtn = document.getElementById('loadMoreBtn') as HTMLButtonElement

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get(['selfie1', 'selfie2', 'selfie', 'apiKey'])
  const raw = stored as { selfie1?: string; selfie2?: string; selfie?: string; apiKey?: string }
  selfie1 = raw.selfie1 ?? raw.selfie ?? null
  selfie2 = raw.selfie2 ?? null
  apiKey = raw.apiKey ?? null
}

function setStatus(msg: string, color = '#aaa'): void {
  statusEl.textContent = msg
  statusEl.style.color = color
}

function renderCard(card: CardState): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'card'

  if (card.status === 'done') {
    const processed = document.createElement('img')
    processed.src = card.resultB64
    processed.alt = ''
    processed.className = 'processed'

    const original = document.createElement('img')
    original.src = card.src
    original.alt = ''
    original.className = 'original'

    el.append(processed, original)
  } else if (card.status === 'processing') {
    const img = document.createElement('img')
    img.src = card.src
    img.alt = ''
    img.style.opacity = '0.15'

    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'
    overlay.innerHTML = '<div class="spinner"></div><span class="status-label">Processing…</span>'

    el.append(img, overlay)
  } else if (card.status === 'error') {
    const img = document.createElement('img')
    img.src = card.src
    img.alt = ''
    img.style.opacity = '0.3'

    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'
    overlay.innerHTML = `
      <span class="error-icon">✕</span>
      <span class="status-label">Failed</span>
      <span class="error-msg">${card.message.slice(0, 120)}</span>
    `

    el.append(img, overlay)
  } else {
    // pending
    const img = document.createElement('img')
    img.src = card.src
    img.alt = ''
    img.style.opacity = '0.35'

    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'
    overlay.innerHTML = '<span class="status-label" style="color:#ccc">Queued</span>'

    el.append(img, overlay)
  }

  if (domain) {
    const tag = document.createElement('span')
    tag.className = 'domain-tag'
    tag.textContent = domain
    el.appendChild(tag)
  }

  return el
}

function renderGrid(): void {
  grid.innerHTML = ''

  if (cards.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.innerHTML = `
      <h2>No images yet</h2>
      <p>Click <strong>Scan Page</strong> to detect model images on the active tab.</p>
    `
    grid.appendChild(empty)
    generateBtn.style.display = 'none'
    loadMoreBtn.style.display = 'none'
    return
  }

  for (const card of cards) {
    grid.appendChild(renderCard(card))
  }

  updateActionButtons()
}

function updateActionButtons(): void {
  const pending = cards.filter(c => c.status === 'pending').length

  if (isGenerating || pending === 0) {
    generateBtn.style.display = 'none'
    loadMoreBtn.style.display = 'none'
    return
  }

  const nextBatch = Math.min(pending, BATCH)
  generateBtn.textContent = `Generate ${nextBatch}`
  generateBtn.style.display = 'inline-block'

  // Show Load More only if there will be items remaining after the next batch
  loadMoreBtn.style.display = pending > BATCH ? 'inline-block' : 'none'
}

scanBtn.addEventListener('click', async () => {
  if (!targetTabId) {
    setStatus('Open this page from the popup to target a specific tab.', '#e53e3e')
    return
  }

  scanBtn.disabled = true
  scanBtn.textContent = 'Scanning…'
  setStatus('')

  try {
    let res: ScanResult

    try {
      res = await chrome.tabs.sendMessage(targetTabId, { type: 'START_SCAN' }) as ScanResult
    } catch {
      // Content script not present — inject it
      const manifest = chrome.runtime.getManifest()
      const csFile = manifest.content_scripts?.[0]?.js?.[0]
      if (!csFile) throw new Error('No content script in manifest')
      await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: [csFile] })
      res = await chrome.tabs.sendMessage(targetTabId, { type: 'START_SCAN' }) as ScanResult
    }

    domain = res.domain || domain

    const newUrls = res.srcs.filter(u => !cards.some(c => c.src === u))
    for (const src of newUrls) {
      cards.push({ status: 'pending', src })
    }

    const found = newUrls.length
    const lazy = res.lazy

    if (res.srcs.length === 0 && cards.length === 0) {
      setStatus('No model images found — scroll down to load more products and scan again.', '#e53e3e')
    } else if (found === 0) {
      setStatus(`No new images found (${cards.length} already queued).`)
    } else {
      const lazyNote = lazy > 0 ? ` ${lazy} still loading — scan again in a moment.` : ''
      setStatus(`Found ${found} image${found !== 1 ? 's' : ''}.${lazyNote}`, '#22c55e')
    }

    renderGrid()
  } catch (err) {
    setStatus(`Scan failed: ${err instanceof Error ? err.message : String(err)} — refresh the tab and try again.`, '#e53e3e')
  } finally {
    scanBtn.disabled = false
    scanBtn.textContent = 'Scan Page'
  }
})

generateBtn.addEventListener('click', () => void generateBatch())
loadMoreBtn.addEventListener('click', () => void generateBatch())

async function generateBatch(): Promise<void> {
  if (isGenerating) return

  if (!apiKey) {
    setStatus('Add your OpenAI API key in the popup first.', '#e53e3e')
    return
  }
  if (!selfie1) {
    setStatus('Upload your photo in the popup first.', '#e53e3e')
    return
  }

  const pending = cards.filter(c => c.status === 'pending')
  const batch = pending.slice(0, BATCH)
  if (batch.length === 0) return

  isGenerating = true
  generateBtn.style.display = 'none'
  loadMoreBtn.style.display = 'none'
  setStatus(`Generating ${batch.length} image${batch.length !== 1 ? 's' : ''}…`)

  for (const item of batch) {
    const idx = cards.findIndex(c => c.src === item.src)
    if (idx === -1) continue

    cards[idx] = { status: 'processing', src: item.src }
    renderGrid()

    try {
      const fetchUrl = normalizeImageUrl(item.src)
      const productRes = await fetch(fetchUrl)
      if (!productRes.ok) throw new Error(`HTTP ${productRes.status} fetching image`)

      const contentType = productRes.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`Unexpected content type: ${contentType.split(';')[0]}`)
      }

      const productBlob = await productRes.blob()
      if (productBlob.size < 1024) throw new Error(`Image too small to process (${productBlob.size} bytes)`)

      const selfies = [selfie1!, ...(selfie2 ? [selfie2] : [])]
      const resultB64 = await swapModel(productBlob, selfies, apiKey!)

      cards[idx] = { status: 'done', src: item.src, resultB64 }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Pose] generation error:', msg)
      cards[idx] = { status: 'error', src: item.src, message: msg }
    }

    renderGrid()
  }

  isGenerating = false

  const remaining = cards.filter(c => c.status === 'pending').length
  if (remaining > 0) {
    setStatus(`${remaining} more image${remaining !== 1 ? 's' : ''} ready — click Generate to continue.`)
  } else {
    const done = cards.filter(c => c.status === 'done').length
    const errors = cards.filter(c => c.status === 'error').length
    setStatus(
      errors === 0
        ? `All done! ${done} look${done !== 1 ? 's' : ''} generated.`
        : `Done. ${done} succeeded, ${errors} failed.`,
      errors === 0 ? '#22c55e' : '#aaa',
    )
  }

  renderGrid()
}

async function init(): Promise<void> {
  await loadSettings()

  if (!targetTabId) {
    setStatus('Open from the popup to scan a page, or navigate to a fashion site first.', '#aaa')
    scanBtn.disabled = true
  }

  renderGrid()
}

init()
