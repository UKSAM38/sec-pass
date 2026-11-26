import AuthenticationServices
import UIKit

final class CredentialProviderViewController: ASCredentialProviderViewController, UITableViewDataSource, UITableViewDelegate {
    private let table = UITableView(frame: .zero, style: .insetGrouped)
    private let unlockContainer = UIView()
    private let statusLabel = UILabel()
    private let passwordField = UITextField()
    private let unlockButton = UIButton(type: .system)
    private var entries: [VaultEntry] = []
    private var activeServiceIdentifiers: [ASCredentialServiceIdentifier] = []
    private var requestedIdentity: ASPasswordCredentialIdentity?
    private var failedAttempts = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "SecPass"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Vazgeç", style: .plain, target: self, action: #selector(cancelTapped)
        )
        setupTable()
        setupUnlockView()
    }

    private func setupTable() {
        table.translatesAutoresizingMaskIntoConstraints = false
        table.dataSource = self
        table.delegate = self
        table.isHidden = true
        view.addSubview(table)
        NSLayoutConstraint.activate([
            table.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            table.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            table.topAnchor.constraint(equalTo: view.topAnchor),
            table.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupUnlockView() {
        unlockContainer.translatesAutoresizingMaskIntoConstraints = false
        unlockContainer.isHidden = true
        view.addSubview(unlockContainer)

        let titleLabel = UILabel()
        titleLabel.text = "SecPass AutoFill"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.textAlignment = .center

        statusLabel.text = "Kasanızı açmak için ana parolanızı girin."
        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center

        passwordField.placeholder = "Ana parola"
        passwordField.isSecureTextEntry = true
        passwordField.borderStyle = .roundedRect
        passwordField.autocapitalizationType = .none
        passwordField.autocorrectionType = .no

        var config = UIButton.Configuration.filled()
        config.title = "Kasayı aç"
        config.baseBackgroundColor = UIColor(red: 0.18, green: 0.65, blue: 0.55, alpha: 1.0)
        unlockButton.configuration = config
        unlockButton.addTarget(self, action: #selector(unlockWithMasterTapped), for: .touchUpInside)

        let cancelBtn = UIButton(type: .system)
        cancelBtn.setTitle("Vazgeç", for: .normal)
        cancelBtn.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, statusLabel, passwordField, unlockButton, cancelBtn])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        unlockContainer.addSubview(stack)

        NSLayoutConstraint.activate([
            unlockContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            unlockContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            unlockContainer.topAnchor.constraint(equalTo: view.topAnchor),
            unlockContainer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: unlockContainer.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: unlockContainer.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: unlockContainer.centerYAnchor, constant: -24)
        ])
    }

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        activeServiceIdentifiers = serviceIdentifiers
        attemptUnlockAndLoad()
    }

    override func prepareInterfaceToProvideCredential(for credentialRequest: any ASCredentialRequest) {
        guard let credentialIdentity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
            cancel(.credentialIdentityNotFound)
            return
        }
        requestedIdentity = credentialIdentity
        activeServiceIdentifiers = [credentialIdentity.serviceIdentifier]
        attemptUnlockAndLoad()
    }

    override func provideCredentialWithoutUserInteraction(for credentialRequest: any ASCredentialRequest) {
        cancel(.userInteractionRequired)
    }

    override func prepareInterfaceForExtensionConfiguration() {
        table.isHidden = true
        unlockContainer.isHidden = true
        let label = UILabel()
        label.text = "SecPass AutoFill etkin. Hızlı giriş için SecPass uygulamasından Face ID / Touch ID erişimini açabilir veya doğrudan ana parolanızı kullanabilirsiniz."
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        extensionContext.completeExtensionConfigurationRequest()
    }

    private func attemptUnlockAndLoad() {
        guard SharedVaultStore.exists() else {
            showMasterPrompt(message: "Henüz aktif bir kasa bulunamadı. Önce SecPass uygulamasında kasa oluşturun.")
            passwordField.isHidden = true
            unlockButton.isHidden = true
            return
        }
        if BiometricKeyStore.exists() {
            do {
                var key = try BiometricKeyStore.load(reason: "AutoFill için kasanızı açın")
                defer { key.resetBytes(in: 0..<key.count) }
                let session = try VaultCrypto.session(envelope: SharedVaultStore.read(), dataKey: key)
                presentEntries(from: session)
                return
            } catch {
                showMasterPrompt(message: "Ana parolanızı girerek AutoFill için kasanızı açın.")
                return
            }
        }
        showMasterPrompt(message: "Ana parolanızı girerek AutoFill için kasanızı açın.")
    }

    private func showMasterPrompt(message: String) {
        table.isHidden = true
        unlockContainer.isHidden = false
        statusLabel.text = message
        passwordField.text = ""
        passwordField.becomeFirstResponder()
    }

    @objc private func unlockWithMasterTapped() {
        let secret = passwordField.text ?? ""
        passwordField.text = ""
        guard !secret.isEmpty else { return }
        unlockButton.isEnabled = false
        statusLabel.text = "Kasa doğrulanıyor…"
        let attemptCount = failedAttempts

        Task { @MainActor in
            if attemptCount > 0 {
                let delaySeconds = min(8, 1 << min(attemptCount - 1, 3))
                try? await Task.sleep(for: .seconds(delaySeconds))
            }
            do {
                var session = try await VaultCrypto.unlock(SharedVaultStore.read(), secret: secret)
                self.failedAttempts = 0
                self.presentEntries(from: session)
                session.key.resetBytes(in: 0..<session.key.count)
            } catch {
                self.failedAttempts = min(self.failedAttempts + 1, 4)
                self.statusLabel.text = "Ana parola yanlış veya kasa açılamadı. Tekrar deneyin."
                self.unlockButton.isEnabled = true
            }
        }
    }

    private func presentEntries(from session: VaultSession) {
        let requested = Set(activeServiceIdentifiers.compactMap { identifier -> String? in
            if identifier.type == .domain { return identifier.identifier.lowercased() }
            return URL(string: identifier.identifier)?.host?.lowercased()
        })
        let matched = session.payload.entries.filter { entry in
            guard !requested.isEmpty else { return true }
            guard let host = entry.host else { return false }
            return requested.contains { host == $0 || host.hasSuffix("." + $0) || $0.hasSuffix("." + host) }
        }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        if let requestedIdentity,
           let exact = session.payload.entries.first(where: { $0.id == requestedIdentity.recordIdentifier }) {
            finish(with: exact)
            return
        }

        // Eşleşen alan adı yoksa tüm kasayı göster ki kullanıcı manuel seçebilsin.
        entries = matched.isEmpty ? session.payload.entries.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending } : matched
        if entries.isEmpty {
            cancel(.credentialIdentityNotFound)
            return
        }
        unlockContainer.isHidden = true
        table.isHidden = false
        table.reloadData()
    }

    @objc private func cancelTapped() {
        cancel(.userCanceled)
    }

    private func finish(with entry: VaultEntry) {
        extensionContext.completeRequest(
            withSelectedCredential: ASPasswordCredential(user: entry.username, password: entry.password),
            completionHandler: nil
        )
        entries.removeAll(keepingCapacity: false)
    }

    private func cancel(_ code: ASExtensionError.Code) {
        entries.removeAll(keepingCapacity: false)
        extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain, code: code.rawValue
        ))
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { entries.count }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "credential") ?? UITableViewCell(style: .subtitle, reuseIdentifier: "credential")
        let entry = entries[indexPath.row]
        cell.textLabel?.text = entry.name
        cell.detailTextLabel?.text = entry.username.isEmpty ? entry.url : entry.username
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) { finish(with: entries[indexPath.row]) }
}
