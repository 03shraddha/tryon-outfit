import { getLookCount, getDomains } from '../lib/db.ts'

const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement
const statusDot = document.getElementById('statusDot') as HTMLSpanElement
const selfieImg = document.getElementById('selfieImg') as HTMLImageElement
const selfiePlaceholder = document.getElementById('selfiePlaceholder') as HTMLSpanElement
const uploadLabel = document.getElementById('uploadLabel') as HTMLLabelElement
const selfieInput = document.getElementById('selfieInput') as HTMLInputElement
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement
const limitInput = document.getElementById('limitInput') as HTMLInputElement
const limitUsed = document.getElementById('limitUsed') as HTMLSpanElement
const looksCount = document.getElementById('looksCount') as HTMLSpanElement
const bottomCount = document.getElementById('bottomCount') as HTMLDivElement
const openBtn = document.getElementById('openDressingRoom') as HTMLButtonElement
const revealBtn = document.getElementById('revealBtn') as HTMLButtonElement

function showSelfie(base64: string): void {
  selfieImg.src = base64
  selfieImg.style.display = 'block'
  selfiePlaceholder.style.display = 'none'
  uploadLabel.textContent = 'Change photo'
}

async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get(['selfie', 'apiKey', 'enabled', 'dailyLimit', 'dailyUsage'])
  const { selfie, apiKey, enabled, dailyLimit, dailyUsage } = stored as {
    selfie?: string
    apiKey?: string
    enabled?: boolean
    dailyLimit?: number
    dailyUsage?: { date: string; count: number }
  }

  enabledToggle.checked = enabled !== false
  statusDot.classList.toggle('active', enabled !== false)

  if (selfie) showSelfie(selfie)
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
}

enabledToggle.addEventListener('change', async () => {
  const val = enabledToggle.checked
  statusDot.classList.toggle('active', val)
  await chrome.storage.local.set({ enabled: val })
})

selfieInput.addEventListener('change', async () => {
  const file = selfieInput.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    await chrome.storage.local.set({ selfie: base64 })
    showSelfie(base64)
  }
  reader.readAsDataURL(file)
})

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

openBtn.addEventListener('click', () => {
  const url = chrome.runtime.getURL('src/dressing-room/index.html')
  chrome.tabs.create({ url })
})

loadState()
