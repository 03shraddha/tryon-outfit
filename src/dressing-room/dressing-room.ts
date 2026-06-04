import { getAllLooks, clearFailedLooks } from '../lib/db.ts'
import type { Look } from '../types.ts'

const grid = document.getElementById('grid') as HTMLDivElement
const tabsEl = document.getElementById('tabs') as HTMLDivElement
const totalCount = document.getElementById('totalCount') as HTMLDivElement
const hoverHint = document.getElementById('hoverHint') as HTMLDivElement
const clearFailedBtn = document.getElementById('clearFailed') as HTMLButtonElement
const debugLine = document.getElementById('debugLine') as HTMLDivElement

const params = new URLSearchParams(location.search)
let currentDomain = params.get('domain') ?? 'all'
let allLooks: Look[] = []

function renderCard(look: Look): HTMLDivElement {
  const card = document.createElement('div')
  card.className = 'card'

  if (look.status === 'done' && look.processedBlob) {
    const objUrl = URL.createObjectURL(look.processedBlob)
    const processed = document.createElement('img')
    processed.alt = ''
    processed.className = 'processed'
    processed.addEventListener('load', () => URL.revokeObjectURL(objUrl), { once: true })
    processed.src = objUrl

    const original = document.createElement('img')
    original.src = look.originalSrc
    original.alt = ''
    original.className = 'original'

    card.appendChild(processed)
    card.appendChild(original)
  } else if (look.status === 'error') {
    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'

    const icon = document.createElement('span')
    icon.className = 'error-icon'
    icon.textContent = '✕'

    const label = document.createElement('span')
    label.className = 'status-label'
    label.textContent = 'Failed'

    overlay.appendChild(icon)
    overlay.appendChild(label)

    if (look.errorMessage) {
      const msg = document.createElement('span')
      msg.className = 'error-msg'
      msg.textContent = look.errorMessage.slice(0, 100)
      overlay.appendChild(msg)
    }

    const original = document.createElement('img')
    original.src = look.originalSrc
    original.alt = ''
    original.style.opacity = '0.3'
    card.appendChild(original)
    card.appendChild(overlay)
  } else {
    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'

    const spinner = document.createElement('div')
    spinner.className = 'spinner'

    const label = document.createElement('span')
    label.className = 'status-label'
    label.textContent = look.status === 'processing' ? 'Processing…' : 'Queued'

    overlay.appendChild(spinner)
    overlay.appendChild(label)

    const original = document.createElement('img')
    original.src = look.originalSrc
    original.alt = ''
    original.style.opacity = '0.15'
    card.appendChild(original)
    card.appendChild(overlay)
  }

  const tag = document.createElement('span')
  tag.className = 'domain-tag'
  tag.textContent = look.domain
  card.appendChild(tag)

  return card
}

function renderTabs(looks: Look[]): void {
  const domains = [...new Set(looks.map((l) => l.domain))].sort()
  tabsEl.innerHTML = ''

  const allTab = document.createElement('div')
  allTab.className = `tab${currentDomain === 'all' ? ' active' : ''}`
  allTab.innerHTML = `All <span class="tab-count">${looks.length}</span>`
  allTab.addEventListener('click', () => switchDomain('all'))
  tabsEl.appendChild(allTab)

  for (const d of domains) {
    const count = looks.filter((l) => l.domain === d).length
    const tab = document.createElement('div')
    tab.className = `tab${currentDomain === d ? ' active' : ''}`
    tab.innerHTML = `${d} <span class="tab-count">${count}</span>`
    tab.addEventListener('click', () => switchDomain(d))
    tabsEl.appendChild(tab)
  }
}

function renderGrid(looks: Look[]): void {
  const filtered = currentDomain === 'all' ? looks : looks.filter((l) => l.domain === currentDomain)

  grid.innerHTML = ''

  if (filtered.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.innerHTML = `
      <h2>No looks yet</h2>
      <p>Browse any clothing site with Pose enabled<br>and models will appear here.</p>
    `
    grid.appendChild(empty)
    hoverHint.style.display = 'none'
    return
  }

  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp)
  for (const look of sorted) {
    grid.appendChild(renderCard(look))
  }

  const doneCount = filtered.filter((l) => l.status === 'done').length
  hoverHint.style.display = doneCount > 0 ? 'block' : 'none'
}

function render(): void {
  renderTabs(allLooks)
  renderGrid(allLooks)

  const total = allLooks.length
  const done = allLooks.filter((l) => l.status === 'done').length
  const domains = new Set(allLooks.map((l) => l.domain)).size

  if (total === 0) {
    totalCount.textContent = 'Start browsing to collect looks'
  } else if (done === total) {
    totalCount.textContent = `${total} look${total !== 1 ? 's' : ''} ready · ${domains} brand${domains !== 1 ? 's' : ''}`
  } else {
    const pending = allLooks.filter((l) => l.status === 'pending' || l.status === 'processing').length
    const failed = allLooks.filter((l) => l.status === 'error').length
    const parts: string[] = [`${done} ready`]
    if (pending > 0) parts.push(`${pending} processing`)
    if (failed > 0) parts.push(`${failed} failed`)
    totalCount.textContent = `${parts.join(' · ')} · ${domains} brand${domains !== 1 ? 's' : ''}`
  }
}

function switchDomain(domain: string): void {
  currentDomain = domain
  render()
}

async function refresh(): Promise<void> {
  try {
    allLooks = await getAllLooks()
  } catch (err) {
    console.error('[Pose] getAllLooks failed:', err)
    totalCount.textContent = `DB error: ${err instanceof Error ? err.message : String(err)}`
    return
  }

  // Show last background event for live diagnostics (no DevTools needed)
  try {
    const stored = await chrome.storage.local.get('poseDebug') as {
      poseDebug?: { event: string; detail: string; t: string }
    }
    const d = stored.poseDebug
    if (d) {
      debugLine.textContent = `bg @ ${d.t}: ${d.event}${d.detail ? ' · ' + d.detail : ''}`
      debugLine.style.color = d.event.includes('err') || d.event.includes('lost') ? '#e53e3e' : '#aaa'
    } else {
      debugLine.textContent = 'bg: no events yet — scan a page first'
      debugLine.style.color = '#ccc'
    }
  } catch { /* storage unavailable */ }

  render()
}

clearFailedBtn.addEventListener('click', async () => {
  clearFailedBtn.textContent = 'Clearing…'
  clearFailedBtn.disabled = true
  await clearFailedLooks()
  await refresh()
  clearFailedBtn.textContent = 'Clear Failed'
  clearFailedBtn.disabled = false
})

refresh()

setInterval(refresh, 4000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
