const { contextBridge, ipcRenderer } = require("electron");
const names = [
  "create",
  "unlock",
  "list",
  "save",
  "remove",
  "reveal",
  "copy",
  "generate",
  "settings",
  "backup",
  "changeMaster",
  "recoverMaster",
  "previewImport",
  "cancelImport",
  "confirmImport",
  "openSite",
];
const api = Object.fromEntries(
  names.map((name) => [
    name,
    async (args) => {
      const result = await ipcRenderer.invoke(`vault:${name}`, args);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
  ]),
);
contextBridge.exposeInMainWorld("vault", {
  ...api,
  lock: () => ipcRenderer.send("vault:lock"),
  activity: () => ipcRenderer.send("vault:activity"),
  onLock: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("vault:locked", listener);
    return () => ipcRenderer.removeListener("vault:locked", listener);
  },
});
