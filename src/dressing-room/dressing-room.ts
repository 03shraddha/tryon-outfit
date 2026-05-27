import { getAllLooks } from '../lib/db.ts'
import type { Look } from '../types.ts'

const grid = document.getElementById('grid') as HTMLDivElement
const tabsEl = document.getElementById('tabs') as HTMLDivElement
const totalCount = document.getElementById('totalCount') as HTMLDivElement
const hoverHint = document.getElementById('hoverHint') as HTMLDivElement

let currentDomain = 'all'
let allLooks: Look[] = []

function blobUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

function renderCard(look: Look): HTMLDivElement {
  const card = document.createElement('div')
  card.className = 'card'

  if (look.status === 'done' && look.processedBlob) {
    const processed = document.createElement('img')
    processed.src = blobUrl(look.processedBlob)
    processed.alt = ''
    processed.className = 'processed'

    const original = document.createElement('img')
    original.src = look.originalSrc
    original.alt = ''
    original.className = 'original'

    card.appendChild(processed)
    card.appendChild(original)
  } else if (look.status === 'error') {
    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'
    overlay.innerHTML = `
      <span class="error-icon">✕</span>
      <span class="status-label">Failed</span>
    `
    const original = document.createElement('img')
    original.src = look.originalSrc
    original.alt = ''
    original.style.opacity = '0.3'
    card.appendChild(original)
    card.appendChild(overlay)
  } else {
    const overlay = document.createElement('div')
    overlay.className = 'status-overlay'
    overlay.innerHTML = `
      <div class="spinner"></div>
      <span class="status-label">${look.status === 'processing' ? 'Processing…' : 'Queued'}</span>
    `
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
  } else {
    totalCount.textContent = `${done} of ${total} looks ready · ${domains} brand${domains !== 1 ? 's' : ''}`
  }
}

function switchDomain(domain: string): void {
  currentDomain = domain
  render()
}

async function refresh(): Promise<void> {
  allLooks = await getAllLooks()
  render()
}

refresh()

// Poll for updates (pending/processing looks)
setInterval(() => {
  const hasPending = allLooks.some((l) => l.status === 'pending' || l.status === 'processing')
  if (hasPending) refresh()
}, 4000)
