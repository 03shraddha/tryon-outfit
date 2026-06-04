import { getLookCount, getDomains } from '../lib/db.ts'
import type { ScanResult } from '../types.ts'

const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement
const statusDot = document.getElementById('statusDot') as HTMLSpanElement
const selfieImg1 = document.getElementById('selfieImg1') as HTMLImageElement
const selfieImg2 = document.getElementById('selfieImg2') as HTMLImageElement
const selfiePlaceholder1 = document.getElementById('selfiePlaceholder1') as HTMLSpanElement
const selfiePlaceholder2 = document.getElementById('selfiePlaceholder2') as HTMLSpanElement
const slotLabel1 = document.getElementById('slotLabel1') as HTMLDivElement
const slotLabel2 = document.getElementById('slotLabel2') as HTMLDivElement
const selfieInput1 = document.getElementById('selfieInput1') as HTMLInputElement
const selfieInput2 = document.getElementById('selfieInput2') as HTMLInputElement
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement
const limitInput = document.getElementById('limitInput') as HTMLInputElement
const limitUsed = document.getElementById('limitUsed') as HTMLSpanElement
const looksCount = document.getElementById('looksCount') as HTMLSpanElement
const bottomCount = document.getElementById('bottomCount') as HTMLDivElement
const scanBtn = document.getElementById('scanBtn') as HTMLButtonElement
const scanResult = document.getElementById('scanResult') as HTMLDivElement
const openBtn = document.getElementById('openDressingRoom') as HTMLButtonElement
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
const revealBtn = document.getElementById('revealBtn') as HTMLButtonElement
const testKeyBtn = document.getElementById('testKeyBtn') as HTMLButtonElement
const keyStatus = document.getElementById('keyStatus') as HTMLSpanElement

function showSelfieSlot(
  img: HTMLImageElement,
  placeholder: HTMLSpanElement,
  label: HTMLDivElement,
  base64: string,
): void {
  img.src = base64
  img.style.display = 'block'
  placeholder.style.display = 'none'
  label.textContent = 'Change'
}

async function refreshQueueStatus(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_SIZE' }) as { size: number }
    const size = res?.size ?? 0
    stopBtn.disabled = size === 0
    stopBtn.textContent = size > 0 ? `Stop (${size})` : 'Stop'
  } catch {
    stopBtn.disabled = true
  }
}

async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get(['selfie1', 'selfie2', 'selfie', 'apiKey', 'enabled', 'dailyLimit', 'dailyUsage'])
  const raw = stored as {
    selfie1?: string
    selfie2?: string
    selfie?: string
    apiKey?: string
    enabled?: boolean
    dailyLimit?: number
    dailyUsage?: { date: string; count: number }
  }

  // Migrate old single-selfie key and remove it to free storage
  if (!raw.selfie1 && raw.selfie) {
    await chrome.storage.local.set({ selfie1: raw.selfie })
    await chrome.storage.local.remove('selfie')
    raw.selfie1 = raw.selfie
  }

  const { selfie1, selfie2, apiKey, enabled, dailyLimit, dailyUsage } = raw

  enabledToggle.checked = enabled !== false
  statusDot.classList.toggle('active', enabled !== false)

  if (selfie1) showSelfieSlot(selfieImg1, selfiePlaceholder1, slotLabel1, selfie1)
  if (selfie2) showSelfieSlot(selfieImg2, selfiePlaceholder2, slotLabel2, selfie2)
  if (apiKey) apiKeyInput.value = apiKey
  if (dailyLimit) limitInput.value = String(dailyLimit)

  const today = new Date().toISOString().slice(0, 10)
  const used = dailyUsage?.date === today ? dailyUsage.count : 0
  limitUsed.textContent = `${used} used`

  const count = await getLookCount()
  looksCount.textContent = `${count} looks`
  bottomCount.textContent = count > 0 ? `${count} looks saved` : ''

  const domains = await getDomains()
  if (domains.length > 0) {
    bottomCount.textContent = `${count} looks across ${domains.length} brand${domains.length > 1 ? 's' : ''}`
  }

  refreshQueueStatus()
}

enabledToggle.addEventListener('change', async () => {
  const val = enabledToggle.checked
  statusDot.classList.toggle('active', val)
  await chrome.storage.local.set({ enabled: val })
})

async function compressToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX = 768
      const scale = Math.min(1, MAX / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load failed')) }
    image.src = objectUrl
  })
}

function wireFileInput(
  input: HTMLInputElement,
  storageKey: string,
  img: HTMLImageElement,
  placeholder: HTMLSpanElement,
  label: HTMLDivElement,
): void {
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressToDataUrl(file)
      await chrome.storage.local.set({ [storageKey]: dataUrl })
      showSelfieSlot(img, placeholder, label, dataUrl)
    } catch (err) {
      console.error('Selfie save failed:', err)
    }
  })
}

wireFileInput(selfieInput1, 'selfie1', selfieImg1, selfiePlaceholder1, slotLabel1)
wireFileInput(selfieInput2, 'selfie2', selfieImg2, selfiePlaceholder2, slotLabel2)

apiKeyInput.addEventListener('input', async () => {
  const val = apiKeyInput.value.trim()
  await chrome.storage.local.set({ apiKey: val })
  keyStatus.textContent = ''
})

async function testKey(): Promise<void> {
  const val = apiKeyInput.value.trim()
  if (!val) { keyStatus.style.color = '#e53e3e'; keyStatus.textContent = 'Enter a key first'; return }
  testKeyBtn.disabled = true
  testKeyBtn.textContent = 'Testing…'
  keyStatus.textContent = ''
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${val}` },
    })
    if (res.ok) {
      keyStatus.style.color = '#22c55e'
      keyStatus.textContent = 'Key valid ✓'
    } else {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      keyStatus.style.color = '#e53e3e'
      keyStatus.textContent = err.error?.message ?? `HTTP ${res.status}`
    }
  } catch {
    keyStatus.style.color = '#e53e3e'
    keyStatus.textContent = 'Network error'
  } finally {
    testKeyBtn.disabled = false
    testKeyBtn.textContent = 'Test API Key'
  }
}

testKeyBtn.addEventListener('click', testKey)

let limitTimer: ReturnType<typeof setTimeout>
limitInput.addEventListener('input', () => {
  clearTimeout(limitTimer)
  limitTimer = setTimeout(async () => {
    const val = parseInt(limitInput.value, 10)
    if (!isNaN(val) && val > 0) {
      await chrome.storage.local.set({ dailyLimit: val })
    }
  }, 600)
})

revealBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password'
  apiKeyInput.type = isPassword ? 'text' : 'password'
  revealBtn.textContent = isPassword ? '🙈' : '👁'
})

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' })
  stopBtn.disabled = true
  stopBtn.textContent = 'Stop'
})

function showScanResult(res: ScanResult | null, err?: string): void {
  if (err) {
    scanResult.style.color = '#e53e3e'
    scanResult.textContent = err
    return
  }
  if (!res) return
  const found = res.queued + res.lazy
  if (found === 0) {
    scanResult.style.color = '#e53e3e'
    scanResult.textContent = `No models found (${res.viewport} images in viewport — scroll to show products)`
  } else {
    scanResult.style.color = '#22c55e'
    scanResult.textContent = `Found ${found} model image${found !== 1 ? 's' : ''} — processing…`
  }
  setTimeout(() => { scanResult.textContent = '' }, 8000)
}

scanBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  scanBtn.textContent = 'Scanning…'
  scanBtn.disabled = true
  scanResult.textContent = ''

  let res: ScanResult | null = null

  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: 'START_SCAN' }) as ScanResult
  } catch {
    // Content script not present — inject it now (happens after extension reload).
    // Read the loader filename from the manifest so the hashed build path is always correct.
    try {
      const manifest = chrome.runtime.getManifest()
      const csFile = manifest.content_scripts?.[0]?.js?.[0]
      if (!csFile) throw new Error('no content script in manifest')
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [csFile],
      })
      res = await chrome.tabs.sendMessage(tab.id, { type: 'START_SCAN' }) as ScanResult
    } catch (injErr) {
      scanBtn.textContent = 'Scan This Page'
      scanBtn.disabled = false
      showScanResult(null, 'Could not reach page — refresh the tab and try again')
      console.error('[Pose] Scan injection failed:', injErr)
      return
    }
  }

  showScanResult(res)
  scanBtn.textContent = 'Scan This Page'
  scanBtn.disabled = false
})

openBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let domain = ''
  try {
    if (tab?.url) domain = new URL(tab.url).hostname.replace(/^www\./, '')
  } catch { /* non-URL tab */ }
  const base = chrome.runtime.getURL('src/dressing-room/index.html')
  const url = domain ? `${base}?domain=${encodeURIComponent(domain)}` : base
  chrome.tabs.create({ url })
})

// Refresh queue size every 2s while popup is open
setInterval(refreshQueueStatus, 2000)

loadState()
