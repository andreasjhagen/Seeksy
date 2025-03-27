const MIME_ICON_MAP = {
  // Directories and special types
  'directory': 'folder',
  'application': 'apps',

  // Text files
  'text/*': 'description',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'javascript',
  'text/markdown': 'article',

  // Media types
  'image/*': 'image',
  'audio/*': 'music_note',
  'video/*': 'movie',

  // Applications
  'application/pdf': 'picture_as_pdf',
  'application/msword': 'description',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'description',
  'application/vnd.ms-excel': 'table',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table',
  'application/zip': 'folder_zip',
  'application/x-rar-compressed': 'folder_zip',
  'application/x-7z-compressed': 'folder_zip',
  'application/x-tar': 'folder_zip',
  'application/gzip': 'folder_zip',
}

export function useMimeTypeIcons(mimeType) {
  const getMimeIcon = () => {
    if (!mimeType)
      return 'draft'

    if (MIME_ICON_MAP[mimeType])
      return MIME_ICON_MAP[mimeType]

    const [category] = mimeType.split('/')
    return MIME_ICON_MAP[`${category}/*`] || 'draft'
  }

  return { getMimeIcon }
}
