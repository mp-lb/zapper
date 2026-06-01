import Foundation

enum ZapperCLIError: LocalizedError {
    case notFound
    case invalidPath(String)
    case failed(command: String, status: Int32, stderr: String)
    case invalidOutput(String)

    var errorDescription: String? {
        switch self {
        case .notFound:
            return "Could not find the zap CLI. Choose the zap executable in the app, or install zap in a standard shell path."
        case let .invalidPath(path):
            return "The selected zap CLI path is not executable: \(path)"
        case let .failed(command, status, stderr):
            let detail = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            return detail.isEmpty
                ? "\(command) failed with exit code \(status)."
                : "\(command) failed with exit code \(status): \(detail)"
        case let .invalidOutput(message):
            return message
        }
    }
}

struct ZapperCLI {
    private static let savedPathKey = "ZapperCLIPath"

    static var savedZapPath: String? {
        UserDefaults.standard.string(forKey: savedPathKey)
    }

    static func saveZapPath(_ path: String) throws {
        guard isExecutable(path) else {
            throw ZapperCLIError.invalidPath(path)
        }
        UserDefaults.standard.set(path, forKey: savedPathKey)
    }

    static func clearSavedZapPath() {
        UserDefaults.standard.removeObject(forKey: savedPathKey)
    }

    func loadProjects() async throws -> [ZapperProject] {
        try await Task.detached(priority: .userInitiated) {
            let zapPath = try Self.resolveZapPath()
            let output = try Self.run(executable: zapPath, arguments: ["system", "projects", "--json"])
            let decoder = JSONDecoder()
            do {
                return try decoder.decode(SystemProjectsResponse.self, from: output).projects
            } catch {
                throw ZapperCLIError.invalidOutput("zap returned JSON that the app could not read: \(error.localizedDescription)")
            }
        }.value
    }

    func loadHomepage(configPath: String, instanceKey: String) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let zapPath = try Self.resolveZapPath()
            let output = try Self.run(
                executable: zapPath,
                arguments: Self.stackArguments(configPath: configPath, instanceKey: instanceKey)
                    + [
                        "home",
                        "--json"
                    ]
            )
            do {
                return try JSONDecoder().decode(ZapperHomeResponse.self, from: output).value
            } catch {
                throw ZapperCLIError.invalidOutput("zap home returned JSON that the app could not read: \(error.localizedDescription)")
            }
        }.value
    }

    func loadLinks(configPath: String, instanceKey: String) async throws -> [ZapperProjectLink] {
        try await Task.detached(priority: .userInitiated) {
            let zapPath = try Self.resolveZapPath()
            let output = try Self.run(
                executable: zapPath,
                arguments: Self.stackArguments(configPath: configPath, instanceKey: instanceKey)
                    + [
                        "links",
                        "--json"
                    ]
            )
            do {
                return try JSONDecoder().decode([ZapperProjectLink].self, from: output)
            } catch {
                throw ZapperCLIError.invalidOutput("zap links returned JSON that the app could not read: \(error.localizedDescription)")
            }
        }.value
    }

    func runServiceAction(
        action: ZapperServiceAction,
        configPath: String,
        instanceKey: String,
        service: String? = nil
    ) async throws {
        try await Task.detached(priority: .userInitiated) {
            let zapPath = try Self.resolveZapPath()
            var arguments = Self.stackArguments(configPath: configPath, instanceKey: instanceKey)
                + [action.rawValue]
            if let service {
                arguments.append(service)
            }
            arguments.append("--json")
            _ = try Self.run(executable: zapPath, arguments: arguments)
        }.value
    }

    func pruneGlobalResources() async throws {
        try await Task.detached(priority: .userInitiated) {
            let zapPath = try Self.resolveZapPath()
            _ = try Self.run(
                executable: zapPath,
                arguments: ["global", "prune", "--force", "--json"]
            )
        }.value
    }

    private static func resolveZapPath() throws -> String {
        let environment = ProcessInfo.processInfo.environment
        if let explicitPath = environment["ZAPPER_CLI_PATH"], isExecutable(explicitPath) {
            return explicitPath
        }

        if let bundledPath = Bundle.main.path(forResource: "zap", ofType: nil),
           isExecutable(bundledPath) {
            return bundledPath
        }

        if let savedPath = savedZapPath, isExecutable(savedPath) {
            return savedPath
        }

        let commonPaths = [
            "/opt/homebrew/bin/zap",
            "/usr/local/bin/zap",
            "\(NSHomeDirectory())/.local/bin/zap",
            "\(NSHomeDirectory())/Library/pnpm/zap",
            "\(NSHomeDirectory())/.local/share/pnpm/zap",
            "\(NSHomeDirectory())/.npm-global/bin/zap",
            "\(NSHomeDirectory())/.bun/bin/zap",
            "\(NSHomeDirectory())/.volta/bin/zap",
            "\(NSHomeDirectory())/.asdf/shims/zap",
            "\(NSHomeDirectory())/.mise/shims/zap"
        ]
        if let path = commonPaths.first(where: isExecutable) {
            return path
        }

        for directory in searchPathComponents() {
            let path = "\(directory)/zap"
            if isExecutable(path) {
                return path
            }
        }

        if let path = loginShellZapPath(), isExecutable(path) {
            return path
        }

        throw ZapperCLIError.notFound
    }

    private static func stackArguments(configPath: String, instanceKey: String) -> [String] {
        var arguments = ["--config", configPath]
        if instanceKey != "default" {
            arguments += ["--profile", instanceKey]
        }
        arguments += ["--instance", instanceKey]
        return arguments
    }

    private static func isExecutable(_ path: String) -> Bool {
        FileManager.default.isExecutableFile(atPath: path)
    }

    private static func run(executable: String, arguments: [String]) throws -> Data {
        try runProcess(
            executable: executable,
            arguments: arguments,
            environment: commandEnvironment()
        )
    }

    private static func runProcess(
        executable: String,
        arguments: [String],
        environment: [String: String]? = nil
    ) throws -> Data {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.environment = environment

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        let startedAt = Date()
        try process.run()
        process.waitUntilExit()

        let output = stdout.fileHandleForReading.readDataToEndOfFile()
        let errorOutput = stderr.fileHandleForReading.readDataToEndOfFile()
        let stderrText = String(data: errorOutput, encoding: .utf8) ?? ""

        CommandLog.record(
            executable: executable,
            arguments: arguments,
            exitCode: process.terminationStatus,
            stdout: String(data: output, encoding: .utf8) ?? "",
            stderr: stderrText,
            durationSeconds: Date().timeIntervalSince(startedAt),
            startedAt: startedAt
        )

        guard process.terminationStatus == 0 else {
            throw ZapperCLIError.failed(
                command: ([executable] + arguments).joined(separator: " "),
                status: process.terminationStatus,
                stderr: stderrText
            )
        }

        return output
    }

    private static func commandEnvironment() -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = searchPathComponents().joined(separator: ":")
        return environment
    }

    private static func searchPathComponents() -> [String] {
        let rawPaths = [
            ProcessInfo.processInfo.environment["PATH"],
            launchctlPath(),
            loginShellPath()
        ]

        let fallbackPaths = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
            "\(NSHomeDirectory())/Library/pnpm",
            "\(NSHomeDirectory())/.local/share/pnpm",
            "\(NSHomeDirectory())/.local/bin",
            "\(NSHomeDirectory())/.npm-global/bin",
            "\(NSHomeDirectory())/.bun/bin",
            "\(NSHomeDirectory())/.volta/bin",
            "\(NSHomeDirectory())/.asdf/shims",
            "\(NSHomeDirectory())/.mise/shims"
        ]

        var seen = Set<String>()
        var components: [String] = []
        for path in rawPaths.compactMap({ $0 }).flatMap({ $0.split(separator: ":").map(String.init) }) + fallbackPaths {
            guard !path.isEmpty, !seen.contains(path) else {
                continue
            }
            seen.insert(path)
            components.append(path)
        }
        return components
    }

    private static func loginShellZapPath() -> String? {
        guard let output = try? runProcess(
            executable: "/bin/zsh",
            arguments: ["-lc", "command -v zap"]
        ) else {
            return nil
        }
        let path = String(data: output, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return path?.isEmpty == false ? path : nil
    }

    private static func loginShellPath() -> String? {
        guard let output = try? runProcess(
            executable: "/bin/zsh",
            arguments: ["-lc", "print -r -- \"$PATH\""]
        ) else {
            return nil
        }
        let path = String(data: output, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return path?.isEmpty == false ? path : nil
    }

    private static func launchctlPath() -> String? {
        guard let output = try? runProcess(
            executable: "/bin/launchctl",
            arguments: ["getenv", "PATH"]
        ) else {
            return nil
        }
        let path = String(data: output, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return path?.isEmpty == false ? path : nil
    }
}

enum ZapperServiceAction: String {
    case up
    case down
    case restart
}
