import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Shield,
  LockKeyhole,
  Search,
  Plus,
  KeyRound,
  Download,
  Upload,
  Settings,
  Star,
  LogOut,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
  Pencil,
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
type Entry = {
  id: string;
  name: string;
  url: string;
  changeUrl: string;
  username: string;
  category: string;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt: string;
  reused: number;
  weak: boolean;
  reuseGroup?: string;
};
type Vault = {
  entries: Entry[];
  settings: { lockMinutes: number };
  filename?: string;
  recovery?: string;
};
type Preview = {
  count: number;
  duplicates: number;
  invalid: number;
  omittedURLs: number;
  total: number;
};
type Draft = {
  id?: string;
  name: string;
  url: string;
  changeUrl: string;
  username: string;
  password: string | null;
  category: string;
  notes: string;
  favorite: boolean;
};
type API = {
  create: (x: { password: string }) => Promise<Vault | null>;
  unlock: (x: { secret: string; mode: string }) => Promise<Vault | null>;
  list: () => Promise<Vault>;
  save: (x: Draft) => Promise<Vault>;
  remove: (x: { id: string }) => Promise<Vault>;
  reveal: (x: { id: string }) => Promise<string>;
  copy: (x: { id: string; field: string }) => Promise<boolean>;
  generate: (x: Record<string, unknown>) => Promise<string>;
  settings: (x: { lockMinutes: number }) => Promise<Vault>;
  backup: () => Promise<boolean>;
  changeMaster: (x: Record<string, string>) => Promise<{ recovery: string }>;
  recoverMaster: (x: Record<string, string>) => Promise<{ recovery: string }>;
  previewImport: () => Promise<Preview | null>;
  cancelImport: () => Promise<boolean>;
  confirmImport: () => Promise<Vault>;
  openSite: (x: { id: string; change: boolean }) => Promise<boolean>;
  lock: () => void;
  activity: () => void;
  onLock: (callback: () => void) => () => void;
};
declare global {
  interface Window {
    vault: API;
  }
}
const empty: Draft = {
  name: "",
  url: "",
  changeUrl: "",
  username: "",
  password: "",
  category: "Diğer",
  notes: "",
  favorite: false,
};
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("input,button,select,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && root) {
        const list = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
          ),
        );
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const date = (value: string) => new Date(value).toLocaleDateString("tr-TR");
export default function App() {
  const [vault, setVault] = useState<Vault | null>(null),
    [mode, setMode] = useState("open"),
    [secret, setSecret] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("name"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [showDraft, setShowDraft] = useState(false),
    [visible, setVisible] = useState(""),
    [recovery, setRecovery] = useState(""),
    [recoverySaved, setRecoverySaved] = useState(false);
  const [importHelp, setImportHelp] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [oldSecret, setOldSecret] = useState(""),
    [newSecret, setNewSecret] = useState(""),
    [newConfirm, setNewConfirm] = useState(""),
    [resetWithRecovery, setResetWithRecovery] = useState(false);
  const [length, setLength] = useState(20),
    [symbols, setSymbols] = useState(true),
    [reuseGroup, setReuseGroup] = useState<string | null>(null);
  const epoch = useRef(0),
    busyRef = useRef(false),
    selectedRef = useRef(selected);
  selectedRef.current = selected;
  const api = window.vault;
  async function guarded<T>(promise: Promise<T>) {
    const token = epoch.current;
    const value = await promise;
    if (token !== epoch.current) throw new Error("Kasa kilitlendi.");
    return value;
  }
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem tamamlanamadı.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function update(value: Vault) {
    setVault((old) => ({ ...value, filename: old?.filename }));
  }
  useEffect(() => {
    if (!api) return;
    const off = api.onLock(() => {
      epoch.current++;
      setVault(null);
      setMode("open");
      setImportHelp(false);
      setSecret("");
      setConfirm("");
      setDraft(null);
      setVisible("");
      setRecovery("");
      setPreview(null);
      setSettings(false);
      setOldSecret("");
      setNewSecret("");
      setNewConfirm("");
      setDeleteId(null);
      setSelected(null);
      setSearch("");
      setReuseGroup(null);
      setNotice("Kasa kilitlendi.");
    });
    let last = 0;
    const activity = () => {
      if (Date.now() - last > 1000) {
        last = Date.now();
        api.activity();
      }
    };
    for (const e of ["pointerdown", "keydown", "wheel"])
      window.addEventListener(e, activity);
    return () => {
      off();
      for (const e of ["pointerdown", "keydown", "wheel"])
        window.removeEventListener(e, activity);
    };
  }, [api]);
  useEffect(() => {
    setVisible("");
  }, [selected]);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(""), 20000);
    return () => clearTimeout(timer);
  }, [visible]);
  useEffect(() => {
    if (!showDraft) return;
    const timer = setTimeout(() => setShowDraft(false), 20000);
    return () => clearTimeout(timer);
  }, [showDraft, draft?.password]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => setPage(0), [search, tab, category, sort, reuseGroup]);
  const entries = vault?.entries || [];
  const risks = entries.filter((e) => e.reused > 1 || e.weak).length;
  const filtered = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            (tab !== "risk" || e.reused > 1 || e.weak) &&
            (tab !== "favorites" || e.favorite) &&
            (!category || e.category === category) &&
            (!reuseGroup || e.reuseGroup === reuseGroup) &&
            [e.name, e.username, e.url, e.notes].some((s) =>
              s
                .toLocaleLowerCase("tr")
                .includes(search.toLocaleLowerCase("tr")),
            ),
        )
        .sort((a, b) =>
          sort === "updated"
            ? b.updatedAt.localeCompare(a.updatedAt)
            : a.name.localeCompare(b.name, "tr"),
        ),
    [entries, tab, category, reuseGroup, search, sort],
  );
  useEffect(() => {
    setPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(filtered.length / 50) - 1)),
    );
  }, [filtered.length]);
  const chosen = entries.find((e) => e.id === selected);
  async function login(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (mode === "create" && secret !== confirm)
        throw new Error("Ana parolalar eşleşmiyor.");
      const result = await guarded(
        mode === "create"
          ? api.create({ password: secret })
          : api.unlock({
              secret,
              mode: mode === "recover" ? "recovery" : "password",
            }),
      );
      if (result) {
        const { recovery: recoveryValue, ...opened } = result;
        setVault(opened);
        setSecret("");
        setConfirm("");
        setTab("all");
        if (recoveryValue) {
          setRecovery(recoveryValue);
          setRecoverySaved(false);
        }
        if (mode === "recover") {
          setSettings(true);
          setResetWithRecovery(true);
          setNotice(
            "Kurtarma ile açıldı. Ayarlardan yeni ana parola belirleyin.",
          );
        }
      }
    });
  }
  const closeDraft = () => {
    if (!busy) {
      setDraft(null);
      setShowDraft(false);
    }
  };
  const closeSettings = () => {
    if (!busy) {
      setSettings(false);
      setOldSecret("");
      setNewSecret("");
      setNewConfirm("");
    }
  };
  if (!api)
    return (
      <main className="browser-message">
        <Shield size={48} />
        <h1>SecPass</h1>
        <p>Şifreli kasa yalnızca masaüstü uygulamasında çalışır.</p>
        <p>Uygulamayı DMG içinden açın. Bu web görünümüne parola girmeyin.</p>
      </main>
    );
  return (
    <>
      {!vault ? (
        <main className="welcome">
          <section className="intro">
            <div className="brand">
              <Shield /> SecPass <span>YEREL KASA</span>
            </div>
            <div>
              <span className="eyebrow">HESAPLARIN ÇOK. ANAHTARIN BİR.</span>
              <h1>
                Her hesabına
                <br />
                ayrı parola.
                <br />
                <em>Hepsi sende.</em>
              </h1>
              <p>
                Parolaların, yalnızca senin açabildiğin şifreli bir dosyada.
                Bulut hesabı veya internet bağlantısı gerekmez.
              </p>
              <div className="trust">
                <span>
                  <LockKeyhole size={16} /> AES-256-GCM
                </span>
                <span>
                  <Shield size={16} /> Cihazında şifreleme
                </span>
              </div>
            </div>
            <small>Bir kasa dosyası + bir ana parola. Kontrol sende.</small>
          </section>
          <section className="login-area">
            <form onSubmit={login} className="login-card">
              <div className="badge">
                <KeyRound size={26} />
              </div>
              <h2>
                {mode === "create"
                  ? "Kendi kasanı oluştur"
                  : mode === "recover"
                    ? "Kurtarma anahtarını kullan"
                    : "Kasana hoş geldin"}
              </h2>
              <p>
                {mode === "create"
                  ? "Hatırlayabileceğin, başka yerde kullanmadığın uzun bir ana parola seç."
                  : "Önce anahtarını gir; ardından açacağın kasa dosyasını seç."}
              </p>
              <label>
                {mode === "recover" ? "Kurtarma anahtarı" : "Ana parola"}
                <input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  minLength={mode === "create" ? 14 : 1}
                  maxLength={1024}
                  required
                  spellCheck={false}
                />
              </label>
              {mode === "create" && (
                <>
                  <label>
                    Ana parolayı doğrula
                    <input
                      type="password"
                      autoComplete="off"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </label>
                  <p className="hint">
                    En az 14 karakter. Birkaç rastgele kelimeyi
                    birleştirebilirsin. Ana parola veya kurtarma anahtarı
                    olmadan kasayı açamayız.
                  </p>
                </>
              )}
              <button className="primary full" disabled={busy}>
                <FolderOpen size={18} />
                {busy
                  ? "İşleniyor…"
                  : mode === "create"
                    ? "Kasa dosyasını oluştur"
                    : "Kasa dosyasını seç ve aç"}
              </button>
              <div className="login-links">
                {mode !== "open" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("open");
                      setSecret("");
                      setConfirm("");
                    }}
                  >
                    Mevcut kasayı aç
                  </button>
                )}
                {mode !== "create" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("create");
                      setSecret("");
                    }}
                  >
                    Yeni kasa oluştur
                  </button>
                )}
                {mode !== "recover" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("recover");
                      setSecret("");
                    }}
                  >
                    Kurtarma anahtarıyla aç
                  </button>
                )}
              </div>
              <div className="local-note">
                <Shield size={16} /> Anahtarın hiçbir sunucuya gönderilmez.
              </div>
            </form>
          </section>
        </main>
      ) : (
        <div className="shell">
          <aside>
            <div className="brand">
              <Shield /> SecPass
            </div>
            <span className="eyebrow">KİŞİSEL ALANIN</span>
            <nav>
              {[
                ["all", "Tüm kayıtlar", KeyRound, entries.length],
                ["risk", "Güvenlik kontrolü", Shield, risks],
                [
                  "favorites",
                  "Favoriler",
                  Star,
                  entries.filter((e) => e.favorite).length,
                ],
              ].map(([key, label, Icon, count]) => {
                const I = Icon as typeof Shield;
                return (
                  <button
                    key={String(key)}
                    className={tab === key ? "active" : ""}
                    onClick={() => {
                      setTab(String(key));
                      setReuseGroup(null);
                    }}
                  >
                    <I size={19} />
                    {String(label)}
                    <span
                      className={
                        key === "risk" && Number(count) > 0 ? "risk-count" : ""
                      }
                    >
                      {String(count)}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-tools">
              <span className="eyebrow">KASA ARAÇLARI</span>
              <button disabled={busy} onClick={() => setImportHelp(true)}>
                <Upload size={18} />
                Google’dan içe aktar
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (await guarded(api.backup()))
                      setNotice(
                        "Şifreli yedek kaydedildi. Ayrı bir diskte saklayabilirsin.",
                      );
                  })
                }
              >
                <Download size={18} />
                Şifreli yedek al
              </button>
              <button
                onClick={() => {
                  setSettings(true);
                  setResetWithRecovery(false);
                }}
              >
                <Settings size={18} />
                Kasa ayarları
              </button>
            </div>
            <div className="sidebar-bottom">
              <div className="vault-status">
                <span className="dot" />
                <div>
                  Şifreli kasa açık
                  <small title={vault.filename}>{vault.filename}</small>
                </div>
              </div>
              <button onClick={() => api.lock()}>
                <LogOut size={18} />
                Kilitle <kbd>⌘ L</kbd>
              </button>
            </div>
          </aside>
          <main className="workspace">
            <header>
              <div>
                <span className="eyebrow">SANA ÖZEL. CİHAZINDA.</span>
                <h1>
                  {tab === "risk"
                    ? "Güvenlik kontrolü"
                    : tab === "favorites"
                      ? "Favorilerin"
                      : "Parola kasan"}
                </h1>
                <p>
                  {tab === "risk"
                    ? "Tekrar kullanılan ve temel güç kontrolüne takılan parolalarını gözden geçir."
                    : "Hesaplarını düzenle, parolalarını kolayca bul."}
                </p>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setDraft({ ...empty });
                  setShowDraft(false);
                }}
              >
                <Plus size={18} />
                Yeni kayıt
              </button>
            </header>
            <div className="stats">
              <div>
                <span>TOPLAM KAYIT</span>
                <strong>{entries.length}</strong>
                <small>Kasanda şifrelenerek saklanıyor</small>
              </div>
              <div
                className={
                  entries.some((e) => e.reused > 1) ? "danger-stat" : ""
                }
              >
                <span>TEKRAR KULLANILAN</span>
                <strong>
                  {entries.filter((e) => e.reused > 1).length}
                  <small> hesap</small>
                </strong>
                <small>Aynı parolayı paylaşan kayıtlar</small>
              </div>
              <div>
                <span>KASA KORUMASI</span>
                <strong className="protection">
                  <Shield size={24} /> Yerel & şifreli
                </strong>
                <small>
                  {vault.settings.lockMinutes} dk hareketsizlikte kilitlenir
                </small>
              </div>
            </div>
            {tab === "risk" && (
              <div className="info-box">
                Tekrar kullanım, doğrulanmış bir sızıntı demek değildir. Bir
                sitenin parolası sızarsa aynı parolanın kullanıldığı hesaplar da
                risk altındadır. Bu kontrol cihazında yapılır; çevrimiçi sızıntı
                taraması yapılmaz.
              </div>
            )}
            <div className="toolbar">
              <div className="search">
                <Search size={18} />
                <input
                  aria-label="Kayıtlarda ara"
                  placeholder="Site, kullanıcı adı veya not ara…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label="Kategori"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Tüm kategoriler</option>
                {[...new Set(entries.map((e) => e.category))]
                  .sort()
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
              <select
                aria-label="Sıralama"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Ada göre</option>
                <option value="updated">Son güncellenen</option>
              </select>
            </div>
            {reuseGroup && (
              <button
                className="filter-chip"
                onClick={() => setReuseGroup(null)}
              >
                Aynı parolayı kullanan hesaplar <X size={14} />
              </button>
            )}
            <div className="content-grid">
              <section className="records">
                <div className="section-title">
                  KAYITLAR <span>{filtered.length}</span>
                </div>
                {filtered.length === 0 ? (
                  <div className="empty">
                    <KeyRound size={38} />
                    <h3>
                      {entries.length
                        ? "Bu görünümde kayıt yok"
                        : "İlk adımı atalım"}
                    </h3>
                    <p>
                      {entries.length
                        ? "Aramayı veya filtreleri değiştir."
                        : "Google CSV dosyanı içe aktar ya da ilk hesabını ekle."}
                    </p>
                  </div>
                ) : (
                  filtered.slice(page * 50, page * 50 + 50).map((e) => (
                    <button
                      key={e.id}
                      className={`record ${selected === e.id ? "selected" : ""}`}
                      onClick={() => setSelected(e.id)}
                    >
                      <span className="site-icon">
                        {e.name.slice(0, 2).toLocaleUpperCase("tr")}
                      </span>
                      <span className="record-text">
                        <strong>
                          {e.name}{" "}
                          {e.favorite && <Star size={12} fill="currentColor" />}
                        </strong>
                        <small>
                          {e.username || "Kullanıcı adı eklenmemiş"}
                        </small>
                      </span>
                      <span className="record-end">
                        {e.reused > 1 ? (
                          <span className="risk-label">Tekrarlanan</span>
                        ) : e.weak ? (
                          <span className="weak-label">Gözden geçir</span>
                        ) : (
                          <span className="neutral-label">Kayıtlı</span>
                        )}
                        <small>{e.category}</small>
                      </span>
                    </button>
                  ))
                )}
                {filtered.length > 50 && (
                  <div className="pagination">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Önceki
                    </button>
                    <span>
                      {page + 1} / {Math.ceil(filtered.length / 50)}
                    </span>
                    <button
                      disabled={(page + 1) * 50 >= filtered.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sonraki
                    </button>
                  </div>
                )}
              </section>
              <section className="detail">
                {chosen ? (
                  <>
                    <div className="detail-heading">
                      <span className="site-icon large">
                        {chosen.name.slice(0, 2).toLocaleUpperCase("tr")}
                      </span>
                      <div>
                        <h2>{chosen.name}</h2>
                        <span className="muted">{chosen.category}</span>
                      </div>
                      <button
                        className="icon"
                        title="Favoriyi değiştir"
                        aria-label="Favoriyi değiştir"
                        disabled={busy}
                        onClick={() =>
                          run(async () =>
                            update(
                              await guarded(
                                api.save({
                                  ...chosen,
                                  password: null,
                                  favorite: !chosen.favorite,
                                }),
                              ),
                            ),
                          )
                        }
                      >
                        <Star
                          size={19}
                          fill={chosen.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    {chosen.reused > 1 && (
                      <div className="risk-box">
                        <AlertTriangle size={20} />
                        <div>
                          <strong>
                            Bu parola {chosen.reused} hesapta kullanılıyor.
                          </strong>
                          <p>
                            Bir hesap etkilenirse diğerleri de risk altında
                            olabilir.
                          </p>
                          <button
                            onClick={() => {
                              setReuseGroup(chosen.reuseGroup || null);
                              setTab("all");
                              setCategory("");
                              setSearch("");
                            }}
                          >
                            Bu hesapları göster →
                          </button>
                        </div>
                      </div>
                    )}
                    {chosen.weak && (
                      <div className="warning-box">
                        Parola kısa veya yaygın bir örüntü içeriyor. Daha uzun,
                        benzersiz bir parola oluştur.
                      </div>
                    )}
                    <div className="detail-field">
                      <label>KULLANICI ADI</label>
                      <div>
                        <span>{chosen.username || "—"}</span>
                        <button
                          className="icon"
                          aria-label="Kullanıcı adını kopyala"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await guarded(
                                api.copy({ id: chosen.id, field: "username" }),
                              );
                              setNotice(
                                "Kopyalandı. Pano 30 saniye sonra temizlenecek.",
                              );
                            })
                          }
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="detail-field">
                      <label>PAROLA</label>
                      <div>
                        <span className="secret">
                          {visible || "••••••••••••••••"}
                        </span>
                        <button
                          className="icon"
                          aria-label={
                            visible ? "Parolayı gizle" : "Parolayı göster"
                          }
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const value = visible
                                ? ""
                                : await guarded(api.reveal({ id: chosen.id }));
                              if (selectedRef.current === chosen.id)
                                setVisible(value);
                            })
                          }
                        >
                          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                        <button
                          className="icon"
                          aria-label="Parolayı kopyala"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await guarded(
                                api.copy({ id: chosen.id, field: "password" }),
                              );
                              setNotice(
                                "Parola kopyalandı. Pano 30 saniye sonra temizlenecek.",
                              );
                            })
                          }
                        >
                          <Copy size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="detail-field">
                      <label>SİTE ADRESİ</label>
                      <p className="url">{chosen.url || "Henüz eklenmedi"}</p>
                    </div>
                    <div className="site-buttons">
                      <button
                        disabled={busy || !chosen.url}
                        onClick={() =>
                          run(async () => {
                            await guarded(
                              api.openSite({ id: chosen.id, change: false }),
                            );
                          })
                        }
                      >
                        <ExternalLink size={15} />
                        Siteye git
                      </button>
                      <button
                        disabled={busy || !(chosen.url || chosen.changeUrl)}
                        onClick={() =>
                          run(async () => {
                            await guarded(
                              api.openSite({ id: chosen.id, change: true }),
                            );
                          })
                        }
                      >
                        <RefreshCw size={15} />
                        Parolayı değiştir
                      </button>
                    </div>
                    <p className="hint">
                      Değişikliği sitenin kendi ekranında yap, ardından bu kaydı
                      güncelle. Kasayı düzenlemek sitedeki parolayı değiştirmez.
                    </p>
                    {chosen.notes && (
                      <div className="notes">
                        <label>NOTLAR</label>
                        <p>{chosen.notes}</p>
                      </div>
                    )}
                    <div className="timestamps">
                      <span>Oluşturuldu {date(chosen.createdAt)}</span>
                      <span>
                        Parola kaydedildi {date(chosen.passwordChangedAt)}
                      </span>
                    </div>
                    <div className="detail-actions">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setDraft({ ...chosen, password: null });
                          setShowDraft(false);
                          setVisible("");
                        }}
                      >
                        <Pencil size={16} />
                        Kaydı düzenle
                      </button>
                      <button
                        className="danger icon"
                        aria-label="Kaydı sil"
                        onClick={() => setDeleteId(chosen.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty detail-empty">
                    <Shield size={46} />
                    <h3>Hesapların elinin altında.</h3>
                    <p>
                      Bilgilerini görmek ve düzenlemek için listeden bir kayıt
                      seç.
                    </p>
                    <span className="local-note">
                      Parolalar listede gösterilmez.
                    </span>
                  </div>
                )}
              </section>
            </div>
            <footer>
              <LockKeyhole size={13} /> İnternete veri gönderilmez. Kasa dosyanı
              düzenli olarak ayrı bir konuma yedekle.
            </footer>
          </main>
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Uyarıyı kapat">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {draft && (
        <Modal
          title={draft.id ? "Kaydı düzenle" : "Yeni hesap kaydı"}
          close={closeDraft}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await guarded(api.save(draft));
                update(result);
                setDraft(null);
                setVisible("");
                setNotice("Kayıt şifrelenerek kaydedildi.");
              });
            }}
          >
            <div className="form-grid">
              <label>
                Kayıt adı
                <input
                  required
                  maxLength={256}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Örn. Google hesabım"
                />
              </label>
              <label>
                Kategori
                <input
                  list="categories"
                  maxLength={80}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                />
                <datalist id="categories">
                  {[
                    "Kişisel",
                    "İş",
                    "Finans",
                    "Sosyal",
                    "Alışveriş",
                    "Eğitim",
                    "Diğer",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Site adresi
                <input
                  value={draft.url}
                  maxLength={2048}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label>
                Kullanıcı adı / e-posta
                <input
                  autoComplete="off"
                  value={draft.username}
                  maxLength={1024}
                  onChange={(e) =>
                    setDraft({ ...draft, username: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Parola{" "}
              <div className="password-input">
                <input
                  autoComplete="off"
                  type={showDraft ? "text" : "password"}
                  value={draft.password ?? ""}
                  placeholder={
                    draft.id
                      ? "Boş bırak: mevcut parola korunsun"
                      : "Mevcut parolanı gir veya yeni üret"
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      password: e.target.value || (draft.id ? null : ""),
                    })
                  }
                  maxLength={4096}
                  required={!draft.id}
                />
                <button
                  type="button"
                  className="icon"
                  aria-label="Parola görünürlüğü"
                  onClick={() => setShowDraft(!showDraft)}
                >
                  {showDraft ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div className="generator">
              <label>
                Uzunluk
                <input
                  type="number"
                  min={12}
                  max={128}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={symbols}
                  onChange={(e) => setSymbols(e.target.checked)}
                />
                Sembol kullan
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const password = await guarded(
                      api.generate({ length, symbols }),
                    );
                    setDraft({ ...draft, password });
                    setShowDraft(true);
                  })
                }
              >
                <RefreshCw size={16} />
                Parola üret
              </button>
            </div>
            <p className="hint">
              Üretilen parola büyük/küçük harf ve rakam içerir. Sitedeki
              değişikliği tamamladıktan sonra kaydet.
            </p>
            <label>
              Parola değiştirme adresi (isteğe bağlı)
              <input
                value={draft.changeUrl}
                maxLength={2048}
                onChange={(e) =>
                  setDraft({ ...draft, changeUrl: e.target.value })
                }
                placeholder="Sitenin hesap / güvenlik ayarları sayfası"
              />
            </label>
            <label>
              Notlar
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.favorite}
                onChange={(e) =>
                  setDraft({ ...draft, favorite: e.target.checked })
                }
              />
              Favorilere ekle
            </label>
            <div className="modal-actions">
              <button type="button" onClick={closeDraft} disabled={busy}>
                Vazgeç
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Kaydediliyor…" : "Şifreleyerek kaydet"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {recovery && (
        <Modal
          title="Kurtarma anahtarını sakla"
          close={() => {
            if (recoverySaved) setRecovery("");
          }}
        >
          <div className="warning-box">
            Bu anahtar kasanı ana parola olmadan açabilir. Kağıda yazıp güvenli
            bir yerde, kasa dosyasından ayrı sakla. Kaybedilen anahtar sunucudan
            geri alınamaz.
          </div>
          <code className="recovery">{recovery}</code>
          <p>
            Parola değiştirildiğinde yeni anahtar üretilir. Eski yedekler,
            oluşturuldukları zamanki parola ve kurtarma anahtarıyla açılır.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={recoverySaved}
              onChange={(e) => setRecoverySaved(e.target.checked)}
            />
            Anahtarımı güvenli ve ayrı bir yere kaydettim.
          </label>
          <button
            className="primary full"
            disabled={!recoverySaved}
            onClick={() => setRecovery("")}
          >
            Kasaya devam et
          </button>
        </Modal>
      )}
      {importHelp && (
        <Modal
          title="Google’dan güvenli aktarım"
          close={() => {
            if (!busy) setImportHelp(false);
          }}
        >
          <p>
            Chrome’da Google Şifre Yöneticisi → Ayarlar → Şifreleri dışa aktar
            yolunu kullanarak CSV dosyanı indir. Google / macOS kimlik
            doğrulamasını kendin tamamla.
          </p>
          <div className="warning-box">
            CSV şifrelenmemiştir. Dosyayı sohbete yükleme veya paylaşma.
            Mümkünse iCloud ile eşitlenmeyen yerel bir klasöre kaydet.
          </div>
          <p>
            Sonraki ekranda eklenecek kayıt sayısını göreceksin. Birebir
            tekrarlar atlanır; farklı parolalı kayıtlar korunur. Geçiş
            anahtarları (passkey), bu CSV akışıyla aktarılmaz.
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await guarded(api.previewImport());
                if (result) {
                  setImportHelp(false);
                  setPreview(result);
                }
              })
            }
          >
            CSV dosyasını seç
          </button>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Google kayıtlarını içe aktar"
          close={() => {
            if (!busy) {
              setPreview(null);
              api.cancelImport();
            }
          }}
        >
          <p>
            Dosya yerel olarak okundu. İçe aktarma mevcut kayıtlarını
            değiştirmez.
          </p>
          <div className="import-count">
            <strong>{preview.count}</strong> yeni kayıt eklenecek
          </div>
          <ul>
            <li>{preview.duplicates} birebir tekrar atlandı.</li>
            <li>{preview.invalid} geçersiz kayıt atlandı.</li>
            <li>
              {preview.omittedURLs} desteklenmeyen adres, bağlantı yerine nota
              alındı.
            </li>
          </ul>
          <div className="warning-box">
            CSV şifresizdir. Aktarımdan sonra kayıtlarını kontrol et; CSV’yi
            İndirilenler, Çöp Sepeti ve varsa bulut kopyalarından kaldır. SSD
            üzerinde güvenli silme garanti edilemez.
          </div>
          <div className="modal-actions">
            <button
              disabled={busy}
              onClick={() => {
                setPreview(null);
                api.cancelImport();
              }}
            >
              Vazgeç
            </button>
            <button
              className="primary"
              disabled={busy || !preview.count}
              onClick={() =>
                run(async () => {
                  update(await guarded(api.confirmImport()));
                  setPreview(null);
                  setNotice(
                    "Kayıtlar şifreli kasaya aktarıldı. CSV dosyasını kaldırmayı unutma.",
                  );
                })
              }
            >
              Şifreleyerek içe aktar
            </button>
          </div>
        </Modal>
      )}
      {deleteId && (
        <Modal title="Kayıt silinsin mi?" close={() => setDeleteId(null)}>
          <p>
            Bu kayıt aktif kasadan silinecek. İşlem eski şifreli yedeklerini
            değiştirmez.
          </p>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setDeleteId(null)}>
              Vazgeç
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  update(await guarded(api.remove({ id: deleteId })));
                  setDeleteId(null);
                  setSelected(null);
                })
              }
            >
              Kaydı sil
            </button>
          </div>
        </Modal>
      )}
      {settings && vault && !recovery && (
        <Modal title="Kasa ayarları" close={closeSettings}>
          <label>
            Hareketsizlikte otomatik kilit
            <select
              value={vault.settings.lockMinutes}
              disabled={busy}
              onChange={(e) =>
                run(async () =>
                  update(
                    await guarded(
                      api.settings({ lockMinutes: Number(e.target.value) }),
                    ),
                  ),
                )
              }
            >
              {[1, 2, 5, 10, 15].map((m) => (
                <option value={m} key={m}>
                  {m} dakika
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            Ekran kilitlendiğinde, Mac uyuduğunda veya uygulama küçültüldüğünde
            kasa hemen kilitlenir. Görünür parola 20 saniyede gizlenir; pano 30
            saniyede temizlenir.
          </p>
          <hr />
          <h3>Ana parolayı değiştir</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (newSecret !== newConfirm)
                  throw new Error("Yeni parolalar eşleşmiyor.");
                const result = await guarded(
                  resetWithRecovery
                    ? api.recoverMaster({
                        recovery: oldSecret,
                        password: newSecret,
                      })
                    : api.changeMaster({
                        currentPassword: oldSecret,
                        password: newSecret,
                      }),
                );
                setRecovery(result.recovery);
                setRecoverySaved(false);
                closeSettings();
                setOldSecret("");
                setNewSecret("");
                setNewConfirm("");
                setSettings(false);
              });
            }}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={resetWithRecovery}
                onChange={(e) => {
                  setResetWithRecovery(e.target.checked);
                  setOldSecret("");
                }}
              />
              Kurtarma anahtarıyla değiştir
            </label>
            <label>
              {resetWithRecovery ? "Kurtarma anahtarı" : "Mevcut ana parola"}
              <input
                type="password"
                autoComplete="off"
                value={oldSecret}
                onChange={(e) => setOldSecret(e.target.value)}
                required
              />
            </label>
            <label>
              Yeni ana parola
              <input
                type="password"
                autoComplete="off"
                minLength={14}
                maxLength={1024}
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                required
              />
            </label>
            <label>
              Yeni ana parolayı doğrula
              <input
                type="password"
                autoComplete="off"
                value={newConfirm}
                onChange={(e) => setNewConfirm(e.target.value)}
                required
              />
            </label>
            <p className="hint">
              Yeni şifreleme anahtarı ve kurtarma anahtarı oluşturulur. Eski
              yedekler eski parolayla açılmaya devam eder; yeni yedek al.
            </p>
            <button className="primary" disabled={busy}>
              Ana parolayı değiştir
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
