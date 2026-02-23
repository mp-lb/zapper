import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { EnvResolver } from "./EnvResolver";
import { ZapperConfig } from "../config/schemas";
import { Context } from "../types/Context";
import path from "path";
import { tmpdir } from "os";

describe("EnvResolver", () => {
  let tempFiles: string[] = [];
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempFiles = [];
    tempDirs = [];
  });

  afterEach(() => {
    // Clean up temporary files
    tempFiles.forEach((file) => {
      try {
        unlinkSync(file);
      } catch (e) {
        // Ignore errors
      }
    });
    // Clean up temporary directories
    tempDirs.forEach((dir) => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        // Ignore errors
      }
    });
  });

  const createTempFile = (
    content: string,
    extension: string = ".tmp",
  ): string => {
    const filename = `temp-${Date.now()}-${Math.random()}${extension}`;
    const fullPath = path.resolve(filename);
    writeFileSync(fullPath, content);
    tempFiles.push(fullPath);
    return fullPath;
  };

  const createTempProjectDir = (ports?: Record<string, string>): string => {
    const dir = path.join(
      tmpdir(),
      `zapper-env-test-${Date.now()}-${Math.random()}`,
    );
    mkdirSync(dir, { recursive: true });
    tempDirs.push(dir);

    if (ports) {
      const zapDir = path.join(dir, ".zap");
      mkdirSync(zapDir, { recursive: true });
      writeFileSync(path.join(zapDir, "ports.json"), JSON.stringify(ports));
    }

    return dir;
  };

  describe("loadAndMergeEnvFiles", () => {
    it("should load .env files correctly", () => {
      const envContent = `
# This is a comment
APP_ENV=development
NODE_ENV=development
MYENV=foo
DATABASE_URL=postgresql://localhost:5432/myapp
PORT=3000
# Another comment
EMPTY_VAR=
QUOTED_VAR="quoted value"
      `;

      const envFile = createTempFile(envContent, ".env");

      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile]);

      expect(result).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
        MYENV: "foo",
        DATABASE_URL: "postgresql://localhost:5432/myapp",
        PORT: "3000",
        EMPTY_VAR: "",
        QUOTED_VAR: "quoted value",
      });
    });

    it("should load YAML files correctly (legacy support)", () => {
      const yamlContent = `
envs:
  - APP_ENV: development
  - NODE_ENV: development
  - MYENV: foo
  - DATABASE_URL: postgresql://localhost:5432/myapp
      `;

      const yamlFile = createTempFile(yamlContent, ".yaml");
      const result = EnvResolver["loadAndMergeEnvFiles"]([yamlFile]);

      expect(result).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
        MYENV: "foo",
        DATABASE_URL: "postgresql://localhost:5432/myapp",
      });
    });

    it("should merge multiple env files", () => {
      const env1Content = `
APP_ENV=development
NODE_ENV=development
      `;

      const env2Content = `
MYENV=foo
DATABASE_URL=postgresql://localhost:5432/myapp
      `;

      const env1File = createTempFile(env1Content, ".env");
      const env2File = createTempFile(env2Content, ".env");

      const result = EnvResolver["loadAndMergeEnvFiles"]([env1File, env2File]);

      expect(result).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
        MYENV: "foo",
        DATABASE_URL: "postgresql://localhost:5432/myapp",
      });
    });

    it("should override variables when later files define the same key", () => {
      const env1Content = `
APP_ENV=development
DATABASE_URL=postgresql://localhost:5432/devdb
PORT=3000
      `;

      const env2Content = `
DATABASE_URL=postgresql://localhost:5432/testdb
PORT=4000
      `;

      const tempDir = ".";
      const env1File = `${tempDir}/.env.base.${Date.now()}`;
      const env2File = `${tempDir}/.env.e2e.${Date.now()}`;

      writeFileSync(env1File, env1Content);
      writeFileSync(env2File, env2Content);
      tempFiles.push(env1File, env2File);

      const result = EnvResolver["loadAndMergeEnvFiles"]([env1File, env2File]);

      expect(result).toEqual({
        APP_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/testdb",
        PORT: "4000",
      });
    });

    it("should handle mixed file types", () => {
      const envContent = `
APP_ENV=development
NODE_ENV=development
      `;

      const yamlContent = `
envs:
  - MYENV: foo
  - DATABASE_URL: postgresql://localhost:5432/myapp
      `;

      const envFile = createTempFile(envContent, ".env");
      const yamlFile = createTempFile(yamlContent, ".yaml");

      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile, yamlFile]);

      expect(result).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
        MYENV: "foo",
        DATABASE_URL: "postgresql://localhost:5432/myapp",
      });
    });

    it("should handle empty env files", () => {
      const envFile = createTempFile("", ".env");
      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile]);

      expect(result).toEqual({});
    });

    it("should handle non-existent files gracefully", () => {
      const result = EnvResolver["loadAndMergeEnvFiles"]([
        "non-existent-file.env",
      ]);

      expect(result).toEqual({});
    });

    it("should return empty object when no files provided", () => {
      const result = EnvResolver["loadAndMergeEnvFiles"]([]);

      expect(result).toEqual({});
    });

    it("should return empty object when files is undefined", () => {
      const result = EnvResolver["loadAndMergeEnvFiles"](undefined);

      expect(result).toEqual({});
    });

    it("should expand variable interpolation in .env files", () => {
      const envContent = `
HOST=localhost
PORT=5432
DATABASE_URL=\${HOST}:\${PORT}/mydb
SIMPLE_REF=$HOST
WITH_DEFAULT=\${MISSING:-fallback}
      `;

      const envFile = createTempFile(envContent, ".env");
      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile]);

      expect(result).toEqual({
        HOST: "localhost",
        PORT: "5432",
        DATABASE_URL: "localhost:5432/mydb",
        SIMPLE_REF: "localhost",
        WITH_DEFAULT: "fallback",
      });
    });

    it("should expand variables across multiple .env files", () => {
      const env1Content = `
HOST=localhost
PORT=3000
      `;

      const env2Content = `
API_URL=http://\${HOST}:\${PORT}/api
      `;

      const env1File = createTempFile(env1Content, ".env");
      const env2File = createTempFile(env2Content, ".env");

      const result = EnvResolver["loadAndMergeEnvFiles"]([env1File, env2File]);

      expect(result).toEqual({
        HOST: "localhost",
        PORT: "3000",
        API_URL: "http://localhost:3000/api",
      });
    });
  });

  describe("resolve", () => {
    it("should resolve processes with envs whitelist", () => {
      const envContent = `
APP_ENV=development
NODE_ENV=development
MYENV=foo
DATABASE_URL=postgresql://localhost:5432/myapp
      `;

      const envFile = createTempFile(envContent, ".env");
      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo $MYENV",
            env: ["MYENV", "APP_ENV"],
          },
          server: {
            name: "server",
            cmd: "node server.js",
            env: ["NODE_ENV", "PORT"],
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual(["MYENV", "APP_ENV"]);
      expect(result.native!.test.resolvedEnv).toEqual({
        MYENV: "foo",
        APP_ENV: "development",
      });

      expect(result.native!.server.env).toEqual(["NODE_ENV", "PORT"]);
      expect(result.native!.server.resolvedEnv).toEqual({
        NODE_ENV: "development",
        // PORT is not in the env file, so it won't be included
      });
    });

    it("should handle processes with no envs whitelist", () => {
      const envContent = `
APP_ENV=development
NODE_ENV=development
      `;

      const envFile = createTempFile(envContent, ".env");
      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            // No envs field
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual([]);
      expect(result.native!.test.resolvedEnv).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
      });
    });

    it("should handle processes with empty envs array", () => {
      const envContent = `
APP_ENV=development
NODE_ENV=development
      `;

      const envFile = createTempFile(envContent, ".env");
      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            env: [],
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual([]);
      expect(result.native!.test.resolvedEnv).toEqual({
        APP_ENV: "development",
        NODE_ENV: "development",
      });
    });

    it("should handle processes with existing env whitelist", () => {
      const envContent = `
CUSTOM_VAR=custom_value
      `;
      const envFile = createTempFile(envContent, ".env");

      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            env: ["CUSTOM_VAR"],
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual(["CUSTOM_VAR"]);
      expect(result.native!.test.resolvedEnv).toEqual({
        CUSTOM_VAR: "custom_value",
      });
    });

    it("should handle processes with legacy envs field", () => {
      const envContent = `
LEGACY_VAR=legacy_value
      `;
      const envFile = createTempFile(envContent, ".env");

      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            envs: ["LEGACY_VAR"],
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual([]);
      expect(result.native!.test.resolvedEnv).toEqual({
        LEGACY_VAR: "legacy_value",
      });
    });

    it("should handle processes with no env files", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            env: ["SOME_VAR"],
          },
        },
      };

      const result = EnvResolver.resolve(config);

      expect(result.native!.test.env).toEqual(["SOME_VAR"]);
      expect(result.native!.test.resolvedEnv).toEqual({});
    });
  });

  describe("getProcessEnv", () => {
    it("should return process environment variables", () => {
      const envContent = `
TEST_VAR=test_value
      `;
      const envFile = createTempFile(envContent, ".env");

      const config: ZapperConfig = {
        project: "test",
        env_files: [envFile],
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
            env: ["TEST_VAR"],
          },
        },
      };

      const result = EnvResolver.getProcessEnv(
        "test",
        EnvResolver.resolve(config),
      );

      expect(result).toEqual({
        TEST_VAR: "test_value",
      });
    });

    it("should return empty object when process has no env", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
          },
        },
      };

      const result = EnvResolver.getProcessEnv(
        "test",
        EnvResolver.resolve(config),
      );

      expect(result).toEqual({});
    });

    it("should throw error when process not found", () => {
      const config: ZapperConfig = {
        project: "test",
        native: {
          test: {
            name: "test",
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        EnvResolver.getProcessEnv("nonexistent", EnvResolver.resolve(config));
      }).toThrow("Process nonexistent not found");
    });
  });

  describe("link URL interpolation", () => {
    it("should interpolate ${VAR} in homepage URL", () => {
      const envContent = `
API_PORT=3000
      `;
      const envFile = createTempFile(envContent, ".env");

      const context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        processes: [],
        containers: [],
        tasks: [],
        homepage: "http://localhost:${API_PORT}",
        links: [],
        environments: ["default"],
        profiles: [],
        state: {},
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.homepage).toBe("http://localhost:3000");
    });

    it("should interpolate ${VAR} in top-level link URLs", () => {
      const envContent = `
API_PORT=3000
DOCS_PORT=8080
      `;
      const envFile = createTempFile(envContent, ".env");

      const context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        processes: [],
        containers: [],
        tasks: [],
        links: [
          { name: "API", url: "http://localhost:${API_PORT}" },
          { name: "Docs", url: "http://localhost:${DOCS_PORT}/docs" },
        ],
        environments: ["default"],
        profiles: [],
        state: {},
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.links[0].url).toBe("http://localhost:3000");
      expect(result.links[1].url).toBe("http://localhost:8080/docs");
    });

    it("should handle multiple variables in same URL", () => {
      const envContent = `
HOST=myapp.local
PORT=3000
      `;
      const envFile = createTempFile(envContent, ".env");

      const context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        processes: [],
        containers: [],
        tasks: [],
        links: [{ name: "API", url: "http://${HOST}:${PORT}/api" }],
        environments: ["default"],
        profiles: [],
        state: {},
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.links[0].url).toBe("http://myapp.local:3000/api");
    });

    it("should leave undefined variables as empty", () => {
      const envContent = `
PORT=3000
      `;
      const envFile = createTempFile(envContent, ".env");

      const context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        processes: [],
        containers: [],
        tasks: [],
        links: [{ name: "API", url: "http://localhost:${UNDEFINED_VAR}" }],
        environments: ["default"],
        profiles: [],
        state: {},
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.links[0].url).toBe("http://localhost:");
    });
  });

  describe("named environment sets", () => {
    it("should load default environment when no activeEnvironment is set", () => {
      const defaultEnvContent = `TEST_VALUE=default_value
NODE_ENV=development`;

      const defaultEnvFile = createTempFile(defaultEnvContent, ".env.default");

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [defaultEnvFile],
        environments: ["default"],
        processes: [
          {
            name: "echo-service",
            cmd: "echo test",
            env: ["TEST_VALUE", "NODE_ENV"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.processes[0].resolvedEnv).toEqual({
        TEST_VALUE: "default_value",
        NODE_ENV: "development",
      });
    });

    it("should load alternate environment when activeEnvironment is set", () => {
      const alternateEnvContent = `
TEST_VALUE=alternate_value
NODE_ENV=staging
      `;

      const alternateEnvFile = createTempFile(
        alternateEnvContent,
        ".env.alternate",
      );

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [alternateEnvFile], // Should pick alternate
        environments: ["default", "alternate"],
        processes: [
          {
            name: "echo-service",
            cmd: "echo test",
            env: ["TEST_VALUE", "NODE_ENV"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: "alternate",
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.processes[0].resolvedEnv).toEqual({
        TEST_VALUE: "alternate_value",
        NODE_ENV: "staging",
      });
    });

    it("should handle multiple env files in environment set", () => {
      const baseEnvContent = `
DATABASE_URL=postgresql://localhost:5432/myapp
REDIS_URL=redis://localhost:6379
      `;
      const alternateEnvContent = `
TEST_VALUE=alternate_value
NODE_ENV=staging
DATABASE_URL=postgresql://localhost:5433/myapp_staging
      `;

      const baseEnvFile = createTempFile(baseEnvContent, ".env.base");
      const alternateEnvFile = createTempFile(
        alternateEnvContent,
        ".env.alternate",
      );

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [baseEnvFile, alternateEnvFile], // Multiple files
        environments: ["default", "alternate"],
        processes: [
          {
            name: "app",
            cmd: "node app.js",
            env: ["TEST_VALUE", "NODE_ENV", "DATABASE_URL", "REDIS_URL"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: "alternate",
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.processes[0].resolvedEnv).toEqual({
        TEST_VALUE: "alternate_value",
        NODE_ENV: "staging",
        DATABASE_URL: "postgresql://localhost:5433/myapp_staging", // Should be overridden
        REDIS_URL: "redis://localhost:6379", // Should come from base
      });
    });

    it("should handle process-specific env_files overriding global environment", () => {
      const globalEnvContent = `
GLOBAL_VAR=global_value
TEST_VALUE=global_test_value
      `;
      const processEnvContent = `
TEST_VALUE=process_specific_value
PROCESS_VAR=process_value
      `;

      const globalEnvFile = createTempFile(globalEnvContent, ".env.global");
      const processEnvFile = createTempFile(processEnvContent, ".env.process");

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [globalEnvFile], // Global environment
        environments: ["default"],
        processes: [
          {
            name: "app",
            cmd: "node app.js",
            env: ["GLOBAL_VAR", "TEST_VALUE", "PROCESS_VAR"],
            env_files: [processEnvFile], // Process-specific override
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      // Process-specific env_files should completely override global env
      expect(result.processes[0].resolvedEnv).toEqual({
        TEST_VALUE: "process_specific_value",
        PROCESS_VAR: "process_value",
        // GLOBAL_VAR should NOT be present when process has env_files
      });
    });

    it("should expand environment variables within files", () => {
      const envContent = `
BASE_URL=https://api.example.com
API_VERSION=v1
FULL_API_URL=\${BASE_URL}/\${API_VERSION}
DATABASE_PREFIX=myapp
DATABASE_NAME=\${DATABASE_PREFIX}_production
      `;

      const envFile = createTempFile(envContent, ".env");

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        environments: ["default"],
        processes: [
          {
            name: "api",
            cmd: "node api.js",
            env: ["FULL_API_URL", "DATABASE_NAME"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.processes[0].resolvedEnv).toEqual({
        FULL_API_URL: "https://api.example.com/v1",
        DATABASE_NAME: "myapp_production",
      });
    });

    it("should handle empty or missing environment files gracefully", () => {
      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: ["/nonexistent/file.env"], // Missing file
        environments: ["default"],
        processes: [
          {
            name: "app",
            cmd: "node app.js",
            env: ["TEST_VAR"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      // Should not crash and should have empty resolved env
      expect(result.processes[0].resolvedEnv).toEqual({});
    });

    it("should handle containers with named environment sets", () => {
      const envContent = `
POSTGRES_DB=myapp_staging
POSTGRES_USER=staging_user
POSTGRES_PASSWORD=staging_pass
      `;

      const envFile = createTempFile(envContent, ".env.staging");

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        environments: ["default", "staging"],
        processes: [],
        containers: [
          {
            name: "database",
            image: "postgres:15",
            env: ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"],
          },
        ],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: "staging",
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.containers[0].resolvedEnv).toEqual({
        POSTGRES_DB: "myapp_staging",
        POSTGRES_USER: "staging_user",
        POSTGRES_PASSWORD: "staging_pass",
      });
    });

    it("should log environment resolution process for debugging", () => {
      const envContent = `
DEBUG_VAR=debug_value
      `;

      const envFile = createTempFile(envContent, ".env.debug");

      const context: Context = {
        projectName: "test",
        projectRoot: process.cwd(),
        envFiles: [envFile],
        environments: ["default", "debug"],
        processes: [
          {
            name: "debug-service",
            cmd: "node debug.js",
            env: ["DEBUG_VAR"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: "debug",
          activeProfile: null,
          services: {},
        },
      };

      // This test verifies the resolution works and produces logs
      // The actual logging verification would require mocking the logger
      const result = EnvResolver.resolveContext(context);

      expect(result.processes[0].resolvedEnv).toEqual({
        DEBUG_VAR: "debug_value",
      });
    });
  });

  describe("ports precedence", () => {
    it("should apply ports with highest precedence over env files", () => {
      const envContent = `
FRONTEND_PORT=1111
BACKEND_PORT=2222
FRONTEND_URL=http://localhost:\${FRONTEND_PORT}
      `;

      const envFile = createTempFile(envContent, ".env");
      const ports = {
        FRONTEND_PORT: "3333",
        BACKEND_PORT: "4444",
      };

      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile], ports);

      // Ports should override env file values
      expect(result.FRONTEND_PORT).toBe("3333");
      expect(result.BACKEND_PORT).toBe("4444");
      // Interpolation should use the port values
      expect(result.FRONTEND_URL).toBe("http://localhost:3333");
    });

    it("should interpolate ports in env file values", () => {
      const envContent = `
API_PORT=3000
FRONTEND_PORT=3001
API_URL=http://localhost:\${API_PORT}
FRONTEND_URL=http://localhost:\${FRONTEND_PORT}
      `;

      const envFile = createTempFile(envContent, ".env");
      const ports = {
        API_PORT: "5000",
        FRONTEND_PORT: "5001",
      };

      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile], ports);

      expect(result.API_URL).toBe("http://localhost:5000");
      expect(result.FRONTEND_URL).toBe("http://localhost:5001");
    });

    it("should return ports even when no env files provided", () => {
      const ports = {
        PORT_A: "1234",
        PORT_B: "5678",
      };

      const result = EnvResolver["loadAndMergeEnvFiles"](undefined, ports);

      expect(result).toEqual(ports);
    });

    it("should handle empty ports", () => {
      const envContent = `
PORT=3000
      `;

      const envFile = createTempFile(envContent, ".env");
      const result = EnvResolver["loadAndMergeEnvFiles"]([envFile], {});

      expect(result.PORT).toBe("3000");
    });
  });

  describe("resolveContext with ports from filesystem", () => {
    it("should load assigned ports and use them in env resolution", () => {
      const projectDir = createTempProjectDir({
        FRONTEND_PORT: "54321",
        BACKEND_PORT: "54322",
      });

      const envContent = `
FRONTEND_PORT=3000
BACKEND_PORT=3001
FRONTEND_URL=http://localhost:\${FRONTEND_PORT}
BACKEND_URL=http://localhost:\${BACKEND_PORT}/api
      `;

      const envFile = createTempFile(envContent, ".env");

      const context: Context = {
        projectName: "test",
        projectRoot: projectDir,
        envFiles: [envFile],
        environments: ["default"],
        processes: [
          {
            name: "frontend",
            cmd: "npm run dev",
            env: ["FRONTEND_PORT", "FRONTEND_URL"],
          },
          {
            name: "backend",
            cmd: "npm run server",
            env: ["BACKEND_PORT", "BACKEND_URL"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      // Ports should override env file values
      expect(result.processes[0].resolvedEnv?.FRONTEND_PORT).toBe("54321");
      expect(result.processes[0].resolvedEnv?.FRONTEND_URL).toBe(
        "http://localhost:54321",
      );

      expect(result.processes[1].resolvedEnv?.BACKEND_PORT).toBe("54322");
      expect(result.processes[1].resolvedEnv?.BACKEND_URL).toBe(
        "http://localhost:54322/api",
      );
    });

    it("should use assigned ports in homepage URL", () => {
      const projectDir = createTempProjectDir({
        PORT: "55555",
      });

      const envContent = `
PORT=3000
      `;

      const envFile = createTempFile(envContent, ".env");

      const context: Context = {
        projectName: "test",
        projectRoot: projectDir,
        envFiles: [envFile],
        environments: ["default"],
        processes: [],
        containers: [],
        tasks: [],
        homepage: "http://localhost:${PORT}",
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      expect(result.homepage).toBe("http://localhost:55555");
    });

    it("should work without ports.json file", () => {
      const projectDir = createTempProjectDir(); // No ports

      const envContent = `
PORT=3000
      `;

      const envFile = createTempFile(envContent, ".env");

      const context: Context = {
        projectName: "test",
        projectRoot: projectDir,
        envFiles: [envFile],
        environments: ["default"],
        processes: [
          {
            name: "app",
            cmd: "npm run dev",
            env: ["PORT"],
          },
        ],
        containers: [],
        tasks: [],
        links: [],
        profiles: [],
        state: {
          activeEnvironment: null,
          activeProfile: null,
          services: {},
        },
      };

      const result = EnvResolver.resolveContext(context);

      // Should use env file value since no ports.json
      expect(result.processes[0].resolvedEnv?.PORT).toBe("3000");
    });
  });
});
