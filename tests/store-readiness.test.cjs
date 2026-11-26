const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function pngInfo(relPath) {
  const full = path.join(root, relPath);
  assert.ok(fs.existsSync(full), `Missing asset: ${relPath}`);
  const out = execFileSync(
    "/usr/bin/sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", full],
    { encoding: "utf8" },
  );
  return {
    width: Number(/pixelWidth:\s*(\d+)/.exec(out)[1]),
    height: Number(/pixelHeight:\s*(\d+)/.exec(out)[1]),
    hasAlpha: /hasAlpha:\s*yes/i.test(out),
  };
}

test("GitHub Pages legal & support HTML files exist with developer contact and zero placeholders", () => {
  for (const page of [
    "docs/.nojekyll",
    "docs/index.html",
    "docs/privacy.html",
    "docs/support.html",
    "store-packages/STORE-UPLOAD-GUIDE-TR.md",
  ]) {
    assert.ok(fs.existsSync(path.join(root, page)), `Missing ${page}`);
  }
  for (const page of ["docs/privacy.html", "docs/support.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /Samet Uçar/);
    assert.match(html, /sametucar2738@gmail\.com/);
    assert.doesNotMatch(
      html,
      /\[DOLDURULACAK\]|\[HTTPS URL\]|\[DESTEK E-POSTASI\]|\[YASAL AD/,
    );
  }
});

test("App Store and Google Play icons, feature graphic, and screenshots meet exact store dimensions", () => {
  const iosIcon = pngInfo(
    "store-packages/app-store/SecurePass-iOS/SecurePass/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png",
  );
  assert.deepEqual(iosIcon, { width: 1024, height: 1024, hasAlpha: false });

  const playIcon = pngInfo("store-packages/google-play/store-assets/icon-512.png");
  assert.equal(playIcon.width, 512);
  assert.equal(playIcon.height, 512);

  const feature = pngInfo(
    "store-packages/google-play/store-assets/feature-graphic-1024x500.png",
  );
  assert.equal(feature.width, 1024);
  assert.equal(feature.height, 500);

  for (const [dir, w, h] of [
    ["store-packages/app-store/store-assets/screenshots/iphone-6.7", 1290, 2796],
    ["store-packages/app-store/store-assets/screenshots/ipad-13", 2048, 2732],
    ["store-packages/google-play/store-assets/screenshots/phone", 1080, 1920],
  ]) {
    const fullDir = path.join(root, dir);
    assert.ok(fs.existsSync(fullDir), `Missing screenshot directory: ${dir}`);
    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".png"));
    assert.ok(files.length >= 3, `Expected >=3 screenshots in ${dir}`);
    for (const f of files) {
      const info = pngInfo(path.join(dir, f));
      assert.equal(info.width, w, `Wrong width for ${dir}/${f}`);
      assert.equal(info.height, h, `Wrong height for ${dir}/${f}`);
      assert.equal(info.hasAlpha, false, `Alpha must be false for ${dir}/${f}`);
    }
  }
});
