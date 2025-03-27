const MIME_TYPES = {
  // Text
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.php': 'text/php',
  '.py': 'text/x-python',
  '.java': 'text/x-java-source',
  '.rb': 'text/x-ruby',
  '.sh': 'text/x-shellscript',

  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.psd': 'image/vnd.adobe.photoshop',
  '.raw': 'image/x-raw',

  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.midi': 'audio/midi',
  '.mid': 'audio/midi',

  // Video
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.rtf': 'application/rtf',
  '.tex': 'application/x-tex',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',

  // Spreadsheets
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.numbers': 'application/vnd.apple.numbers',

  // 3D Files
  '.stl': 'model/stl',
  '.obj': 'model/obj',
  '.fbx': 'application/octet-stream', // Common 3D format but no standard MIME
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.3ds': 'application/x-3ds',
  '.blend': 'application/x-blender',
  '.dae': 'model/vnd.collada+xml',
  '.usd': 'model/vnd.usd',
  '.usda': 'model/vnd.usd',
  '.usdc': 'model/vnd.usd',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',

  // Data
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.sql': 'application/sql',
  '.db': 'application/x-sqlite3',

  // Fonts
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',

  // Other
  '.swf': 'application/x-shockwave-flash',
  '.iso': 'application/x-iso9660-image',
  '.torrent': 'application/x-bittorrent',
  '.url': 'application/x-url',
  '.desktop': 'application/x-desktop',
}

export default MIME_TYPES
