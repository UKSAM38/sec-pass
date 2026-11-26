const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, ".."),
    work = path.resolve(root, "../../work/security-e2e");
  await fs.mkdir(work, { recursive: true });
  const file = path.join(work, "security.spvault");
  await fs.rm(file, { force: true });
  let app;
  try {
    const { ELECTRON_RUN_AS_NODE: _runAsNode, ...cleanEnv } = process.env;
    app = await electron.launch({
      args: [root],
      env: { ...cleanEnv, SECUREPASS_TEST_HOME: path.join(work, "profile") },
    });
    // Isolate clipboard tests from the user's live macOS clipboard.
    await app.evaluate(({clipboard, powerMonitor}) => {
      let testClipboard = "";
      clipboard.readText = async () => testClipboard;
      clipboard.writeText = async (value) => { testClipboard = value; };
      clipboard.clear = () => { testClipboard = ""; };
      // Keep the test deterministic on unattended machines; idle-lock is
      // exercised explicitly below with a controlled value.
      powerMonitor.getSystemIdleTime = () => 0;
    });
    const page = await app.firstWindow();
    await page.waitForSelector("h2");
    const preferences = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    );
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(await page.evaluate(() => typeof require), "undefined");
    assert.equal(
      await page.evaluate(() =>
        fetch("https://example.com").then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
    await page.evaluate(() =>
      window.vault.create({ password: "Original long test master 823!" }),
    );
    await page.evaluate(() =>
      window.vault.save({
        name: "Test",
        url: "https://example.com",
        username: "test",
        password: "Fake-entry-secret-374!",
      }),
    );
    const initial = await fs.readFile(file, "utf8");
    const id = (await page.evaluate(() => window.vault.list())).entries[0].id;
    await assert.rejects(
      page.evaluate(() => window.vault.settings({ lockMinutes: 0 })),
    );
    assert.equal(await fs.readFile(file, "utf8"), initial);
    await fs.writeFile(file, initial + "\n");
    await assert.rejects(
      page.evaluate((id) => window.vault.remove({ id }), id),
    );
    assert.equal(await fs.readFile(file, "utf8"), initial + "\n");
    await fs.writeFile(file, initial);
    await page.evaluate(
      (id) => window.vault.copy({ id, field: "password" }),
      id,
    );
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      "Fake-entry-secret-374!",
    );
    await new Promise((r) => setTimeout(r, 30500));
    assert.equal(await app.evaluate(({clipboard}) => clipboard.readText()), "");
    await page.evaluate(id => window.vault.copy({id, field:"password"}), id);
    await app.evaluate(({ powerMonitor }) => {
      powerMonitor.emit("suspend");
    });
    await new Promise((r) => setTimeout(r, 150));
    await assert.rejects(page.evaluate(() => window.vault.list()));
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      "",
    );
    await page.evaluate(() =>
      window.vault.unlock({
        secret: "Original long test master 823!",
        mode: "password",
      }),
    );
    await page.evaluate(() =>
      window.vault.changeMaster({
        currentPassword: "Original long test master 823!",
        password: "New long test master 739!",
      }),
    );
    await page.evaluate(() => window.vault.lock());
    await assert.rejects(
      page.evaluate(() =>
        window.vault.unlock({
          secret: "Original long test master 823!",
          mode: "password",
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 2200));
    await page.evaluate(() =>
      window.vault.unlock({
        secret: "New long test master 739!",
        mode: "password",
      }),
    );
    assert.equal(
      (await page.evaluate(() => window.vault.list())).entries.length,
      1,
    );
    await app.evaluate(({ powerMonitor }) => {
      powerMonitor.getSystemIdleTime = () => 3600;
    });
    await new Promise((r) => setTimeout(r, 1200));
    await assert.rejects(page.evaluate(() => window.vault.list()));
    await app.evaluate(({ powerMonitor }) => {
      powerMonitor.getSystemIdleTime = () => 0;
    });
    const outcome = await page.evaluate(async () => {
      const result = window.vault
        .unlock({ secret: "New long test master 739!", mode: "password" })
        .then(
          () => true,
          () => false,
        );
      setTimeout(() => window.vault.lock(), 10);
      return result;
    });
    assert.equal(outcome, false);
    await assert.rejects(page.evaluate(() => window.vault.list()));
    console.log(
      "PASS: sandbox/isolation, Node isolation, blocked network, invalid settings, external-file conflict, 30-second clipboard expiry, owned clipboard clear, suspend lock, master rotation, old-password rejection, OS-idle lock, lock-during-unlock cancellation.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(work, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
