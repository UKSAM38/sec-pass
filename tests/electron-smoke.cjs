const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, ".."),
    work = path.resolve(root, "../../work/e2e");
  await fs.mkdir(work, { recursive: true });
  const vaultPath = path.join(work, "test-" + Date.now() + ".spvault"),
    backup = path.join(work, "backup.spvault"),
    csv = path.join(work, "demo.csv");
  await fs.writeFile(
    csv,
    "name,url,username,password,note\nGitHub,https://github.com,demo@example.test,Demo-shared-secret-123!,Only test data\nGoogle,https://accounts.google.com,demo@example.test,Demo-shared-secret-123!,Only test data\nBank,https://example.com,demouser,short,Test data\n",
  );
  let app;
  try {
    const { ELECTRON_RUN_AS_NODE: _runAsNode, ...cleanEnv } = process.env;
    app = await electron.launch({
      args: [root],
      env: { ...cleanEnv, SECUREPASS_TEST_HOME: path.join(work, "profile") },
      timeout: 30000,
    });
    // Isolate clipboard tests from the user's live macOS clipboard.
    await app.evaluate(({clipboard, powerMonitor}) => {
      let testClipboard = "";
      clipboard.readText = async () => testClipboard;
      clipboard.writeText = async (value) => { testClipboard = value; };
      clipboard.clear = () => { testClipboard = ""; };
      powerMonitor.getSystemIdleTime = () => 0;
    });
    const page = await app.firstWindow();
    await page.waitForSelector("h2");
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.screenshot({ path: path.join(root, "../SecurePass-giris.png") });
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, vaultPath);
    await page
      .getByRole("button", { name: "Yeni kasa oluştur", exact: true })
      .click();
    await page
      .getByLabel("Ana parola", { exact: true })
      .fill("A demo master phrase only 847!");
    await page
      .getByLabel("Ana parolayı doğrula", { exact: true })
      .fill("A demo master phrase only 847!");
    await page
      .getByRole("button", { name: "Kasa dosyasını oluştur", exact: true })
      .click();
    await page
      .getByText("Kurtarma anahtarını sakla", { exact: true })
      .waitFor();
    const recovery = await page.locator("code.recovery").innerText();
    assert.equal(recovery.replaceAll("-", "").length, 64);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Kasaya devam et" }).click();
    await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
    await page.getByLabel("Kayıt adı", { exact: true }).fill("Example account");
    await page
      .getByLabel("Site adresi", { exact: true })
      .fill("https://example.test");
    await page
      .getByLabel("Kullanıcı adı / e-posta", { exact: true })
      .fill("test@example.test");
    await page
      .getByLabel("Parola", { exact: true })
      .fill("Initial-test-password-373!");
    await page.getByRole("button", { name: "Şifreleyerek kaydet" }).click();
    await page
      .getByRole("button", { name: /Example account test@example/ })
      .click();
    assert.ok(
      !(await page.locator("body").innerText()).includes(
        "Initial-test-password-373!",
      ),
    );
    await page
      .getByRole("button", { name: "Parolayı göster", exact: true })
      .click();
    await page
      .getByText("Initial-test-password-373!", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Parolayı gizle", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Parolayı kopyala", exact: true })
      .click();
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      "Initial-test-password-373!",
    );
    await app.evaluate(({ clipboard }) =>
      clipboard.writeText("unrelated clipboard content"),
    );
    await page.evaluate(() => window.vault.lock());
    await page
      .getByRole("button", { name: "Kasa dosyasını seç ve aç" })
      .waitFor();
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      "unrelated clipboard content",
    );
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, vaultPath);
    await page
      .getByLabel("Ana parola", { exact: true })
      .fill("A demo master phrase only 847!");
    await page
      .getByRole("button", { name: "Kasa dosyasını seç ve aç" })
      .click();
    await page.getByText("Parola kasan", { exact: true }).waitFor();
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, csv);
    await page.getByRole("button", { name: "Google’dan içe aktar" }).click();
    // Import help is optional in earlier builds.
    const choose = page.getByRole("button", {
      name: "CSV dosyasını seç",
      exact: true,
    });
    if (await choose.count()) await choose.click();
    await page
      .getByRole("button", { name: "Şifreleyerek içe aktar", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Şifreleyerek içe aktar", exact: true })
      .click();
    await page.getByRole("button", { name: /GitHub demo@example/ }).click();
    await page
      .getByText("Bu parola 2 hesapta kullanılıyor.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Bu hesapları göster →", exact: true })
      .click();
    assert.equal(await page.locator(".record").count(), 2);
    await page
      .getByRole("button", { name: /Aynı parolayı kullanan hesaplar/ })
      .click();
    await page.getByRole("button", { name: /Güvenlik kontrolü/ }).click();
    await page.locator(".toast").waitFor({ state: "hidden" });
    await page.mouse.move(640, 50);
    await page.screenshot({
      path: path.join(root, "../SecurePass-kasa.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Kaydı düzenle", exact: true })
      .click();
    await page
      .getByLabel("Parola", { exact: true })
      .fill("A-new-unique-demo-secret-4567!");
    await page.getByRole("button", { name: "Şifreleyerek kaydet" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByText("Bu parola 2 hesapta kullanılıyor.", { exact: true })
      .waitFor({ state: "hidden" });
    const summary = await page.evaluate(() => window.vault.list());
    assert.equal(summary.entries.length, 4);
    assert.ok(summary.entries.every((e) => !("password" in e)));
    assert.ok(summary.entries.every((e) => e.reused === 1));
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, backup);
    await page.getByRole("button", { name: "Şifreli yedek al" }).click();
    await page
      .getByText("Şifreli yedek kaydedildi. Ayrı bir diskte saklayabilirsin.", {
        exact: true,
      })
      .waitFor();
    const encrypted = await fs.readFile(vaultPath, "utf8");
    assert.ok(!encrypted.includes("demo@example"));
    assert.ok(!encrypted.includes("Initial-test-password"));
    await page.evaluate(() => window.vault.lock());
    await page
      .getByRole("button", { name: "Kasa dosyasını seç ve aç" })
      .waitFor();
    await assert.rejects(page.evaluate(() => window.vault.list()));
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, backup);
    await page
      .getByRole("button", { name: "Kurtarma anahtarıyla aç", exact: true })
      .click();
    await page.getByLabel("Kurtarma anahtarı", { exact: true }).fill(recovery);
    await page
      .getByRole("button", { name: "Kasa dosyasını seç ve aç" })
      .click();
    await page.getByText("Kasa ayarları", { exact: true }).last().waitFor();
    assert.equal(
      (await page.evaluate(() => window.vault.list())).entries.length,
      4,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: create, recovery acknowledgement, add, reveal/hide, clipboard ownership, lock/unlock, CSV import, reuse warning/group, edit, encrypted backup/restore, recovery unlock, locked IPC; no renderer exceptions.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(work, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
