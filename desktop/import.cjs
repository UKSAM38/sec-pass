"use strict";
const { entry } = require("./vault.cjs");
// RFC 4180-style quoted fields, escaped quotes, BOM and embedded newlines.
function parseCSV(input) {
  if (typeof input !== "string" || Buffer.byteLength(input) > 8 * 1024 * 1024)
    throw new Error("CSV en fazla 8 MB olabilir.");
  const rows = [];
  let row = [],
    field = "",
    state = "start";
  const pushField = () => {
    if (field.length > 12000) throw new Error("CSV alanı çok uzun.");
    row.push(field);
    field = "";
    state = "start";
    if (row.length > 30) throw new Error("CSV sütun sayısı sınırı aşıldı.");
  };
  const pushRow = () => {
    pushField();
    if (row.some((v) => v !== "")) rows.push(row);
    row = [];
    if (rows.length > 10001)
      throw new Error("En fazla 10.000 kayıt aktarılabilir.");
  };
  const source = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (state === "quoted") {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else state = "closed";
      } else field += c;
      continue;
    }
    if (c === ",") {
      pushField();
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      pushRow();
      continue;
    }
    if (state === "closed") throw new Error("CSV tırnak biçimi geçersiz.");
    if (c === '"') {
      if (state !== "start") throw new Error("CSV tırnak biçimi geçersiz.");
      state = "quoted";
    } else {
      field += c;
      state = "plain";
    }
  }
  if (state === "quoted") throw new Error("CSV içinde kapanmamış tırnak var.");
  if (field || row.length || state !== "start") pushRow();
  return rows;
}
function prepareCSV(raw, existing) {
  const rows = parseCSV(raw);
  if (!rows.length) throw new Error("CSV boş.");
  const header = rows.shift().map((v) => v.trim().toLowerCase());
  if (
    new Set(header).size !== header.length ||
    !["name", "url", "username", "password"].every((v) => header.includes(v))
  )
    throw new Error(
      "Google CSV başlıkları gerekli: name, url, username, password (note isteğe bağlı).",
    );
  const get = (row, name) => row[header.indexOf(name)] || "";
  const fingerprint = (e) => JSON.stringify([e.url, e.username, e.password]);
  const seen = new Set(existing.map(fingerprint));
  const added = [];
  let duplicates = 0,
    invalid = 0,
    omittedURLs = 0;
  for (const row of rows) {
    try {
      if (row.length !== header.length) throw new Error();
      const input = {
        name: get(row, "name") || get(row, "url") || "İçe aktarılan kayıt",
        url: get(row, "url"),
        username: get(row, "username"),
        password: get(row, "password"),
        notes: get(row, "note") || get(row, "notes"),
        category: "İçe aktarılan",
      };
      let item;
      try {
        item = entry(input);
      } catch {
        item = entry({ ...input, url: "" });
        if (input.url) {
          item.notes =
            `${input.notes}\nOrijinal adres (bağlantı olarak açılmaz): ${input.url}`.slice(
              0,
              10000,
            );
          omittedURLs++;
        }
      }
      const key = fingerprint(item);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      added.push(item);
    } catch {
      invalid++;
    }
  }
  if (existing.length + added.length > 10000)
    throw new Error("Kasa en fazla 10.000 kayıt tutabilir.");
  return { added, duplicates, invalid, omittedURLs, total: rows.length };
}
module.exports = { parseCSV, prepareCSV };
