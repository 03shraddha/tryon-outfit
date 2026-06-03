import { describe, it, expect, vi, beforeEach } from 'vitest'
import { swapModel } from '../lib/openai.ts'

const FAKE_SELFIE_B64 = btoa('fake-selfie-bytes')
const FAKE_API_KEY = 'sk-test-1234'
const FAKE_RESULT_B64 = btoa('fake-result-image-bytes')

function makeProductBlob(): Blob {
  return new Blob(['fake-image-data'], { type: 'image/png' })
}

function mockFetchOk(b64 = FAKE_RESULT_B64): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: b64 }] }),
    }),
  )
}

function mockFetchError(status: number, message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: { message } }),
    }),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('swapModel', () => {
  it('returns a Blob on a successful API response', async () => {
    mockFetchOk()
    const result = await swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)
    expect(result).toBeInstanceOf(Blob)
  })

  it('sends a POST to the correct OpenAI endpoint', async () => {
    mockFetchOk()
    await swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)

    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect(opts.method).toBe('POST')
  })

  it('includes the Authorization header with the API key', async () => {
    mockFetchOk()
    await swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${FAKE_API_KEY}`)
  })

  it('throws with the API error message on 401 unauthorized', async () => {
    mockFetchError(401, 'Incorrect API key provided')
    await expect(swapModel(makeProductBlob(), [FAKE_SELFIE_B64], 'bad-key')).rejects.toThrow(
      'Incorrect API key provided',
    )
  })

  it('throws with the API error message on 429 rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded. Please try again later.')
    await expect(swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)).rejects.toThrow(
      'Rate limit exceeded',
    )
  })

  it('throws a generic HTTP error when the error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),   // no error.message field
      }),
    )
    await expect(swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)).rejects.toThrow(
      'HTTP 500',
    )
  })

  it('throws when the response data array is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }),
    )
    await expect(swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)).rejects.toThrow()
  })

  it('throws when fetch itself rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    await expect(swapModel(makeProductBlob(), [FAKE_SELFIE_B64], FAKE_API_KEY)).rejects.toThrow(
      'Failed to fetch',
    )
  })
})
