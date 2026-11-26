import SwiftUI

@main
struct SecurePassApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = VaultViewModel()
    @State private var privacyShield = false

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView().environmentObject(model)
                if privacyShield {
                    Color.black.ignoresSafeArea()
                    Label("SecPass kilitli", systemImage: "lock.shield.fill")
                        .font(.title2.bold()).foregroundStyle(.white)
                }
            }
            .onChange(of: scenePhase) { _, phase in
                privacyShield = model.shouldShowShield(for: phase)
                if model.shouldLockVault(for: phase) { model.lock() }
            }
        }
    }
}
