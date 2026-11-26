import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let secPassVault = UTType(exportedAs: "io.github.uksam38.secpass.vault", conformingTo: .data)
}

struct VaultDocument: FileDocument {
    static var readableContentTypes: [UTType] = [.secPassVault, .data]
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct ContentView: View {
    @EnvironmentObject private var model: VaultViewModel
    @State private var showingImporter = false
    @State private var showingCSVImporter = false
    @State private var showingExporter = false
    @State private var exportDocument = VaultDocument(data: Data())
    @State private var showingNewEntry = false
    @State private var showingSecurity = false
    @State private var pendingImport: URL?
    @State private var confirmingImport = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch model.state {
                case .noVault: WelcomeView(create: true)
                case .locked: WelcomeView(create: false)
                case .unlocked: vaultView
                }
            }
            if let notice = model.notice {
                Text(notice)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: model.notice)
        .tint(Color(red: 0.18, green: 0.65, blue: 0.55))
        .preferredColorScheme(.dark)
        .onOpenURL { url in
            if url.pathExtension.lowercased() == "spvault" {
                pendingImport = url
                confirmingImport = true
            }
        }
        .alert("SecPass", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Tamam") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .sheet(isPresented: Binding(
            get: { model.recoveryKey != nil },
            set: { if !$0 { model.recoveryKey = nil } }
        )) {
            if let key = model.recoveryKey { RecoveryKeyView(key: key) { model.recoveryKey = nil } }
        }
        .sheet(isPresented: Binding(
            get: { model.csvPreview != nil },
            set: { if !$0 { model.cancelCSVImport() } }
        )) {
            if let preview = model.csvPreview { CSVPreviewSheet(preview: preview) }
        }
        .sheet(isPresented: $showingSecurity) { SecuritySettingsView() }
        .confirmationDialog("Mevcut kasa değiştirilsin mi?", isPresented: $confirmingImport, titleVisibility: .visible) {
            Button("Şifreli geri dönüş kopyası oluştur ve içe aktar", role: .destructive) {
                if let pendingImport { model.importVault(pendingImport) }
                pendingImport = nil
            }
            Button("Vazgeç", role: .cancel) { pendingImport = nil }
        } message: {
            Text("Mevcut kasanın şifreli kopyası cihazda saklanacak. İçe aktarılan kasa doğrulanamazsa geri dönebilirsiniz.")
        }
        .simultaneousGesture(TapGesture().onEnded { model.touch() })
    }

    private var vaultView: some View {
        NavigationSplitView {
            List(selection: Binding(get: { model.selected?.id }, set: { id in model.selected = model.entries.first { $0.id == id } })) {
                Section {
                    Toggle("Yalnızca riskler", isOn: $model.risksOnly)
                }
                ForEach(model.filteredEntries) { entry in
                    EntryRow(entry: entry, reused: (model.reuseCounts[entry.password] ?? 0) > 1)
                        .tag(entry.id)
                }
            }
            .searchable(text: $model.search, prompt: "Site, kullanıcı adı veya not")
            .navigationTitle("Parola kasan")
            .toolbar { toolbar }
        } detail: {
            if let entry = model.selected {
                EntryDetail(entry: entry)
            } else {
                ContentUnavailableView("Bir kayıt seç", systemImage: "lock.shield", description: Text("Parolalar listede gösterilmez."))
            }
        }
        .sheet(isPresented: $showingNewEntry) { EntryEditor() }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.secPassVault, .data]) { result in
            if case .success(let url) = result {
                pendingImport = url
                confirmingImport = true
            }
        }
        .fileImporter(isPresented: $showingCSVImporter, allowedContentTypes: [.commaSeparatedText, .plainText]) { result in
            if case .success(let url) = result {
                model.previewCSVImport(url)
            }
        }
        .fileExporter(isPresented: $showingExporter, document: exportDocument,
                      contentType: .secPassVault, defaultFilename: "SecPass-yedek.spvault") { result in
            if case .success = result { model.showNotice("Şifreli yedek dışa aktarıldı.") }
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup {
            Button { showingNewEntry = true } label: { Label("Yeni kayıt", systemImage: "plus") }
            Menu {
                Button("Google CSV içe aktar", systemImage: "tablecells") { showingCSVImporter = true }
                Button("Şifreli kasa içe aktar (.spvault)", systemImage: "square.and.arrow.down") { showingImporter = true }
                Button("Şifreli yedek dışa aktar", systemImage: "square.and.arrow.up") {
                    if let data = model.exportData() { exportDocument = VaultDocument(data: data); showingExporter = true }
                }
                Divider()
                if model.hasBiometricKey {
                    Button("Face ID / Touch ID'yi kapat", role: .destructive) { model.disableBiometrics() }
                } else {
                    Button("Face ID / Touch ID'yi aç", systemImage: "faceid") { model.enableBiometrics() }
                }
                Button("Güvenlik ve kasa ayarları", systemImage: "lock.rotation") { showingSecurity = true }
                Button("Kasayı kilitle", systemImage: "lock") { model.lock() }
            } label: { Image(systemName: "ellipsis.circle") }
        }
    }
}

private struct WelcomeView: View {
    @EnvironmentObject private var model: VaultViewModel
    let create: Bool
    @State private var secret = ""
    @State private var confirmation = ""
    @State private var recovery = false
    @State private var importer = false
    @State private var pendingImport: URL?
    @State private var confirmingImport = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Her hesabına ayrı parola. Hepsi sende.", systemImage: "lock.shield")
                        .font(.title2.bold())
                    Text("Kasan cihazında AES-256-GCM ile şifrelenir; hiçbir sunucuya veri gönderilmez.")
                        .foregroundStyle(.secondary)
                }
                Section(create ? "Yeni kasa (en az 14 karakter)" : recovery ? "Kurtarma anahtarı" : "Ana parola") {
                    SecureField(recovery ? "Kurtarma anahtarı" : "Ana parola", text: $secret)
                        .textContentType(.password)
                    if create {
                        SecureField("Ana parolayı doğrula", text: $confirmation)
                            .textContentType(.newPassword)
                    }
                    Button(create ? "Kasayı oluştur" : "Kasayı aç") {
                        let submittedSecret = secret
                        let submittedConfirm = confirmation
                        secret = ""
                        confirmation = ""
                        Task {
                            if create {
                                await model.create(master: submittedSecret, confirmation: submittedConfirm)
                            } else {
                                await model.unlock(secret: submittedSecret, recovery: recovery)
                            }
                        }
                    }.disabled(secret.isEmpty || (create && confirmation.isEmpty))
                    if !create, model.hasBiometricKey {
                        Button("Face ID / Touch ID ile aç") { Task { await model.unlockWithBiometrics() } }
                    }
                }
                if !create {
                    Section {
                        Toggle("Kurtarma anahtarı kullan", isOn: $recovery)
                            .onChange(of: recovery) { _, _ in secret = "" }
                        Button("Başka `.spvault` dosyası seç") { importer = true }
                    }
                } else {
                    Section {
                        Button("Mevcut `.spvault` kasasını içe aktar") { importer = true }
                    }
                }
                Section {
                    Text("Ana parola ve kurtarma anahtarı birlikte kaybolursa kasa geri açılamaz.")
                        .font(.footnote)
                }
            }
            .navigationTitle("SecPass")
            .fileImporter(isPresented: $importer, allowedContentTypes: [.secPassVault, .data]) { result in
                if case .success(let url) = result {
                    if SharedVaultStore.exists() {
                        pendingImport = url; confirmingImport = true
                    } else {
                        model.importVault(url)
                    }
                }
            }
            .confirmationDialog("Mevcut kasa değiştirilsin mi?", isPresented: $confirmingImport, titleVisibility: .visible) {
                Button("Geri dönüş kopyası oluştur ve içe aktar", role: .destructive) {
                    if let pendingImport { model.importVault(pendingImport) }
                    pendingImport = nil
                }
                Button("Vazgeç", role: .cancel) { pendingImport = nil }
            } message: { Text("Mevcut kasa şifreli olarak yedeklendikten sonra seçilen dosya etkinleştirilir.") }
        }
    }
}

private struct EntryRow: View {
    let entry: VaultEntry
    let reused: Bool
    var body: some View {
        HStack {
            Image(systemName: entry.favorite ? "star.fill" : "key.fill").foregroundStyle(entry.favorite ? .yellow : .mint)
            VStack(alignment: .leading) {
                Text(entry.name).font(.headline)
                Text(entry.username.isEmpty ? "Kullanıcı adı eklenmemiş" : entry.username)
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if reused {
                Label("Tekrar", systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.red)
            } else if PasswordTools.isWeak(entry.password) {
                Text("Zayıf").font(.caption).foregroundStyle(.orange)
            }
        }
    }
}

private struct EntryDetail: View {
    @EnvironmentObject private var model: VaultViewModel
    @Environment(\.openURL) private var openURL
    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var pendingOpenURL: URL?
    let entry: VaultEntry

    var body: some View {
        Form {
            Section("Hesap") {
                LabeledContent("Site", value: entry.name)
                LabeledContent("Kategori", value: entry.category)
                HStack {
                    LabeledContent("Kullanıcı", value: entry.username.isEmpty ? "—" : entry.username)
                    if !entry.username.isEmpty {
                        Button {
                            copyToPasteboard(entry.username)
                            model.showNotice("Kullanıcı adı kopyalandı (30 sn sonra temizlenir).")
                        } label: {
                            Image(systemName: "doc.on.doc")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Kullanıcı adını kopyala")
                    }
                }
            }
            if (model.reuseCounts[entry.password] ?? 0) > 1 {
                Section {
                    Label("Bu parola \(model.reuseCounts[entry.password] ?? 0) hesapta kullanılıyor.", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            } else if PasswordTools.isWeak(entry.password) {
                Section {
                    Label("Parola kısa veya yaygın bir örüntü içeriyor.", systemImage: "exclamationmark.circle")
                        .foregroundStyle(.orange)
                }
            }
            Section("Parola") {
                HStack {
                    Text(model.revealPassword ? entry.password : "••••••••••••")
                        .fontDesign(.monospaced)
                    Spacer()
                    Button {
                        model.togglePasswordReveal()
                    } label: {
                        Image(systemName: model.revealPassword ? "eye.slash" : "eye")
                    }
                    .accessibilityLabel(model.revealPassword ? "Parolayı gizle" : "Parolayı göster")
                }
                Button("Parolayı kopyala", systemImage: "doc.on.doc") {
                    copyToPasteboard(entry.password)
                    model.showNotice("Parola kopyalandı (30 sn sonra temizlenir).")
                }
            }
            if !entry.url.isEmpty || !entry.changeUrl.isEmpty {
                Section("Bağlantılar") {
                    if let safeSite = try? VaultValidation.url(entry.url), !safeSite.isEmpty, let siteURL = URL(string: safeSite) {
                        Button("Siteye git", systemImage: "safari") { pendingOpenURL = siteURL }
                    }
                    let changeTarget = entry.changeUrl.isEmpty ? entry.url : entry.changeUrl
                    if let safeChange = try? VaultValidation.url(changeTarget), !safeChange.isEmpty, let changeURL = URL(string: safeChange) {
                        Button("Parolayı değiştir", systemImage: "arrow.triangle.2.circlepath") { pendingOpenURL = changeURL }
                    }
                }
            }
            if !entry.notes.isEmpty {
                Section("Notlar") { Text(entry.notes) }
            }
            Section {
                Button("Düzenle", systemImage: "pencil") { editing = true }
                Button(role: .destructive) { confirmingDelete = true } label: { Label("Kaydı sil", systemImage: "trash") }
            }
        }
        .navigationTitle(entry.name)
        .sheet(isPresented: $editing) { EntryEditor(existing: entry) }
        .confirmationDialog("Tarayıcıda açılsın mı?", isPresented: Binding(
            get: { pendingOpenURL != nil },
            set: { if !$0 { pendingOpenURL = nil } }
        ), titleVisibility: .visible) {
            Button("Tarayıcıda aç") {
                if let url = pendingOpenURL { openURL(url) }
                pendingOpenURL = nil
            }
            Button("Vazgeç", role: .cancel) { pendingOpenURL = nil }
        } message: {
            Text(pendingOpenURL?.absoluteString ?? "")
        }
        .confirmationDialog("“\(entry.name)” silinsin mi?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Kaydı sil", role: .destructive) { Task { await model.delete(entry) } }
            Button("Vazgeç", role: .cancel) { }
        } message: { Text("Bu işlemden önce kasanın şifreli önceki sürümü cihazda tutulur.") }
        .onDisappear { model.setPasswordRevealed(false) }
    }

    private func copyToPasteboard(_ value: String) {
        UIPasteboard.general.setItems(
            [[UTType.utf8PlainText.identifier: value]],
            options: [.expirationDate: Date().addingTimeInterval(30), .localOnly: true]
        )
    }
}

private struct CSVPreviewSheet: View {
    @EnvironmentObject private var model: VaultViewModel
    let preview: CSVImportPreview

    var body: some View {
        NavigationStack {
            Form {
                Section("Google CSV özeti") {
                    LabeledContent("Eklenecek yeni kayıt", value: "\(preview.added.count)")
                    LabeledContent("Birebir tekrar (atlandı)", value: "\(preview.duplicates)")
                    LabeledContent("Geçersiz satır (atlandı)", value: "\(preview.invalid)")
                    LabeledContent("Nota alınan HTTPS dışı adres", value: "\(preview.omittedURLs)")
                }
                Section {
                    Text("CSV dosyası şifresizdir. Aktarım tamamlandıktan sonra CSV dosyasını Dosyalar uygulamasından ve Son Silinenler klasöründen silin.")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                Section {
                    Button("Şifreleyerek içe aktar") {
                        Task { await model.confirmCSVImport() }
                    }
                    .disabled(preview.added.isEmpty)
                    Button("Vazgeç", role: .cancel) { model.cancelCSVImport() }
                }
            }
            .navigationTitle("CSV İçe Aktar")
        }
    }
}

private struct SecuritySettingsView: View {
    @EnvironmentObject private var model: VaultViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var master = ""
    @State private var confirmation = ""
    @State private var confirmingRestore = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Otomatik kilit") {
                    Picker("Hareketsizlik süresi", selection: Binding(
                        get: { model.lockMinutes },
                        set: { minutes in Task { await model.changeLockMinutes(minutes) } }
                    )) {
                        ForEach([1, 2, 5, 10, 15], id: \.self) { m in
                            Text("\(m) dakika").tag(m)
                        }
                    }
                }
                Section {
                    SecureField("Yeni ana parola (en az 14 karakter)", text: $master).textContentType(.newPassword)
                    SecureField("Yeni ana parolayı doğrula", text: $confirmation).textContentType(.newPassword)
                    Button("Ana parolayı ve veri anahtarını yenile") {
                        Task {
                            await model.rotateCredentials(master: master, confirmation: confirmation)
                            if model.error == nil { master = ""; confirmation = ""; dismiss() }
                        }
                    }.disabled(master.isEmpty || confirmation.isEmpty)
                } header: {
                    Text("Ana parola ve kurtarma anahtarı")
                } footer: {
                    Text("Yeni 32 bayt veri anahtarı ve yeni kurtarma anahtarı oluşturulur; eski anahtarlar yeni dosyada geçersiz olur.")
                }
                Section {
                    Button("Önceki şifreli kasaya geri dön", role: .destructive) { confirmingRestore = true }
                        .disabled(!model.hasSafetyBackup)
                } footer: {
                    Text("Her başarılı yazmadan önce kasanın bir önceki şifreli sürümü yalnızca bu cihazda tutulur.")
                }
            }
            .navigationTitle("Güvenlik ve Ayarlar")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } } }
            .confirmationDialog("Önceki kasaya geri dönülsün mü?", isPresented: $confirmingRestore, titleVisibility: .visible) {
                Button("Geri dön", role: .destructive) { model.restoreSafetyBackup(); dismiss() }
                Button("Vazgeç", role: .cancel) { }
            } message: { Text("Mevcut kasa kapanacak ve biyometrik hızlı açılış sıfırlanacak.") }
        }
    }
}

private struct EntryEditor: View {
    @EnvironmentObject private var model: VaultViewModel
    @Environment(\.dismiss) private var dismiss
    private let isEditing: Bool
    @State private var entry: VaultEntry
    @State private var revealDraft = false
    @State private var generatorLength = 20
    @State private var includeSymbols = true

    init(existing: VaultEntry? = nil) {
        self.isEditing = existing != nil
        let now = ISO8601DateFormatter.securePass.string(from: Date())
        if var copy = existing {
            copy.password = ""
            _entry = State(initialValue: copy)
        } else {
            _entry = State(initialValue: VaultEntry(
                id: UUID().uuidString.lowercased(), name: "", url: "", changeUrl: "",
                username: "", password: "", category: "Diğer", notes: "",
                favorite: false, createdAt: now, updatedAt: now, passwordChangedAt: now
            ))
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Hesap") {
                    TextField("Kayıt adı", text: $entry.name)
                    TextField("https://example.com", text: $entry.url)
                        .textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Kullanıcı adı / e-posta", text: $entry.username)
                        .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Kategori", text: $entry.category)
                }
                Section("Parola") {
                    HStack {
                        Group {
                            if revealDraft {
                                TextField(isEditing ? "Boş bırak: mevcut parola korunsun" : "Parola", text: $entry.password)
                                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                            } else {
                                SecureField(isEditing ? "Boş bırak: mevcut parola korunsun" : "Parola", text: $entry.password)
                                    .textContentType(.newPassword)
                            }
                        }
                        Button { revealDraft.toggle() } label: {
                            Image(systemName: revealDraft ? "eye.slash" : "eye")
                        }
                    }
                    Stepper("Uzunluk: \(generatorLength) karakter", value: $generatorLength, in: 12...64)
                    Toggle("Sembol kullan", isOn: $includeSymbols)
                    Button("Güçlü parola üret", systemImage: "key.horizontal") {
                        entry.password = (try? PasswordTools.generate(length: generatorLength, includeSymbols: includeSymbols)) ?? ""
                        revealDraft = true
                    }
                }
                Section("İsteğe bağlı") {
                    TextField("Parola değiştirme HTTPS adresi", text: $entry.changeUrl)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Notlar", text: $entry.notes, axis: .vertical)
                    Toggle("Favori", isOn: $entry.favorite)
                }
            }
            .navigationTitle(isEditing ? "Kaydı düzenle" : "Yeni kayıt")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Vazgeç") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kaydet") {
                        Task {
                            await model.save(entry, keepExistingPassword: isEditing)
                            if model.error == nil { dismiss() }
                        }
                    }
                }
            }
        }
    }
}

private struct RecoveryKeyView: View {
    let key: String
    let close: () -> Void
    @State private var confirmed = false
    var body: some View {
        NavigationStack {
            Form {
                Section { Text("Bu anahtar kasayı ana parola olmadan açar. Kağıda yazıp kasa dosyasından ayrı saklayın.") }
                Section("Kurtarma anahtarı") { Text(key).fontDesign(.monospaced).textSelection(.enabled) }
                Toggle("Güvenli ve ayrı bir yere kaydettim", isOn: $confirmed)
                Button("Devam et") { close() }.disabled(!confirmed)
            }.navigationTitle("Kurtarma anahtarı")
        }.interactiveDismissDisabled(!confirmed)
    }
}
