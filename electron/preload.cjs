const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendPort: () => ipcRenderer.invoke("get-backend-port"),
  getBackendOrigin: () => ipcRenderer.invoke("get-backend-origin"),
  getBackendAuthToken: () => ipcRenderer.invoke("get-backend-auth-token"),
  updateTheme: (theme) => ipcRenderer.send("update-theme", theme),
  saveImage: (payload) => ipcRenderer.invoke("save-image", payload),
  fetchYouMindPrompts: (payload) => ipcRenderer.invoke("fetch-youmind-prompts", payload),
  fetchImageBytes: (url) => ipcRenderer.invoke("fetch-image-bytes", url),
});
