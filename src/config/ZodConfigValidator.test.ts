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
          env: ["POSTGRES_DB", "POSTGRES_USER"],
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

  it("should validate correct config with both native and docker", () => {
    const config = {
      project: "myproj",
      native: {
        frontend: {
          cmd: "npm run dev",
          cwd: "./frontend",
          env: ["PORT", "API_URL"],
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

  it("should validate top-level homepage and links", () => {
    const config = {
      project: "myproj",
      native: {
        app: {
          cmd: "npm run dev",
        },
      },
      homepage: "http://localhost:3000",
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

  describe("whitelist functionality", () => {
    it("should validate and resolve whitelists correctly", () => {
      const config = {
        project: "test-whitelists",
        whitelists: {
          "frontend-vars": ["PORT", "API_URL"],
          "backend-vars": ["DATABASE_URL", "JWT_SECRET"],
        },
        native: {
          frontend: {
            cmd: "npm start",
            env: "frontend-vars",
          },
          backend: {
            cmd: "npm run server",
            env: "backend-vars",
          },
        },
        docker: {
          database: {
            image: "postgres:15",
            env: "frontend-vars",
          },
        },
        tasks: {
          build: {
            cmds: ["npm run build"],
            env: "backend-vars",
          },
        },
      };

      const result = ZodConfigValidator.validate(config);

      expect(result.native?.frontend.env).toEqual(["PORT", "API_URL"]);
      expect(result.native?.backend.env).toEqual([
        "DATABASE_URL",
        "JWT_SECRET",
      ]);
      expect(result.docker?.database.env).toEqual(["PORT", "API_URL"]);
      expect(result.tasks?.build.env).toEqual(["DATABASE_URL", "JWT_SECRET"]);
      expect(result.native?.frontend.name).toBe("frontend");
      expect(result.native?.backend.name).toBe("backend");
    });

    it("should throw error for invalid whitelist reference", () => {
      const config = {
        project: "test-invalid-whitelist",
        whitelists: {
          "valid-vars": ["PORT"],
        },
        native: {
          app: {
            cmd: "npm start",
            env: "invalid-whitelist",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow(
        "Process 'app' references unknown whitelist 'invalid-whitelist'",
      );
    });

    it("should throw error when string env reference exists but no whitelists defined", () => {
      const config = {
        project: "test-no-whitelists",
        native: {
          app: {
            cmd: "npm start",
            env: "some-whitelist",
          },
        },
      };

      expect(() => {
        ZodConfigValidator.validate(config);
      }).toThrow(
        "Environment whitelist references found but no whitelists defined",
      );
    });

    it("should work with mixed array and string env values", () => {
      const config = {
        project: "test-mixed-env",
        whitelists: {
          "common-vars": ["PORT", "NODE_ENV"],
        },
        native: {
          app1: {
            cmd: "npm start",
            env: "common-vars",
          },
          app2: {
            cmd: "npm run dev",
            env: ["DATABASE_URL", "API_KEY"],
          },
        },
      };

      const result = ZodConfigValidator.validate(config);

      expect(result.native?.app1.env).toEqual(["PORT", "NODE_ENV"]);
      expect(result.native?.app2.env).toEqual(["DATABASE_URL", "API_KEY"]);
    });

    it("should validate whitelist names follow naming rules", () => {
      const config = {
        project: "test-invalid-name",
        whitelists: {
          "invalid name with spaces": ["PORT"],
        },
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

    it("should validate env_files as environment map with default", () => {
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
      }).not.toThrow();
    });

    it("should allow env_files map without default", () => {
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
      }).not.toThrow();
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
