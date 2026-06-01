import AppKit
import SwiftUI

private let popoverWidth = CGFloat(420)
private let minPopoverHeight = CGFloat(120)
private let maxPopoverHeight = CGFloat(560)
private let headerHeight = CGFloat(61)
private let dividerHeight = CGFloat(1)
private let dashboardPadding = CGFloat(24)
private let stackSectionSpacing = CGFloat(12)
private let stackSectionHeaderHeight = CGFloat(20)
private let stackSpacing = CGFloat(6)
private let collapsedStackRowHeight = CGFloat(58)
private let expandedStackTopPadding = CGFloat(10)
private let serviceGroupHeaderHeight = CGFloat(22)
private let serviceRowHeight = CGFloat(28)
private let detailRowHeight = CGFloat(18)
private let errorRowHeight = CGFloat(24)
private let emptyServiceRowHeight = CGFloat(22)
private let missingStacksWarningCollapsedHeight = CGFloat(54)
private let missingStacksWarningConfirmHeight = CGFloat(120)
private let stackActionFontSize = CGFloat(11)

struct DashboardView: View {
    @ObservedObject var model: DashboardModel
    var onHeightChange: ((CGFloat) -> Void)?
    @State private var viewMode: DashboardViewMode = .dashboard
    @State private var expandedStackIDs = Set<String>()
    @State private var missingStacksExpanded = false
    @State private var confirmingMissingStackPrune = false

    var body: some View {
        ZStack {
            VisualEffectBackground()

            VStack(spacing: 0) {
                HeaderView(model: model, viewMode: $viewMode)
                Divider()
                switch viewMode {
                case .settings:
                    SettingsView(model: model, viewMode: $viewMode)
                case .debug:
                    DebugConsoleView()
                case .dashboard:
                    content
                }
            }
        }
        .frame(width: popoverWidth, height: desiredPopoverHeight)
        .onAppear {
            onHeightChange?(desiredPopoverHeight)
        }
        .onChange(of: desiredPopoverHeight) { height in
            onHeightChange?(height)
        }
        .onChange(of: missingProjectIDs) { _ in
            resetMissingStackWarningState()
        }
    }

    private var desiredPopoverHeight: CGFloat {
        min(max(minPopoverHeight, headerHeight + dividerHeight + currentContentHeight), maxPopoverHeight)
    }

    private var currentContentHeight: CGFloat {
        if viewMode == .settings {
            return 300
        }

        if viewMode == .debug {
            return maxDashboardContentHeight
        }

        if model.projects.isEmpty {
            return 220
        }

        return min(estimatedDashboardContentHeight, maxDashboardContentHeight)
    }

    private var estimatedDashboardContentHeight: CGFloat {
        let sectionCount = stackSections.count + (missingProjects.isEmpty ? 0 : 1)
        guard sectionCount > 0 else {
            return 220
        }

        let sectionHeights = stackSections.reduce(CGFloat(0)) { partial, section in
            let rows = section.stacks.reduce(CGFloat(0)) { rowPartial, stack in
                rowPartial + estimatedStackRowHeight(stack)
            }
            let rowSpacing = CGFloat(max(section.stacks.count - 1, 0)) * stackSpacing
            return partial + stackSectionHeaderHeight + rows + rowSpacing
        }
        let missingRowsHeight = missingProjects.isEmpty
            ? CGFloat(0)
            : stackSectionHeaderHeight
                + missingStackWarningHeight
        let sectionSpacing = CGFloat(max(sectionCount - 1, 0)) * stackSectionSpacing
        return dashboardPadding + sectionHeights + missingRowsHeight + sectionSpacing
    }

    private var missingStackWarningHeight: CGFloat {
        if confirmingMissingStackPrune {
            return missingStacksWarningConfirmHeight
        }

        if missingStacksExpanded {
            return missingStacksWarningCollapsedHeight
                + CGFloat(missingProjects.count) * detailRowHeight
        }

        return missingStacksWarningCollapsedHeight
    }

    private var maxDashboardContentHeight: CGFloat {
        maxPopoverHeight - headerHeight - dividerHeight
    }

    private func estimatedStackRowHeight(_ stack: ProjectStack) -> CGFloat {
        var height = collapsedStackRowHeight
        guard expandedStackIDs.contains(stack.id) else {
            return height
        }

        let groups = serviceGroups(for: stack.instance.services)
        var detailHeight = CGFloat(stack.instance.services.count) * serviceRowHeight
        detailHeight += CGFloat(groups.count) * serviceGroupHeaderHeight
        if stack.project.error != nil {
            detailHeight += errorRowHeight
        }
        if stack.instance.error != nil {
            detailHeight += errorRowHeight
        }
        if stack.instance.services.isEmpty {
            detailHeight += emptyServiceRowHeight
        }
        detailHeight += CGFloat(stack.detailRows.count) * detailRowHeight

        height += expandedStackTopPadding + max(emptyServiceRowHeight, detailHeight)
        return height
    }

    private func expandedBinding(for stack: ProjectStack) -> Binding<Bool> {
        Binding(
            get: {
                expandedStackIDs.contains(stack.id)
            },
            set: { isExpanded in
                if isExpanded {
                    expandedStackIDs.insert(stack.id)
                } else {
                    expandedStackIDs.remove(stack.id)
                }
            }
        )
    }

    @ViewBuilder
    private var content: some View {
        if let errorMessage = model.errorMessage, model.projects.isEmpty {
            ErrorView(message: errorMessage) {
                Task { await model.refresh() }
            } chooseZap: {
                model.chooseZapCLI()
            }
        } else if model.projects.isEmpty {
            EmptyStateView(isRefreshing: model.isRefreshing)
        } else {
            ScrollView {
                LazyVStack(spacing: stackSectionSpacing) {
                    if !missingProjects.isEmpty {
                        MissingStackSectionView(
                            projects: missingProjects,
                            model: model,
                            isExpanded: $missingStacksExpanded,
                            isConfirmingPrune: $confirmingMissingStackPrune
                        )
                    }

                    ForEach(stackSections) { section in
                        StackSectionView(
                            section: section,
                            model: model,
                            expandedBinding: expandedBinding(for:)
                        )
                    }
                }
                .padding(12)
            }
            .frame(height: currentContentHeight)
        }
    }

    private var allStacks: [ProjectStack] {
        let stacks = model.projects.flatMap { project in
            project.instances.map { instance in
                ProjectStack(project: project, instance: instance, showsInstanceLabel: false)
            }
        }

        let baseTitleCounts = Dictionary(grouping: stacks, by: \.baseTitle)
            .mapValues(\.count)

        return stacks.map { stack in
            ProjectStack(
                project: stack.project,
                instance: stack.instance,
                showsInstanceLabel: (baseTitleCounts[stack.baseTitle] ?? 0) > 1
            )
        }
        .sorted { lhs, rhs in
            lhs.sortTitle.localizedCaseInsensitiveCompare(rhs.sortTitle) == .orderedAscending
        }
    }

    private var missingProjects: [ZapperProject] {
        model.projects
            .filter { $0.state == "stale" }
            .sorted { lhs, rhs in
                lhs.project.localizedCaseInsensitiveCompare(rhs.project) == .orderedAscending
            }
    }

    private var missingProjectIDs: [String] {
        missingProjects.map(\.registryId)
    }

    private func resetMissingStackWarningState() {
        missingStacksExpanded = false
        confirmingMissingStackPrune = false
    }

    private var stackSections: [StackSection] {
        let pinned = allStacks.filter { model.isPinned(stackID: $0.pinID) }
        let unpinned = allStacks.filter { !model.isPinned(stackID: $0.pinID) }
        let active = unpinned.filter { model.isStackActive(instance: $0.instance, project: $0.project) }
        let inactive = unpinned.filter { !model.isStackActive(instance: $0.instance, project: $0.project) }

        return [
            StackSection(title: "Pinned", stacks: pinned),
            StackSection(title: "Active", stacks: active),
            StackSection(title: "Inactive", stacks: inactive)
        ].filter { !$0.stacks.isEmpty }
    }
}

private struct StackSection: Identifiable {
    let title: String
    let stacks: [ProjectStack]

    var id: String { title }
}

private struct StackSectionView: View {
    let section: StackSection
    @ObservedObject var model: DashboardModel
    let expandedBinding: (ProjectStack) -> Binding<Bool>

    var body: some View {
        VStack(alignment: .leading, spacing: stackSpacing) {
            Text(section.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .frame(maxWidth: .infinity, minHeight: stackSectionHeaderHeight, alignment: .leading)

            ForEach(section.stacks) { stack in
                StackRow(
                    stack: stack,
                    model: model,
                    isExpanded: expandedBinding(stack)
                )
            }
        }
    }
}

private struct MissingStackSectionView: View {
    let projects: [ZapperProject]
    @ObservedObject var model: DashboardModel
    @Binding var isExpanded: Bool
    @Binding var isConfirmingPrune: Bool
    @State private var isHovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: stackSpacing) {
            Text("Missing Stacks")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .frame(maxWidth: .infinity, minHeight: stackSectionHeaderHeight, alignment: .leading)

            VStack(alignment: .leading, spacing: 8) {
                if isConfirmingPrune {
                    confirmationContent
                } else {
                    warningContent
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor).opacity(isHovering ? 0.82 : 0.48))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.orange.opacity(isHovering ? 0.34 : 0.2), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .onHover { hovering in
                isHovering = hovering
            }
        }
    }

    private var warningContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button {
                    isExpanded.toggle()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 14, height: 18)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .buttonStyle(.plain)
                .help(isExpanded ? "Hide paths" : "Show paths")

                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.orange)

                Text("\(projects.count) missing \(projects.count == 1 ? "stack" : "stacks")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 0)

                if isPruning {
                    HStack(spacing: 5) {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.48)
                        Text("Pruning")
                            .font(.system(size: stackActionFontSize))
                            .foregroundStyle(.secondary)
                    }
                    .frame(height: 20)
                } else {
                    Button("Prune") {
                        isConfirmingPrune = true
                    }
                    .font(.system(size: stackActionFontSize))
                    .foregroundStyle(.primary)
                    .controlSize(.small)
                    .disabled(model.hasActionInFlight)
                }
            }

            if isExpanded {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(projects) { project in
                        Text(project.projectRoot)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .textSelection(.enabled)
                    }
                }
                .padding(.leading, 22)
            }
        }
    }

    private var confirmationContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.orange)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Delete orphaned resources?")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Text("This will remove missing stack registry entries and delete matching PM2 processes, Docker containers, and generated Docker volumes.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                Spacer(minLength: 0)

                Button("Cancel") {
                    isConfirmingPrune = false
                }
                .font(.system(size: stackActionFontSize))
                .controlSize(.small)
                .disabled(model.hasActionInFlight)

                Button("Delete") {
                    isConfirmingPrune = false
                    isExpanded = false
                    Task { await model.pruneMissingStacks() }
                }
                .font(.system(size: stackActionFontSize))
                .foregroundStyle(.red)
                .controlSize(.small)
                .disabled(model.hasActionInFlight)
            }
        }
    }

    private var isPruning: Bool {
        model.actionInFlight == "global-prune"
    }
}

private enum DashboardViewMode {
    case dashboard
    case settings
    case debug
}

private struct VisualEffectBackground: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .popover
        view.blendingMode = .behindWindow
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

private struct ProjectStack: Identifiable {
    let project: ZapperProject
    let instance: ZapperInstance
    let showsInstanceLabel: Bool

    var id: String { pinID }

    var pinID: String { "\(project.registryId):\(instance.instanceKey)" }

    var baseTitle: String {
        if instance.instanceKey == "default" {
            return project.project
        }
        return "\(project.project) (\(instance.instanceKey))"
    }

    var title: String {
        guard showsInstanceLabel else {
            return baseTitle
        }
        return "\(baseTitle) - \(instanceIdentity)"
    }

    var sortTitle: String {
        "\(project.project):\(instance.instanceKey):\(instance.displayLabel)"
    }

    var counts: ServiceCounts {
        instance.counts
    }

    var detailRows: [StackDetailRow] {
        [
            StackDetailRow(label: "Path", value: project.projectRoot),
            StackDetailRow(label: "Stack ID", value: instanceIdentity)
        ]
    }

    private var instanceIdentity: String {
        instance.displayLabel == instance.instanceId
            ? instance.instanceId
            : "\(instance.displayLabel) (\(instance.instanceId))"
    }
}

private struct StackDetailRow: Identifiable {
    let label: String
    let value: String

    var id: String { label }
}

private struct ServiceGroup: Identifiable {
    let type: String
    let services: [ZapperService]

    var id: String { type }

    var title: String {
        switch type {
        case "native":
            return "Native"
        case "docker":
            return "Docker"
        default:
            return type.capitalized
        }
    }
}

private struct HeaderView: View {
    @ObservedObject var model: DashboardModel
    @Binding var viewMode: DashboardViewMode

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Zapper")
                    .font(.headline)
                HStack(spacing: 5) {
                    HeaderRefreshIndicator(isRefreshing: model.isRefreshing)
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if viewMode != .dashboard {
                Button {
                    viewMode = .dashboard
                } label: {
                    Image(systemName: "chevron.left")
                }
                .buttonStyle(.borderless)
                .help("Back")
            } else {
                Button {
                    Task { await model.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .disabled(model.isRefreshing)
                .help("Refresh")

                Button {
                    viewMode = .settings
                } label: {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.borderless)
                .help("Settings")
            }
        }
        .padding(12)
    }

    private var summary: String {
        let counts = model.counts
        if viewMode == .settings {
            return "Settings"
        }
        if viewMode == .debug {
            return "Debug console"
        }
        if counts.total == 0 {
            return "No services loaded"
        }
        return serviceSummary(counts)
    }
}

private struct HeaderRefreshIndicator: View {
    let isRefreshing: Bool

    var body: some View {
        Group {
            if isRefreshing {
                ProgressView()
                    .controlSize(.small)
                    .scaleEffect(0.45)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(.secondary)
                    .opacity(0.72)
            }
        }
        .frame(width: 9, height: 9)
        .help(isRefreshing ? "Refreshing" : "Up to date")
    }
}

private struct SettingsView: View {
    @ObservedObject var model: DashboardModel
    @Binding var viewMode: DashboardViewMode

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SettingsSection(title: "Status") {
                SettingsRow(
                    label: "Last updated",
                    value: model.lastUpdated?.formatted(date: .abbreviated, time: .shortened) ?? "Not updated yet"
                )

                SettingsRow(
                    label: "Last action",
                    value: model.actionMessage ?? "None"
                )

                if let errorMessage = model.errorMessage {
                    SettingsRow(label: "Last error", value: errorMessage, valueColor: .red)
                }
            }

            SettingsSection(title: "CLI") {
                SettingsRow(
                    label: "Override",
                    value: model.configuredZapPath ?? "Using bundled runtime"
                )

                HStack(spacing: 10) {
                    Button("Choose External CLI") {
                        model.chooseZapCLI()
                    }

                    Button("Clear Override") {
                        model.clearZapCLIOverride()
                    }
                    .disabled(model.configuredZapPath == nil)
                }
            }

            Spacer()

            HStack {
                Button("Refresh") {
                    Task { await model.refresh() }
                }
                .disabled(model.isRefreshing)

                Button("Debug Console") {
                    viewMode = .debug
                }
                .help("Inspect the zap commands the app is running")

                Spacer()

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
            }
        }
        .buttonStyle(.borderless)
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct DebugConsoleView: View {
    @ObservedObject private var log = CommandLog.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text("\(log.entries.count) recorded \(log.entries.count == 1 ? "command" : "commands")")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Button("Copy All") {
                    copyToPasteboard(log.transcript)
                }
                .disabled(log.entries.isEmpty)

                Button("Clear") {
                    log.clear()
                }
                .disabled(log.entries.isEmpty)
            }
            .buttonStyle(.borderless)
            .controlSize(.small)
            .padding(12)

            Divider()

            if log.entries.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "terminal")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No commands recorded yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Refresh or run an action to see what the app executes.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 24)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6) {
                        ForEach(log.entries) { entry in
                            CommandLogRow(entry: entry)
                        }
                    }
                    .padding(12)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct CommandLogRow: View {
    let entry: CommandLogEntry
    @State private var isExpanded = false
    @State private var isHovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: entry.succeeded ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(entry.succeeded ? Color.green : Color.red)

                    Text(entry.commandLine)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.primary)
                        .lineLimit(isExpanded ? nil : 1)
                        .truncationMode(.middle)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 0)

                    Text("\(entry.durationMs) ms")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text("exit \(entry.exitCode)")
                            .font(.caption2)
                            .foregroundStyle(entry.succeeded ? Color.secondary : Color.red)
                        Text(entry.date.formatted(date: .abbreviated, time: .standard))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                        Button("Copy") {
                            copyToPasteboard(entry.commandLine)
                        }
                        .font(.caption2)
                        .buttonStyle(.borderless)
                        .controlSize(.small)
                    }

                    if !entry.stdout.isEmpty {
                        outputBlock(title: "stdout", text: entry.stdout)
                    }
                    if !entry.stderr.isEmpty {
                        outputBlock(title: "stderr", text: entry.stderr)
                    }
                }
                .padding(.leading, 18)
            }
        }
        .padding(8)
        .background {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(isHovering ? 0.8 : 0.45))
        }
        .onHover { isHovering = $0 }
    }

    private func outputBlock(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(text.count > 4000 ? String(text.prefix(4000)) + "\n… (truncated)" : text)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 7) {
                content
            }
        }
    }
}

private struct SettingsRow: View {
    let label: String
    let value: String
    var valueColor: Color = .secondary

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.primary)
                .frame(width: 86, alignment: .leading)

            Text(value)
                .font(.caption)
                .foregroundStyle(valueColor)
                .lineLimit(3)
                .truncationMode(.middle)
                .textSelection(.enabled)

            Spacer(minLength: 0)
        }
    }
}

private struct StackRow: View {
    let stack: ProjectStack
    @ObservedObject var model: DashboardModel
    @Binding var isExpanded: Bool
    @State private var isHovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    isExpanded.toggle()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 14, height: 18)
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                            .opacity(isExpanded || isHovering ? 1 : 0.38)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(stack.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            HStack(spacing: 5) {
                                StatusIndicator(
                                    counts: stackCounts,
                                    error: stack.project.error ?? stack.instance.error,
                                    isBusy: isBusy
                                )
                                Text(serviceSummary(stackCounts))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }

                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)

                StackActions(stack: stack, model: model)
            }

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    if let error = stack.project.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    if let error = stack.instance.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    StackDetailRows(rows: stack.detailRows)

                    ForEach(serviceGroups(for: stack.instance.services)) { group in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(group.title)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)

                            ForEach(group.services) { service in
                                ServiceRow(
                                    service: service,
                                    instance: stack.instance,
                                    project: stack.project,
                                    model: model
                                )
                            }
                        }
                    }

                    if stack.instance.services.isEmpty {
                        Text("No services")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 10)
                .padding(.leading, 24)
            }
        }
        .padding(10)
        .background {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(isHovering ? 0.82 : 0.48))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(isHovering ? 0.45 : 0.18), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onHover { hovering in
            isHovering = hovering
        }
        .transaction { transaction in
            transaction.animation = nil
        }
    }

    private var stackCounts: ServiceCounts {
        model.counts(for: stack.instance, in: stack.project)
    }

    private var isBusy: Bool {
        model.isStackBusy(instance: stack.instance, project: stack.project)
    }
}

private struct StackActions: View {
    let stack: ProjectStack
    @ObservedObject var model: DashboardModel

    var body: some View {
        HStack(spacing: 4) {
            if stackCounts.up < stackCounts.total {
                stackActionButton("Start") {
                    Task { await model.startInstance(stack.instance, in: stack.project) }
                }
                .disabled(model.isGlobalActionInFlight || isBusy)
            }

            if stackCounts.up > 0 {
                stackActionButton("Stop") {
                    Task { await model.stopInstance(stack.instance, in: stack.project) }
                }
                .disabled(model.isGlobalActionInFlight || isBusy)
            }

            StackOpenControl(links: model.links(for: stack.project, instance: stack.instance))

            StackMoreButton(
                stack: stack,
                isPinned: model.isPinned(stackID: stack.pinID),
                togglePin: {
                    model.togglePin(stackID: stack.pinID)
                }
            )
        }
        .buttonStyle(.borderless)
    }

    private func stackActionButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.system(size: stackActionFontSize))
            .foregroundStyle(.primary)
            .controlSize(.small)
    }

    private var stackCounts: ServiceCounts {
        model.counts(for: stack.instance, in: stack.project)
    }

    private var isBusy: Bool {
        model.isStackBusy(instance: stack.instance, project: stack.project)
    }
}

private struct StackDetailRows: View {
    let rows: [StackDetailRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(rows) { row in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(row.label)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 46, alignment: .leading)
                    Text(row.value)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
            }
        }
    }
}

private struct StackOpenControl: View {
    let links: [ZapperProjectLink]

    var body: some View {
        if links.count == 1, let link = links.first, let url = URL(string: link.url) {
            Button("Open") {
                NSWorkspace.shared.open(url)
            }
            .font(.system(size: stackActionFontSize))
            .foregroundStyle(.primary)
            .controlSize(.small)
            .help(link.url)
        } else if links.count > 1 {
            Menu {
                ForEach(orderedLinks) { link in
                    if let url = URL(string: link.url) {
                        Button(link.isHomepage ? "Homepage" : link.name) {
                            NSWorkspace.shared.open(url)
                        }
                        .help(link.url)
                    }
                }
            } label: {
                Text("Open")
                    .font(.system(size: stackActionFontSize))
                    .foregroundStyle(.primary)
            }
            .controlSize(.small)
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
        }
    }

    private var orderedLinks: [ZapperProjectLink] {
        links.sorted { lhs, rhs in
            if lhs.isHomepage != rhs.isHomepage {
                return lhs.isHomepage
            }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }
}

private struct StackMoreButton: NSViewRepresentable {
    let stack: ProjectStack
    let isPinned: Bool
    let togglePin: () -> Void

    func makeNSView(context: Context) -> NSButton {
        let button = NSButton(title: "", target: context.coordinator, action: #selector(Coordinator.showMenu(_:)))
        button.isBordered = false
        button.bezelStyle = .inline
        button.controlSize = .small
        button.font = NSFont.systemFont(ofSize: stackActionFontSize)
        button.attributedTitle = stackActionAttributedTitle("More")
        button.attributedAlternateTitle = stackActionAttributedTitle("More")
        button.contentTintColor = .labelColor
        button.setButtonType(.momentaryPushIn)
        button.toolTip = "Stack actions"
        button.setContentHuggingPriority(.required, for: .horizontal)
        button.setContentCompressionResistancePriority(.required, for: .horizontal)
        return button
    }

    func updateNSView(_ nsView: NSButton, context: Context) {
        context.coordinator.parent = self
        nsView.font = NSFont.systemFont(ofSize: stackActionFontSize)
        nsView.attributedTitle = stackActionAttributedTitle("More")
        nsView.attributedAlternateTitle = stackActionAttributedTitle("More")
        nsView.contentTintColor = .labelColor
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject {
        var parent: StackMoreButton

        init(parent: StackMoreButton) {
            self.parent = parent
        }

        @objc func showMenu(_ sender: NSButton) {
            let menu = NSMenu()

            let pinItem = NSMenuItem(
                title: parent.isPinned ? "Unpin" : "Pin",
                action: #selector(togglePin),
                keyEquivalent: ""
            )
            pinItem.target = self
            menu.addItem(pinItem)

            menu.addItem(.separator())

            let openFolderItem = NSMenuItem(
                title: "Open Project Folder",
                action: #selector(openProjectFolder),
                keyEquivalent: ""
            )
            openFolderItem.target = self
            menu.addItem(openFolderItem)

            menu.addItem(.separator())

            let copyProjectPathItem = NSMenuItem(
                title: "Copy Project Path",
                action: #selector(copyProjectPath),
                keyEquivalent: ""
            )
            copyProjectPathItem.target = self
            menu.addItem(copyProjectPathItem)

            let copyConfigPathItem = NSMenuItem(
                title: "Copy Config Path",
                action: #selector(copyConfigPath),
                keyEquivalent: ""
            )
            copyConfigPathItem.target = self
            menu.addItem(copyConfigPathItem)

            let copyInstanceIDItem = NSMenuItem(
                title: "Copy Stack ID",
                action: #selector(copyInstanceID),
                keyEquivalent: ""
            )
            copyInstanceIDItem.target = self
            menu.addItem(copyInstanceIDItem)

            menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.maxY + 2), in: sender)
        }

        @objc private func togglePin() {
            parent.togglePin()
        }

        @objc private func openProjectFolder() {
            NSWorkspace.shared.open(URL(fileURLWithPath: parent.stack.project.projectRoot))
        }

        @objc private func copyProjectPath() {
            copyToPasteboard(parent.stack.project.projectRoot)
        }

        @objc private func copyConfigPath() {
            copyToPasteboard(parent.stack.project.configPath)
        }

        @objc private func copyInstanceID() {
            copyToPasteboard(parent.stack.instance.instanceId)
        }
    }
}

private struct StatusIndicator: View {
    let counts: ServiceCounts
    let error: String?
    let isBusy: Bool

    var body: some View {
        Group {
            if isBusy {
                ProgressView()
                    .controlSize(.small)
                    .scaleEffect(0.45)
            } else {
                Circle()
                    .fill(statusColor(counts: counts, error: error))
                    .overlay {
                        Circle()
                            .stroke(Color(nsColor: .separatorColor).opacity(0.3), lineWidth: 0.5)
                    }
            }
        }
        .frame(width: 7, height: 7)
        .help(statusHelp)
    }

    private var statusHelp: String {
        if error != nil {
            return "Needs attention"
        }
        if counts.pending > 0 {
            return "Services are starting"
        }
        if counts.up == counts.total, counts.total > 0 {
            return "All enabled services are running"
        }
        if counts.up > 0 {
            return "Some enabled services are running"
        }
        return "No enabled services are running"
    }
}

private struct ServiceRow: View {
    let service: ZapperService
    let instance: ZapperInstance
    let project: ZapperProject
    @ObservedObject var model: DashboardModel

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.45)
                } else {
                    Circle()
                        .fill(serviceStatusColor(status: status, enabled: service.enabled))
                }
            }
                .frame(width: 7, height: 7)
            Text(service.service)
                .font(.caption)
                .lineLimit(1)

            Spacer()

            ServiceInfoMenu(
                service: service,
                instance: instance,
                project: project,
                model: model,
                status: status,
                isBusy: isBusy
            )
        }
        .buttonStyle(.borderless)
    }

    private var status: String {
        model.status(for: service, instance: instance, project: project)
    }

    private var isBusy: Bool {
        model.isServiceBusy(service, instance: instance, project: project)
    }
}

private struct ServiceInfoMenu: View {
    let service: ZapperService
    let instance: ZapperInstance
    let project: ZapperProject
    @ObservedObject var model: DashboardModel
    let status: String
    let isBusy: Bool

    var body: some View {
        Menu {
            if status == "up" || status == "pending" {
                Button("Stop") {
                    Task {
                        await model.stopService(service, instance: instance, project: project)
                    }
                }
                .disabled(model.isGlobalActionInFlight || isBusy)
            } else {
                Button("Start") {
                    Task {
                        await model.startService(service, instance: instance, project: project)
                    }
                }
                .disabled(model.isGlobalActionInFlight || isBusy)
            }

            Button("Restart") {
                Task {
                    await model.restartService(service, instance: instance, project: project)
                }
            }
            .disabled(model.isGlobalActionInFlight || isBusy)

            if let cwd = service.cwd {
                Divider()

                Button("Copy Working Directory") {
                    copyToPasteboard(cwd)
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .menuStyle(.borderlessButton)
        .help("Service info")
    }
}

private struct ErrorView: View {
    let message: String
    let retry: () -> Void
    let chooseZap: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text(message)
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 24)
            HStack(spacing: 10) {
                Button("Choose zap", action: chooseZap)
                Button("Retry", action: retry)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct EmptyStateView: View {
    let isRefreshing: Bool

    var body: some View {
        VStack(spacing: 8) {
            ProgressView()
                .opacity(isRefreshing ? 1 : 0)
            Text(isRefreshing ? "Loading projects..." : "No registered projects")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private func statusColor(counts: ServiceCounts, error: String?) -> Color {
    if error != nil {
        return .orange
    }
    if counts.pending > 0 {
        return .orange
    }
    if counts.up > 0 {
        return .green
    }
    return .secondary
}

private func serviceStatusColor(status: String, enabled: Bool) -> Color {
    guard enabled else {
        return .secondary
    }

    switch status {
    case "up":
        return .green
    case "pending":
        return .orange
    default:
        return .secondary
    }
}

private func serviceSummary(_ counts: ServiceCounts) -> String {
    if counts.totalIncludingDisabled == 0 {
        return "No services"
    }
    if counts.total == 0 {
        return "\(counts.disabled) disabled"
    }

    var parts = [
        "\(counts.up)/\(counts.total) \(pluralize("service", counts.total)) running"
    ]

    if counts.pending > 0 {
        parts.append("\(counts.pending) pending")
    }

    if counts.disabled > 0 {
        parts.append("\(counts.disabled) disabled")
    }

    return parts.joined(separator: ", ")
}

private func serviceGroups(for services: [ZapperService]) -> [ServiceGroup] {
    let native = services.filter { $0.type == "native" }
    let docker = services.filter { $0.type == "docker" }
    let otherTypes = Set(services.map(\.type))
        .subtracting(["native", "docker"])
        .sorted()

    var groups: [ServiceGroup] = []
    if !native.isEmpty {
        groups.append(ServiceGroup(type: "native", services: native))
    }
    if !docker.isEmpty {
        groups.append(ServiceGroup(type: "docker", services: docker))
    }
    for type in otherTypes {
        let groupedServices = services.filter { $0.type == type }
        if !groupedServices.isEmpty {
            groups.append(ServiceGroup(type: type, services: groupedServices))
        }
    }
    return groups
}

private func pluralize(_ word: String, _ count: Int) -> String {
    count == 1 ? word : "\(word)s"
}

private func stackActionAttributedTitle(_ title: String) -> NSAttributedString {
    NSAttributedString(
        string: title,
        attributes: [
            .font: NSFont.systemFont(ofSize: stackActionFontSize),
            .foregroundColor: NSColor.labelColor
        ]
    )
}

private func copyToPasteboard(_ value: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(value, forType: .string)
}
