import path from 'node:path'
import { net, protocol } from 'electron'

export function registerFileProtocol(protocolName, baseDir) {
  protocol.handle(protocolName, (request) => {
    try {
      const iconPath = path.normalize(
        decodeURIComponent(request.url.replace(`${protocolName}://`, '')),
      )
      const fullPath = path.join(baseDir, iconPath)
      if (fullPath.startsWith(baseDir)) {
        // Convert backslashes to forward slashes and ensure proper file URL format
        const fileUrl = `file:///${fullPath.replace(/\\/g, '/').replace(/^\/+/, '')}`
        return net.fetch(fileUrl)
      }
    }
    catch (error) {
      console.error('Protocol handler error:', error)
    }
    return new Response('', { status: 404 })
  })
}
