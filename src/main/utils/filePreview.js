import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'

export const MAX_TEXT_PREVIEW_BYTES = 5000

export async function readTextPreview(filePath, maxBytes = MAX_TEXT_PREVIEW_BYTES) {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const isTruncated = bytesRead > maxBytes
    const previewBuffer = buffer.subarray(0, Math.min(bytesRead, maxBytes))
    const content = isTruncated
      ? new StringDecoder('utf8').write(previewBuffer)
      : previewBuffer.toString('utf8')
    return isTruncated ? `${content}...\n\n[Content truncated. Open file to see more]` : content
  }
  finally {
    await handle.close()
  }
}
