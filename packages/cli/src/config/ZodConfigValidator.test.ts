import { describe, it, expect } from "vitest";
import { ZodConfigValidator } from "./ZodConfigValidator";

describe("ZodConfigValidator", () => {
  it("should validate correct config with native", () => {
    const config = {
      project: "myproj",
      native: {
        test: {
          cmd: "echo 'hello world'",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate correct config with docker", () => {
    const config = {
      project: "myproj",
      docker: {
        database: {
          image: "postgres:15",
          ports: ["5432:5432"],
          env: "*",
          volumes: [
            {
              name: "postgres_data",
              internal_dir: "/var/lib/postgresql/data",
            },
          ],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate docker volumes with generated and explicit names", () => {
    const config = {
      project: "myproj",
      docker: {
        database: {
          image: "postgres:15",
          volumes: [
            "/var/lib/postgresql/data",
            "/var/lib/postgresql/wal:ro",
            {
              internal_dir: "/var/lib/postgresql/config",
              mode: "ro",
            },
            "postgres_logs:/var/log/postgresql:ro",
            "./init.sql:/docker-entrypoint-initdb.d/init.sql",
          ],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate Docker build, watch, secrets, and rich mounts", () => {
    const config = {
      project: "myproj",
      volumes: {
        cache: { name: "shared-cache" },
      },
      secrets: {
        db_password: { env: "POSTGRES_PASSWORD" },
      },
      docker: {
        api: {
          build: {
            context: "./api",
            dockerfile: "Dockerfile.dev",
            target: "dev",
            args: {
              NODE_ENV: "development",
            },
          },
          volumes: [
            {
              type: "bind",
              source: "./api",
              target: "/app",
              read_only: true,
            },
            {
              type: "volume",
              source: "cache",
              target: "/cache",
            },
          ],
          watch: [{ path: "./api/src", action: "rebuild" }],
          secrets: ["db_password"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate correct config with both native and docker", () => {
    const config = {
      project: "myproj",
      native: {
        frontend: {
          cmd: "npm run dev",
          cwd: "./frontend",
          env: "*",
        },
      },
      docker: {
        database: {
          image: "postgres:15",
          ports: ["5432:5432"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate healthcheck object forms", () => {
    const config = {
      project: "myproj",
      native: {
        api: {
          cmd: "npm run dev",
          healthcheck: {
            type: "http",
            url: "http://localhost:3000/health",
            timeout: 60,
            interval: 2,
          },
        },
        worker: {
          cmd: "npm run worker",
          healthcheck: {
            type: "delay",
            seconds: 5,
          },
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should reject invalid healthcheck object forms", () => {
    const config = {
      project: "myproj",
      native: {
        api: {
          cmd: "npm run dev",
          healthcheck: {
            type: "http",
            url: "not-a-url",
          },
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow();
  });

  it("should validate correct config with legacy processes (backward compatibility)", () => {
    const config = {
      project: "myproj",
      processes: [
        {
          name: "test",
          cmd: "echo 'hello world'",
        },
      ],
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should allow legacy envs field for backward compatibility", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
          envs: ["PORT", "API_URL"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate top-level homepage, notes, and links", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
        },
      },
      homepage: "http://localhost:3000",
      notes: "Use API at ${API_URL}",
      links: [
        {
          name: "Docs",
          url: "http://localhost:3000/docs",
        },
      ],
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should validate task runner options", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
        },
      },
      tasks: {
        build: {
          silent: true,
          interactive: false,
          preconditions: [
            'test -n "$DATABASE_URL"',
            { sh: "test -f package.json", msg: "Missing package.json" },
          ],
          status: ["test -d node_modules"],
          cmds: [
            { cmd: "pnpm install", silent: true },
            {
              task: "compile",
              vars: { target: "production" },
              silent: true,
            },
          ],
        },
        compile: {
          params: [{ name: "target", required: true }],
          cmds: [{ cmd: "pnpm build --target={{target}}", interactive: true }],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should reject config without project", () => {
    const config = {
      native: {
        test: {
          cmd: "echo 'hello world'",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: project: Invalid input: expected string, received undefined",
    );
  });

  it("should reject config with invalid project name", () => {
    const config = {
      project: "invalid name!",
      native: {
        test: {
          cmd: "echo 'hello world'",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: project: Name must contain only alphanumeric characters, underscores, and hyphens",
    );
  });

  it("should reject config without any processes", () => {
    const config = {
      project: "myproj",
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: No processes defined. Define at least one in native, docker, or processes",
    );
  });

  it("should reject config with duplicate service names", () => {
    const config = {
      project: "myproj",
      native: {
        test: {
          cmd: "echo 'hello world'",
        },
      },
      docker: {
        test: {
          image: "nginx",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: Duplicate service identifier(s): test. Names and aliases must be globally unique across native and docker",
    );
  });

  it("should list all duplicated service identifiers", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
          aliases: ["api", "shared"],
        },
      },
      docker: {
        app: {
          image: "nginx",
          aliases: ["shared", "api"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: Duplicate service identifier(s): api, app, shared. Names and aliases must be globally unique across native and docker",
    );
  });

  it("should reject config with invalid process command", () => {
    const config = {
      project: "myproj",
      native: {
        test: {
          cmd: "",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: native.test.cmd: Command cannot be empty",
    );
  });

  it("should reject config with unknown top-level field", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
        },
      },
      unknown: "value",
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow('Configuration validation failed: Unrecognized key: "unknown"');
  });

  it("should reject config with unknown process field", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
          unknown_field: true,
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      'Configuration validation failed: native.app: Unrecognized key: "unknown_field"',
    );
  });

  it("should reject service-level link field", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
          link: "http://localhost:3000",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      'Configuration validation failed: native.app: Unrecognized key: "link"',
    );
  });

  it("should reject config with invalid docker image", () => {
    const config = {
      project: "myproj",
      docker: {
        test: {
          image: "",
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: docker.test.image: Image cannot be empty",
    );
  });

  it("should reject config with invalid volume path", () => {
    const config = {
      project: "myproj",
      docker: {
        test: {
          image: "nginx",
          volumes: [
            {
              name: "data",
              internal_dir: "relative/path",
            },
          ],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: docker.test.volumes.0.internal_dir: Internal directory must be an absolute path",
    );
  });

  it("should reject path-only generated volumes with relative container paths", () => {
    const config = {
      project: "myproj",
      docker: {
        test: {
          image: "nginx",
          volumes: ["data"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: docker.test.volumes.0: Volume string must be an absolute container path or 'source:/container/path' form",
    );
  });

  it("should reject config with invalid task commands", () => {
    const config = {
      project: "myproj",
      tasks: {
        test: {
          cmds: [],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow(
      "Configuration validation failed: tasks.test.cmds: Task must have at least one command, No processes defined. Define at least one in native, docker, or processes",
    );
  });

  it("should validate config with tasks and processes", () => {
    const config = {
      project: "myproj",
      native: {
        test: {
          cmd: "echo hello",
        },
      },
      tasks: {
        test: {
          cmds: ["echo hello", { task: "other-task" }],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  it("should reject config when init_task references unknown task", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "echo hello",
        },
      },
      init_task: "seed",
      tasks: {
        build: {
          cmds: ["echo build"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).toThrow("init_task references unknown task 'seed'");
  });

  it("should accept config when init_task references a defined task", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "echo hello",
        },
      },
      init_task: "seed",
      tasks: {
        seed: {
          cmds: ["echo seed"],
        },
      },
    };

    expect(() => {
      ZodConfigValidator.validate(config);
    }).not.toThrow();
  });

  describe("environment routing", () => {
    it("should validate service file stacks and whitelist file paths", () => {
      const config = {
        project: "test-env-routing",
        env: [".env.local"],
        native: {
          frontend: {
            cmd: "npm start",
            env: "*",
          },
          backend: {
            cmd: "npm run server",
            env: [".env.backend", ".env.backend.user"],
          },
        },
        docker: {
          database: {
            image: "postgres:15",
            env: ".zap/env/database.yaml",
          },
        },
        tasks: {
          build: {
            cmds: ["npm run build"],
            env: ".zap/env/build.yaml",
          },
        },
      };

      const result = ZodConfigValidator.validate(config);

      expect(result.native?.frontend.env).toEqual("*");
      expect(result.native?.backend.env).toEqual([
        ".env.backend",
        ".env.backend.user",
      ]);
      expect(result.docker?.database.env).toEqual(".zap/env/database.yaml");
      expect(result.tasks?.build.env).toEqual(".zap/env/build.yaml");
      expect(result.native?.frontend.name).toBe("frontend");
      expect(result.native?.backend.name).toBe("backend");
    });

    it("should reject inline whitelists in zap.yaml", () => {
      const config = {
        project: "test-inline-whitelists",
        whitelists: {
          "backend-vars": ["DATABASE_URL"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "*",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow('Unrecognized key: "whitelists"');
    });

    it("should allow arbitrary file path strings for string env values", () => {
      const config = {
        project: "test-loose-string-env",
        native: {
          app: {
            cmd: "npm start",
            env: "some-whitelist",
          },
        },
      };

      const result = ZodConfigValidator.validate(config);

      expect(result.native?.app.env).toBe("some-whitelist");
    });

    it("should allow dotenv filenames with additional suffixes", () => {
      const config = {
        project: "test-dotenv-suffix",
        native: {
          app: {
            cmd: "npm start",
            env: [".env.something"],
          },
        },
      };

      const result = ZodConfigValidator.validate(config);

      expect(result.native?.app.env).toEqual([".env.something"]);
    });

    it("should reject inline variable arrays", () => {
      const config = {
        project: "test-inline-env-array",
        native: {
          app: {
            cmd: "npm run dev",
            env: ["DATABASE_URL", "API_KEY"],
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow("Service env arrays define env file stacks");
    });

    it("should reject root env and env_files together", () => {
      const config = {
        project: "test-root-env-conflict",
        env: [".env"],
        env_files: [".env"],
        native: {
          app: {
            cmd: "npm start",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });

    it("should reject env_files as environment map with default", () => {
      const config = {
        project: "myproj",
        env_files: {
          default: [".env"],
          prod_dbs: [".env", ".env.prod-dbs"],
        },
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });

    it("should reject env_files map without default", () => {
      const config = {
        project: "myproj",
        env_files: {
          prod_dbs: [".env", ".env.prod-dbs"],
        },
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });
  });

  describe("ports field", () => {
    it("should validate ports array with valid names", () => {
      const config = {
        project: "myproj",
        ports: ["FRONTEND_PORT", "BACKEND_PORT", "DB_PORT"],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).not.toThrow();
    });

    it("should allow ports with numbers and underscores", () => {
      const config = {
        project: "myproj",
        ports: ["PORT_1", "PORT_2", "API_PORT_V2"],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).not.toThrow();
    });

    it("should reject ports with lowercase letters", () => {
      const config = {
        project: "myproj",
        ports: ["frontend_port"],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });

    it("should reject ports with hyphens", () => {
      const config = {
        project: "myproj",
        ports: ["FRONTEND-PORT"],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });

    it("should reject empty port names", () => {
      const config = {
        project: "myproj",
        ports: [""],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow();
    });

    it("should allow empty ports array", () => {
      const config = {
        project: "myproj",
        ports: [],
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).not.toThrow();
    });

    it("should allow config without ports field", () => {
      const config = {
        project: "myproj",
        native: {
          test: {
            cmd: "echo hello",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).not.toThrow();
    });
  });
});
