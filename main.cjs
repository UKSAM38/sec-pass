"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  powerMonitor,
  Menu,
  session: electronSession,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const V = require("./desktop/vault.cjs");
const { prepareCSV } = require("./desktop/import.cjs");
app.setName("SecPass");
app.setPath(
  "userData",
  (!app.isPackaged && process.env.SECUREPASS_TEST_HOME) ||
    path.join(app.getPath("appData"), "SecPass-Encrypted"),
);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let win,
  active = null,
  file = null,
  expected = null,
  pending = null,
  generation = 0,
  lastActivity = Date.now();
let clipboardValue = null,
  clipboardTimer,
  failures = 0,
  nextAttempt = 0;
let tail = Promise.resolve();
const pageURL = pathToFileURL(path.join(__dirname, "dist/index.html")).href;
const digest = (raw) => createHash("sha256").update(raw).digest("hex");
const requireVault = () => {
  if (!active) throw new Error("Kasa kilitli.");
  return active;
};
let clipboardQueue = Promise.resolve();
function queueClipboard(task) {
  const result = clipboardQueue.then(task);
  clipboardQueue = result.catch(() => {});
  return result;
}
async function eraseOwnedClipboard() {
  clearTimeout(clipboardTimer);
  const value = clipboardValue;
  if (value !== null && (await clipboard.readText()) === value)
    clipboard.clear();
  clipboardValue = null;
}
function clearClipboard() {
  clearTimeout(clipboardTimer);
  return queueClipboard(eraseOwnedClipboard);
}

function lock() {
  generation++;
  V.destroy(active);
  active = null;
  file = null;
  expected = null;
  pending = null;
  void clearClipboard().catch(() => {});
  if (win && !win.isDestroyed()) win.webContents.send("vault:locked");
}
function checkGeneration(value) {
  if (generation !== value)
    throw new Error("İşlem sırasında kasa kilitlendi. Yeniden açın.");
}
async function chooseSave(title, defaultPath) {
  const choice = await dialog.showSaveDialog(win, {
    title,
    defaultPath,
    filters: [{ name: "Şifreli SecPass kasası", extensions: ["spvault"] }],
  });
  return choice.canceled ? null : choice.filePath;
}
async function chooseOpen(title, extensions) {
  const choice = await dialog.showOpenDialog(win, {
    title,
    properties: ["openFile"],
    filters: [{ name: title, extensions }],
  });
  return choice.canceled ? null : choice.filePaths[0];
}
async function commit(data) {
  const current = requireVault(),
    token = generation,
    filename = file;
  V.validateData(data);
  const encrypted = V.encode({ ...current, data });
  const disk = await V.readVault(filename);
  checkGeneration(token);
  if (digest(disk) !== expected)
    throw new Error(
      "Kasa dosyası dışarıdan değişti. Üzerine yazılmadı; kasayı yeniden açın.",
    );
  await V.atomicWrite(filename + ".backup", disk);
  checkGeneration(token);
  await V.atomicWrite(filename, encrypted);
  checkGeneration(token);
  current.data = data;
  expected = digest(encrypted);
  return V.summary(data);
}
const operations = {
  async create({ password }) {
    if (active) throw new Error("Önce mevcut kasayı kilitleyin.");
    const token = generation,
      created = await V.create(password);
    try {
      checkGeneration(token);
      const filename = await chooseSave(
        "Yeni şifreli kasa oluştur",
        "Kişisel Kasam.spvault",
      );
      checkGeneration(token);
      if (!filename) {
        V.destroy(created.session);
        return null;
      }
      const raw = V.encode(created.session);
      await V.atomicWrite(filename, raw, true);
      checkGeneration(token);
      active = created.session;
      file = filename;
      expected = digest(raw);
      lastActivity = Date.now();
      return {
        ...V.summary(active.data),
        recovery: created.recovery,
        filename: path.basename(file),
      };
    } catch (error) {
      V.destroy(created.session);
      if (error.code === "EEXIST")
        throw new Error(
          "Bu dosya zaten var. Yeni kasa için farklı bir dosya adı seçin.",
        );
      throw error;
    }
  },
  async unlock({ secret, mode }) {
    if (active) throw new Error("Kasa zaten açık.");
    if (Date.now() < nextAttempt)
      throw new Error("Çok sayıda deneme. Biraz bekleyip yeniden deneyin.");
    const token = generation;
    const filename = await chooseOpen("Şifreli kasayı aç", [
      "spvault",
      "backup",
    ]);
    if (!filename) return null;
    checkGeneration(token);
    let opened;
    try {
      const raw = await V.readVault(filename);
      opened = await V.unlock(raw, secret, mode);
      checkGeneration(token);
      active = opened;
      file = filename;
      expected = digest(raw);
      failures = 0;
      lastActivity = Date.now();
      return { ...V.summary(active.data), filename: path.basename(file) };
    } catch (error) {
      V.destroy(opened);
      failures++;
      nextAttempt =
        Date.now() + Math.min(30000, 1000 * 2 ** Math.min(failures, 5));
      throw error;
    }
  },
  async list() {
    return V.summary(requireVault().data);
  },
  async save(input) {
    const current = requireVault();
    const previous = input.id
      ? current.data.entries.find((e) => e.id === input.id)
      : null;
    if (input.id && !previous) throw new Error("Kayıt bulunamadı.");
    if (!previous && current.data.entries.length >= 10000)
      throw new Error("Kayıt sınırı aşıldı.");
    const item = V.entry(
      {
        ...input,
        password:
          input.password === null && previous
            ? previous.password
            : input.password,
      },
      previous,
    );
    return commit({
      ...current.data,
      entries: previous
        ? current.data.entries.map((e) => (e.id === item.id ? item : e))
        : [...current.data.entries, item],
    });
  },
  async remove({ id }) {
    const current = requireVault();
    return commit({
      ...current.data,
      entries: current.data.entries.filter((e) => e.id !== id),
    });
  },
  async reveal({ id }) {
    const item = requireVault().data.entries.find((e) => e.id === id);
    if (!item) throw new Error("Kayıt bulunamadı.");
    return item.password;
  },
  async copy({ id, field }) {
    const item = requireVault().data.entries.find((e) => e.id === id);
    if (!item || !["password", "username"].includes(field))
      throw new Error("Kayıt bulunamadı.");
    const value = item[field],
      token = generation;
    await queueClipboard(async () => {
      checkGeneration(token);
      await eraseOwnedClipboard();
      checkGeneration(token);
      clipboardValue = value;
      await clipboard.writeText(value);
      if (generation !== token) {
        await eraseOwnedClipboard();
        throw new Error("Kasa kilitlendi.");
      }
      clipboardTimer = setTimeout(() => {
        void clearClipboard().catch(() => {});
      }, 30000);
    });
    return true;
  },
  async generate(options) {
    requireVault();
    return V.generate(options);
  },
  async settings({ lockMinutes }) {
    const current = requireVault();
    if (![1, 2, 5, 10, 15].includes(lockMinutes))
      throw new Error("Geçersiz kilit süresi.");
    return commit({ ...current.data, settings: { lockMinutes } });
  },
  async backup() {
    const current = requireVault(),
      token = generation;
    const filename = await chooseSave(
      "Şifreli yedek kaydet",
      `SecPass-yedek-${new Date().toISOString().slice(0, 10)}.spvault`,
    );
    checkGeneration(token);
    if (!filename) return false;
    if (path.resolve(filename) === path.resolve(file))
      throw new Error("Yedeği kasadan farklı bir konuma kaydedin.");
    await V.atomicWrite(filename, V.encode(current));
    return true;
  },
  async changeMaster({ currentPassword, password }) {
    const current = requireVault(),
      token = generation;
    const verification = await V.unlock(
      V.encode(current),
      currentPassword,
      "password",
    );
    V.destroy(verification);
    checkGeneration(token);
    const replacement = await V.rekey(current, password);
    try {
      checkGeneration(token);
      const disk = await V.readVault(file);
      checkGeneration(token);
      if (digest(disk) !== expected)
        throw new Error("Kasa dışarıdan değiştirildi. Yeniden açın.");
      const raw = V.encode(replacement.session);
      await V.atomicWrite(file + ".backup", disk);
      checkGeneration(token);
      await V.atomicWrite(file, raw);
      checkGeneration(token);
      // Do not destroy the shared data object when replacing the key.
      current.key.fill(0);
      active = replacement.session;
      expected = digest(raw);
      return { recovery: replacement.recovery };
    } catch (error) {
      replacement.session.key.fill(0);
      throw error;
    }
  },
  async recoverMaster({ recovery, password }) {
    const current = requireVault(),
      token = generation;
    const verification = await V.unlock(
      V.encode(current),
      recovery,
      "recovery",
    );
    V.destroy(verification);
    checkGeneration(token);
    const replacement = await V.rekey(current, password);
    try {
      checkGeneration(token);
      const disk = await V.readVault(file);
      checkGeneration(token);
      if (digest(disk) !== expected)
        throw new Error("Kasa dışarıdan değiştirildi. Yeniden açın.");
      const raw = V.encode(replacement.session);
      await V.atomicWrite(file + ".backup", disk);
      checkGeneration(token);
      await V.atomicWrite(file, raw);
      checkGeneration(token);
      current.key.fill(0);
      active = replacement.session;
      expected = digest(raw);
      return { recovery: replacement.recovery };
    } catch (error) {
      replacement.session.key.fill(0);
      throw error;
    }
  },
  async previewImport() {
    const current = requireVault(),
      token = generation;
    pending = null;
    const filename = await chooseOpen("Google Password Manager CSV dosyası", [
      "csv",
    ]);
    checkGeneration(token);
    if (!filename) return null;
    const stat = await fs.stat(filename);
    if (stat.size > 8 * 1024 * 1024)
      throw new Error("CSV en fazla 8 MB olabilir.");
    const raw = await fs.readFile(filename, "utf8");
    checkGeneration(token);
    pending = prepareCSV(raw, current.data.entries);
    return {
      count: pending.added.length,
      duplicates: pending.duplicates,
      invalid: pending.invalid,
      omittedURLs: pending.omittedURLs,
      total: pending.total,
    };
  },
  async cancelImport() {
    pending = null;
    return true;
  },
  async confirmImport() {
    const current = requireVault();
    if (!pending) throw new Error("Önce bir CSV seçin.");
    const entries = pending.added;
    const result = await commit({
      ...current.data,
      entries: [...current.data.entries, ...entries],
    });
    pending = null;
    return result;
  },
  async openSite({ id, change }) {
    const current = requireVault();
    const item = current.data.entries.find((e) => e.id === id);
    if (!item) throw new Error("Kayıt bulunamadı.");
    const url = V.safeURL(change && item.changeUrl ? item.changeUrl : item.url);
    if (!url) throw new Error("Önce site adresini kayda ekleyin.");
    const answer = await dialog.showMessageBox(win, {
      type: "question",
      message: "Bu adres tarayıcıda açılsın mı?",
      detail:
        url +
        (change && !item.changeUrl
          ? "\n\nParola değiştirme adresi kayıtlı değil. Site açılacak; hesap ayarlarını kullanın."
          : ""),
      buttons: ["Vazgeç", "Tarayıcıda aç"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response === 1) await shell.openExternal(url);
    return answer.response === 1;
  },
};
function validSender(event) {
  return (
    win &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame.url === pageURL
  );
}
for (const [name, operation] of Object.entries(operations))
  ipcMain.handle(`vault:${name}`, (event, args = {}) => {
    if (!validSender(event)) return { ok: false, error: "Yetkisiz istek." };
    const requestGeneration = generation;
    const task = tail.then(async () => {
      try {
        checkGeneration(requestGeneration);
        return { ok: true, value: await operation(args) };
      } catch (error) {
        const code = error.code;
        return {
          ok: false,
          error: code
            ? {
                EACCES: "Dosyaya erişim izni yok.",
                ENOENT: "Dosya bulunamadı.",
                ENOSPC: "Diskte yeterli boş alan yok.",
                EROFS: "Konum yazmaya kapalı.",
              }[code] || "Dosya işlemi tamamlanamadı. Kasa korunuyor."
            : error.message || "İşlem tamamlanamadı.",
        };
      }
    });
    tail = task.catch(() => {});
    return task;
  });
ipcMain.on("vault:lock", (event) => {
  if (validSender(event)) lock();
});
ipcMain.on("vault:activity", (event) => {
  if (validSender(event) && active) lastActivity = Date.now();
});
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 950,
    minHeight: 650,
    title: "SecPass",
    backgroundColor: "#101720",
    webPreferences: {
      preload: path.join(__dirname, "desktop/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  win.webContents.on("render-process-gone", lock);
  win.on("minimize", lock);
  win.on("closed", () => {
    lock();
    win = null;
  });
  win.loadFile(path.join(__dirname, "dist/index.html"));
}
if (gotLock)
  app.whenReady().then(() => {
    electronSession.defaultSession.setPermissionRequestHandler(
      (_w, _p, callback) => callback(false),
    );
    electronSession.defaultSession.setPermissionCheckHandler(() => false);
    electronSession.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "SecPass",
          submenu: [
            {
              label: "Kasayı kilitle",
              accelerator: "CommandOrControl+L",
              click: lock,
            },
            { role: "quit" },
          ],
        },
        {
          label: "Düzenle",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
      ]),
    );
    powerMonitor.on("suspend", lock);
    powerMonitor.on("lock-screen", lock);
    setInterval(() => {
      if (
        active &&
        (Date.now() - lastActivity >=
          active.data.settings.lockMinutes * 60000 ||
          powerMonitor.getSystemIdleTime() >=
            active.data.settings.lockMinutes * 60)
      )
        lock();
    }, 1000).unref();
    createWindow();
  });
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  lock();
  clearClipboard()
    .finally(() => {
      quitting = true;
      app.quit();
    })
    .catch(() => {});
});
app.on("window-all-closed", () => app.quit());
