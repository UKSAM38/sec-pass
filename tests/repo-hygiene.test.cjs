const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("package metadata and UI use SecPass brand and io.github.uksam38.secpass.desktop appId", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.build.productName, "SecPass");
  assert.equal(pkg.build.appId, "io.github.uksam38.secpass.desktop");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /SecPass/);
  assert.doesNotMatch(html, /SecurePass/);
});

test("gitignore blocks release-secrets, keystores, binaries, and personal vaults while allowing INTEROP-TEST-VECTOR.spvault", () => {
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const rule of [
    "release-secrets/",
    "keystore.properties",
    "*.jks",
    "*.aab",
    "!**/INTEROP-TEST-VECTOR.spvault",
  ]) {
    assert.ok(ignore.includes(rule), `Missing ignore rule: ${rule}`);
  }
});
