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

export type MessageFromBackground =
  | { type: 'BADGE_UPDATE'; count: number }
