export interface Look {
  id: string
  originalSrc: string
  processedBlob?: Blob
  domain: string
  timestamp: number
  status: 'pending' | 'processing' | 'done' | 'error'
  errorMessage?: string
}

export interface QueueItem {
  id: string
  src: string
  domain: string
}

export type MessageToBackground =
  | { type: 'QUEUE_IMAGE'; src: string; domain: string }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'GET_QUEUE_SIZE' }

export type MessageFromBackground =
  | { type: 'QUEUE_SIZE'; size: number }
  | { type: 'BADGE_UPDATE'; count: number }

export type MessageToContent =
  | { type: 'START_SCAN' }

export interface ScanResult {
  ok: boolean
  viewport: number
  queued: number
  lazy: number
  skipped: number
}
