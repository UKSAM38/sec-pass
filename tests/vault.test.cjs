const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const V = require("../desktop/vault.cjs");
const { parseCSV, prepareCSV } = require("../desktop/import.cjs");
const master = "four random words / demo only";
const item = (password = "Unique-test-secret-473!") =>
  V.entry({
    name: "Example",
    url: "https://example.com",
    username: "demo@example.com",
    password,
    notes: "Not a real password",
  });
test("encrypted roundtrip; wrong password and recovery key", async () => {
  const { session, recovery } = await V.create(master);
  session.data.entries.push(item());
  const raw = V.encode(session);
  assert.ok(!raw.includes("Unique-test-secret"));
  assert.ok(!raw.includes("demo@example.com"));
  assert.ok(!raw.includes(master));
  const open = await V.unlock(raw, master);
  assert.equal(open.data.entries[0].password, "Unique-test-secret-473!");
  const recover = await V.unlock(raw, recovery, "recovery");
  assert.equal(recover.data.entries.length, 1);
  await assert.rejects(V.unlock(raw, "wrong"));
  await assert.rejects(V.unlock(raw, "a".repeat(64), "recovery"));
  V.destroy(session);
  V.destroy(open);
  V.destroy(recover);
});
test("tampered ciphertext, tag, nonce and slot fail closed", async () => {
  const { session } = await V.create(master);
  const raw = V.encode(session);
  for (const field of ["ciphertext", "tag", "iv"]) {
    const e = JSON.parse(raw);
    const b = Buffer.from(e.data[field], "base64");
    b[0] ^= 1;
    e.data[field] = b.toString("base64");
    await assert.rejects(V.unlock(JSON.stringify(e), master));
  }
  const e = JSON.parse(raw);
  e.passwordSlot = e.recoverySlot;
  await assert.rejects(V.unlock(JSON.stringify(e), master));
  V.destroy(session);
});
test("fresh encryption nonce each save; unsupported formats rejected", async () => {
  const { session } = await V.create(master);
  const one = V.encode(session),
    two = V.encode(session);
  assert.notEqual(JSON.parse(one).data.iv, JSON.parse(two).data.iv);
  await assert.rejects(
    V.unlock(one.replace("securepass-v1", "securepass-v2"), master),
  );
  await assert.rejects(V.unlock("{}", master));
  await assert.rejects(V.unlock("broken", master));
  V.destroy(session);
});
test("rekey preserves data and invalidates old password and recovery on new file", async () => {
  const { session, recovery } = await V.create(master);
  session.data.entries = [item()];
  const next = await V.rekey(session, "a new and longer master phrase");
  const raw = V.encode(next.session);
  await assert.rejects(V.unlock(raw, master));
  await assert.rejects(V.unlock(raw, recovery, "recovery"));
  const opened = await V.unlock(raw, "a new and longer master phrase");
  assert.equal(opened.data.entries[0].name, "Example");
  const rescued = await V.unlock(raw, next.recovery, "recovery");
  assert.equal(rescued.data.entries.length, 1);
  V.destroy(opened);
  V.destroy(rescued);
  V.destroy(session);
  V.destroy(next.session);
});
test("atomic write: private permissions, refusal to overwrite new vault, no temp residue", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "securepass-test-"));
  try {
    const file = path.join(dir, "test.spvault");
    await V.atomicWrite(file, "first", true);
    await assert.rejects(V.atomicWrite(file, "second", true));
    assert.equal(await fs.readFile(file, "utf8"), "first");
    await V.atomicWrite(file, "third");
    assert.equal(await fs.readFile(file, "utf8"), "third");
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await fs.readdir(dir), ["test.spvault"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("generator guarantees selected character groups and bounds", () => {
  const samples = new Set();
  for (let i = 0; i < 200; i++) {
    const p = V.generate({ length: 20 });
    assert.match(p, /[A-Z]/);
    assert.match(p, /[a-z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[^a-z0-9]/i);
    assert.equal(p.length, 20);
    samples.add(p);
  }
  assert.equal(samples.size, 200);
  assert.match(V.generate({ length: 12, symbols: false }), /^[a-z0-9]+$/i);
  assert.throws(() => V.generate({ length: 1 }));
  assert.throws(() => V.generate({ length: 129 }));
  assert.throws(() =>
    V.generate({ upper: false, lower: false, numbers: false, symbols: false }),
  );
});
test("list summaries never include passwords and identify reused groups", () => {
  const a = item(),
    b = item();
  b.name = "Second";
  const c = item("a-different-test-secret");
  const result = V.summary({
    entries: [a, b, c],
    settings: { lockMinutes: 5 },
  });
  assert.ok(result.entries.every((e) => !Object.hasOwn(e, "password")));
  assert.equal(result.entries[0].reused, 2);
  assert.equal(result.entries[0].reuseGroup, result.entries[1].reuseGroup);
  assert.notEqual(result.entries[0].reuseGroup, result.entries[2].reuseGroup);
  assert.equal(result.entries[2].reused, 1);
});
test("URLs allow https only; script, file and embedded credentials blocked", () => {
  assert.equal(V.safeURL("example.com"), "https://example.com/");
  for (const value of [
    "javascript:alert(1)",
    "file:///tmp/x",
    "http://example.com",
    "https://user:pw@example.com",
    "data:text/html,hi",
    "https://localhost",
  ])
    assert.throws(() => V.safeURL(value));
});
test("entry editing preserves creation and password date; empty fields rejected", () => {
  const original = item();
  original.createdAt = "2020-01-01T00:00:00.000Z";
  original.passwordChangedAt = original.createdAt;
  const edited = V.entry({ ...original, name: "Updated" }, original);
  assert.equal(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.equal(edited.passwordChangedAt, original.passwordChangedAt);
  const changed = V.entry(
    { ...original, password: "Different test password" },
    original,
  );
  assert.notEqual(changed.passwordChangedAt, original.passwordChangedAt);
  assert.throws(() => V.entry({ name: "", password: "x" }));
  assert.throws(() => V.entry({ name: "a", password: "" }));
});
test("CSV handles UTF-8 BOM, CRLF, commas, multiline notes and literal password spaces", () => {
  const csv =
    '\uFEFFname,url,username,password,note\r\n"Example, Inc",https://example.com,demo,"  a,""b  ","line1\nline2"\r\n';
  const result = prepareCSV(csv, []);
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].password, '  a,"b  ');
  assert.equal(result.added[0].notes, "line1\nline2");
  assert.equal(result.added[0].name, "Example, Inc");
});
test("CSV duplicate skipping, differing passwords retained, invalid rows reported", () => {
  const original = item();
  const csv =
    "name,url,username,password\nExample,https://example.com/,demo@example.com,Unique-test-secret-473!\nExample,https://example.com/,demo@example.com,Another secret\nBroken,https://bad.com,a,\nAndroid,android://abc@app,user,secret\n";
  const r = prepareCSV(csv, [original]);
  assert.equal(r.duplicates, 1);
  assert.equal(r.added.length, 2);
  assert.equal(r.invalid, 1);
  assert.equal(r.omittedURLs, 1);
  assert.equal(r.added[1].url, "");
  assert.match(r.added[1].notes, /android:/);
});
test("CSV malformed quotes and headers rejected; password formula strings treated literally", () => {
  assert.throws(() => parseCSV('a,"unclosed'));
  assert.throws(() => parseCSV('"a"x,b'));
  assert.throws(() => prepareCSV("x,y\na,b", []));
  assert.throws(() =>
    prepareCSV("name,url,username,password,password\na,b,c,d,e", []),
  );
  const r = prepareCSV(
    "name,url,username,password\nx,https://example.com,a,=SUM(1+2)",
    [],
  );
  assert.equal(r.added[0].password, "=SUM(1+2)");
});
test("master password minimum and payload settings validated", async () => {
  await assert.rejects(V.create("short"));
  assert.throws(() =>
    V.validateData({ version: 1, entries: [], settings: { lockMinutes: 0 } }),
  );
  const e = item();
  assert.throws(() =>
    V.validateData({
      version: 1,
      entries: [e, e],
      settings: { lockMinutes: 5 },
    }),
  );
});
test("mobile interoperability vector opens with the desktop vault engine", async () => {
  const fixture = path.join(
    __dirname,
    "..",
    "store-packages",
    "INTEROP-TEST-VECTOR.spvault",
  );
  const raw = await fs.readFile(fixture, "utf8");
  const opened = await V.unlock(raw, "interop test master phrase 482!");
  assert.equal(opened.data.entries.length, 1);
  assert.equal(opened.data.entries[0].name, "Interop Example");
  assert.equal(opened.data.entries[0].username, "interop@example.test");
  assert.equal(opened.data.entries[0].password, "Interop-demo-secret-739!");
  V.destroy(opened);
});
