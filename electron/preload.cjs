const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sailor', {
  save: (content) => ipcRenderer.invoke('design:save', content),
  open: () => ipcRenderer.invoke('design:open'),
  saveImage: (dataUrl) => ipcRenderer.invoke('image:save', dataUrl),
});
