"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const LIMIT = 16 * 1024 * 1024;
const PARAMS = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const FORMAT = "securepass-v1";
function fail(message = "Kasa dosyası geçersiz veya desteklenmiyor.") {
  throw new Error(message);
}
function text(value, max = 4096) {
  if (typeof value !== "string" || value.length > max)
    fail("Geçersiz veya çok uzun alan.");
  return value;
}
function master(value) {
  text(value, 1024);
  if (value.length < 14 || !value.trim())
    fail(
      "Ana parola en az 14 karakter olmalı. Birkaç rastgele kelime kullanın.",
    );
  return value;
}
function b64(value, length) {
  if (
    typeof value !== "string" ||
    value.length > LIMIT * 2 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    fail();
  const result = Buffer.from(value, "base64");
  if (
    result.toString("base64") !== value ||
    (length && result.length !== length)
  )
    fail();
  return result;
}
function seal(key, data, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${FORMAT}:${purpose}`));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
function unseal(key, box, purpose) {
  if (!box || typeof box !== "object") fail();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, b64(box.iv, 12));
  decipher.setAAD(Buffer.from(`${FORMAT}:${purpose}`));
  decipher.setAuthTag(b64(box.tag, 16));
  return Buffer.concat([
    decipher.update(b64(box.ciphertext)),
    decipher.final(),
  ]);
}
async function passwordKey(password, salt) {
  text(password, 1024);
  return scrypt(password, salt, 32, PARAMS);
}
function recoveryKey(value) {
  const normalized = text(value, 256).replace(/[\s-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized))
    fail("Kurtarma anahtarı 64 onaltılık karakterden oluşmalı.");
  return Buffer.from(normalized, "hex");
}
function safeURL(input) {
  text(input, 2048);
  if (!input.trim()) return "";
  let value = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = "https://" + value;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Geçerli bir site adresi girin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    /[\r\n]/.test(value)
  )
    fail("Bağlantı https:// ile başlamalı ve kullanıcı bilgisi içermemeli.");
  return url.href;
}
function entry(input, existing) {
  if (!input || typeof input !== "object") fail();
  const name = text(input.name, 256).trim();
  if (!name) fail("Site / kayıt adı gerekli.");
  const password = text(input.password, 4096);
  if (!password) fail("Parola boş olamaz.");
  const now = new Date().toISOString();
  return {
    id: existing?.id || crypto.randomUUID(),
    name,
    url: safeURL(input.url || ""),
    changeUrl: safeURL(input.changeUrl || ""),
    username: text(input.username || "", 1024),
    password,
    category: text(input.category || "Diğer", 80),
    notes: text(input.notes || "", 10000),
    favorite: !!input.favorite,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    passwordChangedAt:
      existing && password === existing.password
        ? existing.passwordChangedAt
        : now,
  };
}
function validateData(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    data.entries.length > 10000
  )
    fail();
  const ids = new Set();
  for (const item of data.entries) {
    entry(item);
    if (typeof item.id !== "string" || ids.has(item.id)) fail();
    ids.add(item.id);
    for (const k of ["createdAt", "updatedAt", "passwordChangedAt"])
      if (typeof item[k] !== "string" || !Number.isFinite(Date.parse(item[k])))
        fail();
  }
  if (!data.settings || ![1, 2, 5, 10, 15].includes(data.settings.lockMinutes))
    fail();
  return data;
}
function encode(session) {
  const plaintext = Buffer.from(JSON.stringify(validateData(session.data)));
  try {
    return JSON.stringify({
      format: FORMAT,
      salt: session.salt,
      passwordSlot: session.passwordSlot,
      recoverySlot: session.recoverySlot,
      data: seal(session.key, plaintext, "data"),
    });
  } finally {
    plaintext.fill(0);
  }
}
async function create(password) {
  master(password);
  const key = crypto.randomBytes(32),
    salt = crypto.randomBytes(32),
    recovery = crypto.randomBytes(32);
  const derived = await passwordKey(password, salt);
  try {
    const session = {
      key,
      salt: salt.toString("base64"),
      passwordSlot: seal(derived, key, "password"),
      recoverySlot: seal(recovery, key, "recovery"),
      data: { version: 1, entries: [], settings: { lockMinutes: 5 } },
    };
    return {
      session,
      recovery: recovery
        .toString("hex")
        .match(/.{1,8}/g)
        .join("-"),
    };
  } finally {
    derived.fill(0);
    recovery.fill(0);
  }
}
async function unlock(raw, secret, mode = "password") {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > LIMIT) fail();
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    fail();
  }
  if (envelope.format !== FORMAT || !["password", "recovery"].includes(mode))
    fail();
  const salt = b64(envelope.salt, 32);
  const derived =
    mode === "recovery" ? recoveryKey(secret) : await passwordKey(secret, salt);
  let key;
  try {
    key = unseal(derived, envelope[`${mode}Slot`], mode);
    if (key.length !== 32) fail();
    const bytes = unseal(key, envelope.data, "data");
    let data;
    try {
      data = validateData(JSON.parse(bytes.toString("utf8")));
    } finally {
      bytes.fill(0);
    }
    return {
      key,
      salt: envelope.salt,
      passwordSlot: envelope.passwordSlot,
      recoverySlot: envelope.recoverySlot,
      data,
    };
  } catch {
    key?.fill(0);
    fail(
      "Parola / kurtarma anahtarı yanlış veya kasa dosyası hasarlı. Dosya değiştirilmedi.",
    );
  } finally {
    derived.fill(0);
  }
}
async function rekey(session, password) {
  const next = await create(password);
  next.session.data = session.data;
  return next;
}
function destroy(session) {
  if (session) {
    session.key.fill(0);
    session.data.entries = [];
  }
}
async function readVault(filename) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > LIMIT)
    fail("Dosya çok büyük veya geçersiz.");
  return fs.readFile(filename, "utf8");
}
async function atomicWrite(filename, content, exclusive = false) {
  if (Buffer.byteLength(content) > LIMIT) fail("Kasa boyutu sınırı aşıldı.");
  const temp = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    if (exclusive) {
      await fs.link(temp, filename);
      await fs.unlink(temp);
    } else await fs.rename(temp, filename);
    const dir = await fs.open(path.dirname(filename), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temp).catch(() => {});
  }
}
function generate(options = {}) {
  const length = Number(options.length || 20);
  if (!Number.isInteger(length) || length < 12 || length > 128)
    fail("Parola uzunluğu 12–128 olmalı.");
  let groups = [
    options.upper !== false ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "",
    options.lower !== false ? "abcdefghijkmnopqrstuvwxyz" : "",
    options.numbers !== false ? "23456789" : "",
    options.symbols !== false ? "!@#$%^&*()-_=+[]{}:,.?" : "",
  ].filter(Boolean);
  if (!groups.length) fail("En az bir karakter türü seçin.");
  const all = groups.join("");
  const chars = groups.map((g) => g[crypto.randomInt(g.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
function weak(password) {
  return (
    password.length < 12 ||
    /^(.)\1+$/.test(password) ||
    /^(password|qwerty|123456|şifre|sifre|admin)/i.test(password)
  );
}
function summary(data) {
  const counts = new Map(),
    groups = new Map();
  for (const e of data.entries) {
    counts.set(e.password, (counts.get(e.password) || 0) + 1);
    if (!groups.has(e.password)) groups.set(e.password, e.id);
  }
  return {
    settings: data.settings,
    entries: data.entries.map(({ password, ...rest }) => ({
      ...rest,
      reused: counts.get(password),
      reuseGroup: groups.get(password),
      weak: weak(password),
    })),
  };
}
module.exports = {
  create,
  unlock,
  rekey,
  encode,
  destroy,
  entry,
  validateData,
  readVault,
  atomicWrite,
  generate,
  summary,
  safeURL,
  LIMIT,
};
