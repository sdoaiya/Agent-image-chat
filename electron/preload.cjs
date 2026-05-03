const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendPort: () => ipcRenderer.invoke("get-backend-port"),
  getBackendOrigin: () => ipcRenderer.invoke("get-backend-origin"),
  updateTheme: (theme) => ipcRenderer.send("update-theme", theme),
  saveImage: (payload) => ipcRenderer.invoke("save-image", payload),
});
