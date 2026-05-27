function base64ToBlob(b64: string, mime = 'image/png'): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function swapModel(
  productBlob: Blob,
  selfieBase64: string,
  apiKey: string,
): Promise<Blob> {
  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('image[]', productBlob, 'product.png')
  form.append('image[]', base64ToBlob(selfieBase64), 'reference.png')
  form.append(
    'prompt',
    'The first image is a fashion product photo showing a model wearing clothing. ' +
      'The second image is a reference photo of a person. ' +
      'Replace the fashion model in the first image with the person from the second image. ' +
      'Preserve exactly: the clothing being worn, the body pose, the lighting, shadows, and background. ' +
      'The result should look like the reference person is wearing that exact outfit in that exact scene. ' +
      'Maintain photorealistic quality consistent with the original brand photography.',
  )
  form.append('n', '1')
  form.append('size', '1024x1024')
  form.append('response_format', 'b64_json')

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }

  const json = (await res.json()) as { data: Array<{ b64_json: string }> }
  return base64ToBlob(json.data[0].b64_json)
}
