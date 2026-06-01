import { getLookCount, getDomains } from '../lib/db.ts'

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
const openBtn = document.getElementById('openDressingRoom') as HTMLButtonElement
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
const revealBtn = document.getElementById('revealBtn') as HTMLButtonElement

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

  // Migrate old single-selfie key
  if (!raw.selfie1 && raw.selfie) {
    await chrome.storage.local.set({ selfie1: raw.selfie })
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
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target?.result as string
      await chrome.storage.local.set({ [storageKey]: base64 })
      showSelfieSlot(img, placeholder, label, base64)
    }
    reader.readAsDataURL(file)
  })
}

wireFileInput(selfieInput1, 'selfie1', selfieImg1, selfiePlaceholder1, slotLabel1)
wireFileInput(selfieInput2, 'selfie2', selfieImg2, selfiePlaceholder2, slotLabel2)

let apiKeyTimer: ReturnType<typeof setTimeout>
apiKeyInput.addEventListener('input', () => {
  clearTimeout(apiKeyTimer)
  apiKeyTimer = setTimeout(async () => {
    await chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() })
  }, 600)
})

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

openBtn.addEventListener('click', () => {
  const url = chrome.runtime.getURL('src/dressing-room/index.html')
  chrome.tabs.create({ url })
})

// Refresh queue size every 2s while popup is open
setInterval(refreshQueueStatus, 2000)

loadState()
