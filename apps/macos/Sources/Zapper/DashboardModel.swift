import Combine
import Foundation
import AppKit

enum PendingServiceAction {
    case starting
    case stopping
    case restarting

    init(action: ZapperServiceAction) {
        switch action {
        case .up:
            self = .starting
        case .down:
            self = .stopping
        case .restart:
            self = .restarting
        }
    }
}

@MainActor
final class DashboardModel: ObservableObject {
    private static let pinnedStackIDsKey = "ZapperPinnedStackIDs"

    @Published private(set) var projects: [ZapperProject] = []
    @Published private(set) var homepages: [String: String] = [:]
    @Published private(set) var links: [String: [ZapperProjectLink]] = [:]
    @Published private(set) var isRefreshing = false
    @Published private(set) var actionInFlight: String?
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var actionMessage: String?
    @Published private(set) var configuredZapPath: String?
    @Published private(set) var pinnedStackIDs: Set<String> = []
    @Published private(set) var pendingServiceActions: [String: PendingServiceAction] = [:]

    var hasStaleServiceState: Bool {
        !pendingServiceActions.isEmpty
    }

    var hasActionInFlight: Bool {
        isGlobalActionInFlight || hasStaleServiceState
    }

    var isGlobalActionInFlight: Bool {
        actionInFlight == "global-prune"
    }

    private let cli = ZapperCLI()

    init() {
        configuredZapPath = ZapperCLI.savedZapPath
        pinnedStackIDs = Set(UserDefaults.standard.stringArray(forKey: Self.pinnedStackIDsKey) ?? [])
    }

    var counts: ServiceCounts {
        projects.reduce(.empty) { partial, project in
            let projectCounts = project.instances.reduce(.empty) { instancePartial, instance in
                instancePartial + counts(for: instance, in: project)
            }
            return partial + projectCounts
        }
    }

    var menuTitle: String {
        let counts = counts
        if counts.total == 0 {
            return ""
        }
        return "\(counts.up)"
    }

    var menuSystemImage: String {
        let counts = counts
        if errorMessage != nil {
            return "bolt.trianglebadge.exclamationmark"
        }
        if counts.pending > 0 {
            return "bolt.badge.clock"
        }
        if counts.down > 0 && counts.up == 0 {
            return "bolt.slash"
        }
        return "bolt.fill"
    }

    func refresh(waitForInFlight: Bool = false) async {
        if isRefreshing {
            guard waitForInFlight else {
                return
            }

            while isRefreshing && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }

        if Task.isCancelled {
            return
        }

        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let loadedProjects = try await cli.loadProjects()
            projects = loadedProjects
            lastUpdated = Date()
            errorMessage = nil
            await refreshLinks(for: loadedProjects)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func homepage(for project: ZapperProject, instance: ZapperInstance) -> String? {
        links(for: project, instance: instance).first(where: \.isHomepage)?.url
            ?? homepages[homepageKey(project: project, instanceKey: instance.instanceKey)]
    }

    func links(for project: ZapperProject, instance: ZapperInstance) -> [ZapperProjectLink] {
        links[homepageKey(project: project, instanceKey: instance.instanceKey)] ?? []
    }

    func counts(for instance: ZapperInstance, in project: ZapperProject) -> ServiceCounts {
        instance.services.reduce(.empty) { partial, service in
            partial + ServiceCounts(
                status: status(for: service, instance: instance, project: project),
                enabled: service.enabled
            )
        }
    }

    func status(for service: ZapperService, instance: ZapperInstance, project: ZapperProject) -> String {
        service.status
    }

    func isServiceBusy(_ service: ZapperService, instance: ZapperInstance, project: ZapperProject) -> Bool {
        pendingAction(for: service, instance: instance, project: project) != nil
    }

    func isStackBusy(instance: ZapperInstance, project: ZapperProject) -> Bool {
        let prefix = stackServiceKeyPrefix(project: project, instanceKey: instance.instanceKey)
        return pendingServiceActions.keys.contains { $0.hasPrefix(prefix) }
    }

    func isStackActive(instance: ZapperInstance, project: ZapperProject) -> Bool {
        let counts = counts(for: instance, in: project)
        return project.error != nil
            || instance.error != nil
            || isStackBusy(instance: instance, project: project)
            || counts.pending > 0
            || counts.up > 0
    }

    func startInstance(_ instance: ZapperInstance, in project: ZapperProject) async {
        await runAction(.up, project: project, instance: instance)
    }

    func stopInstance(_ instance: ZapperInstance, in project: ZapperProject) async {
        await runAction(.down, project: project, instance: instance)
    }

    func restartInstance(_ instance: ZapperInstance, in project: ZapperProject) async {
        await runAction(.restart, project: project, instance: instance)
    }

    func startService(_ service: ZapperService, instance: ZapperInstance, project: ZapperProject) async {
        await runAction(.up, project: project, instance: instance, service: service.service)
    }

    func stopService(_ service: ZapperService, instance: ZapperInstance, project: ZapperProject) async {
        await runAction(.down, project: project, instance: instance, service: service.service)
    }

    func restartService(_ service: ZapperService, instance: ZapperInstance, project: ZapperProject) async {
        await runAction(.restart, project: project, instance: instance, service: service.service)
    }

    func chooseZapCLI() {
        NSApplication.shared.activate(ignoringOtherApps: true)

        let panel = NSOpenPanel()
        panel.title = "Choose zap CLI"
        panel.message = "Choose the zap executable installed by pnpm, npm, or Homebrew."
        panel.prompt = "Use zap"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.treatsFilePackagesAsDirectories = true

        guard panel.runModal() == .OK, let path = panel.url?.path else {
            return
        }

        do {
            try ZapperCLI.saveZapPath(path)
            configuredZapPath = path
            actionMessage = "Using zap at \(path)"
            errorMessage = nil
            Task { await refresh() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearZapCLIOverride() {
        ZapperCLI.clearSavedZapPath()
        configuredZapPath = nil
        actionMessage = "Cleared zap CLI override"
        Task { await refresh() }
    }

    func isPinned(stackID: String) -> Bool {
        pinnedStackIDs.contains(stackID)
    }

    func togglePin(stackID: String) {
        if pinnedStackIDs.contains(stackID) {
            pinnedStackIDs.remove(stackID)
        } else {
            pinnedStackIDs.insert(stackID)
        }
        UserDefaults.standard.set(Array(pinnedStackIDs).sorted(), forKey: Self.pinnedStackIDsKey)
    }

    func pruneMissingStacks() async {
        if hasActionInFlight {
            return
        }

        actionInFlight = "global-prune"
        actionMessage = "Pruning missing stacks"
        defer {
            actionInFlight = nil
        }

        do {
            try await cli.pruneGlobalResources()
            actionMessage = "Pruned missing stacks"
            await refresh(waitForInFlight: true)
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    private func runAction(
        _ action: ZapperServiceAction,
        project: ZapperProject,
        instance: ZapperInstance,
        service: String? = nil
    ) async {
        if isGlobalActionInFlight {
            return
        }

        let target = service ?? instance.instanceKey
        let affectedServices = affectedServiceNames(action: action, instance: instance, service: service)
        if hasPendingAction(for: affectedServices, project: project, instance: instance) {
            return
        }

        let actionID = "\(action.rawValue):\(project.registryId):\(instance.instanceKey):\(service ?? "*")"
        actionInFlight = actionID
        actionMessage = "\(action.rawValue) \(project.project)/\(target)"
        setPendingAction(PendingServiceAction(action: action), for: affectedServices, project: project, instance: instance)
        defer {
            clearPendingActions(for: affectedServices, project: project, instance: instance)
            if actionInFlight == actionID {
                actionInFlight = nil
            }
        }

        do {
            try await cli.runServiceAction(
                action: action,
                configPath: project.configPath,
                instanceKey: instance.instanceKey,
                service: service
            )
            actionMessage = "Completed \(action.rawValue) \(project.project)/\(target)"
            await refresh()
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    private func refreshLinks(for projects: [ZapperProject]) async {
        var loadedHomepages: [String: String] = [:]
        var loadedLinks: [String: [ZapperProjectLink]] = [:]

        for project in projects {
            for instance in project.instances {
                let key = homepageKey(project: project, instanceKey: instance.instanceKey)
                if let links = try? await cli.loadLinks(
                    configPath: project.configPath,
                    instanceKey: instance.instanceKey
                ) {
                    loadedLinks[key] = links
                    if let homepage = links.first(where: \.isHomepage)?.url {
                        loadedHomepages[key] = homepage
                    }
                }
            }
        }

        homepages = loadedHomepages
        links = loadedLinks
    }

    private func homepageKey(project: ZapperProject, instanceKey: String) -> String {
        "\(project.registryId):\(instanceKey)"
    }

    private func pendingAction(
        for service: ZapperService,
        instance: ZapperInstance,
        project: ZapperProject
    ) -> PendingServiceAction? {
        pendingServiceActions[serviceKey(project: project, instanceKey: instance.instanceKey, service: service.service)]
    }

    private func affectedServiceNames(
        action: ZapperServiceAction,
        instance: ZapperInstance,
        service: String?
    ) -> [String] {
        if let service {
            return [service]
        }

        return instance.services
            .filter { service in
                guard service.enabled else {
                    return false
                }

                switch action {
                case .up:
                    return service.status != "up"
                case .down:
                    return service.status == "up" || service.status == "pending"
                case .restart:
                    return true
                }
            }
            .map(\.service)
    }

    private func setPendingAction(
        _ action: PendingServiceAction,
        for services: [String],
        project: ZapperProject,
        instance: ZapperInstance
    ) {
        for service in services {
            pendingServiceActions[serviceKey(project: project, instanceKey: instance.instanceKey, service: service)] = action
        }
    }

    private func hasPendingAction(
        for services: [String],
        project: ZapperProject,
        instance: ZapperInstance
    ) -> Bool {
        services.contains { service in
            pendingServiceActions[
                serviceKey(project: project, instanceKey: instance.instanceKey, service: service)
            ] != nil
        }
    }

    private func clearPendingActions(
        for services: [String],
        project: ZapperProject,
        instance: ZapperInstance
    ) {
        for service in services {
            pendingServiceActions.removeValue(
                forKey: serviceKey(project: project, instanceKey: instance.instanceKey, service: service)
            )
        }
    }

    private func serviceKey(project: ZapperProject, instanceKey: String, service: String) -> String {
        "\(stackServiceKeyPrefix(project: project, instanceKey: instanceKey))\(service)"
    }

    private func stackServiceKeyPrefix(project: ZapperProject, instanceKey: String) -> String {
        "\(project.registryId):\(instanceKey):"
    }
}
