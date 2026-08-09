export function createIpcApi(ipcRenderer, validChannels) {
  const isValidChannel = channel => validChannels.includes(channel)

  return {
    invoke: (channel, ...args) => {
      if (isValidChannel(channel)) {
        return ipcRenderer.invoke(channel, ...args)
      }
    },
    send: (channel, ...args) => {
      if (isValidChannel(channel)) {
        ipcRenderer.send(channel, ...args)
      }
    },
    on: (channel, callback) => {
      if (!isValidChannel(channel)) {
        return () => {}
      }

      const listener = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    removeAllListeners: (channel) => {
      if (isValidChannel(channel)) {
        ipcRenderer.removeAllListeners(channel)
      }
    },
  }
}
