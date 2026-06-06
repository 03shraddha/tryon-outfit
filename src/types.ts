export type MessageToContent =
  | { type: 'START_SCAN' }

export interface ScanResult {
  ok: boolean
  viewport: number
  queued: number
  lazy: number
  skipped: number
  srcs: string[]
  domain: string
}
