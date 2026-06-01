import Combine
import Foundation

/// One recorded invocation of an external process (almost always the `zap`
/// CLI). The debug console renders these so the user can see exactly what the
/// app ran and replay it manually in a terminal.
struct CommandLogEntry: Identifiable {
    let id = UUID()
    let date: Date
    let executable: String
    let arguments: [String]
    let exitCode: Int32
    let stdout: String
    let stderr: String
    let durationMs: Int

    /// A copy/paste-ready command line, with arguments quoted when needed.
    var commandLine: String {
        ([executable] + arguments).map(Self.shellQuote).joined(separator: " ")
    }

    var succeeded: Bool { exitCode == 0 }

    private static func shellQuote(_ value: String) -> String {
        if value.isEmpty {
            return "''"
        }
        let safe = CharacterSet(charactersIn:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./:=@")
        if value.unicodeScalars.allSatisfy(safe.contains) {
            return value
        }
        return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

/// Thread-safe, in-memory ring buffer of recent process invocations. Lives for
/// the lifetime of the app only; nothing is persisted to disk.
@MainActor
final class CommandLog: ObservableObject {
    static let shared = CommandLog()

    @Published private(set) var entries: [CommandLogEntry] = []

    private let maxEntries = 200

    private init() {}

    func record(_ entry: CommandLogEntry) {
        entries.insert(entry, at: 0)
        if entries.count > maxEntries {
            entries.removeLast(entries.count - maxEntries)
        }
    }

    func clear() {
        entries.removeAll()
    }

    /// A plain-text dump of the whole log for "Copy All".
    var transcript: String {
        entries.reversed().map { entry in
            let header = "$ \(entry.commandLine)"
            let meta = "# exit \(entry.exitCode) · \(entry.durationMs) ms · \(entry.date.formatted(date: .abbreviated, time: .standard))"
            var blocks = [header, meta]
            if !entry.stdout.isEmpty {
                blocks.append("--- stdout ---\n\(entry.stdout)")
            }
            if !entry.stderr.isEmpty {
                blocks.append("--- stderr ---\n\(entry.stderr)")
            }
            return blocks.joined(separator: "\n")
        }
        .joined(separator: "\n\n")
    }

    /// Records an invocation from any context. Safe to call off the main actor.
    nonisolated static func record(
        executable: String,
        arguments: [String],
        exitCode: Int32,
        stdout: String,
        stderr: String,
        durationSeconds: TimeInterval,
        startedAt: Date
    ) {
        let entry = CommandLogEntry(
            date: startedAt,
            executable: executable,
            arguments: arguments,
            exitCode: exitCode,
            stdout: stdout,
            stderr: stderr,
            durationMs: Int((durationSeconds * 1000).rounded())
        )
        Task { @MainActor in
            CommandLog.shared.record(entry)
        }
    }
}
