import { z } from "zod";
import { processValidation, duplicateValidation } from "./validators";

const validNameSchema = z
  .string()
  .min(1, "Name cannot be empty")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Name must contain only alphanumeric characters, underscores, and hyphens",
  );

const stackNameSchema = z
  .string()
  .min(1, "Stack profile name cannot be empty")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Stack profile names must contain only lowercase letters, numbers, and hyphens",
  );

export const VolumeSchema = z
  .object({
    name: z.string().min(1, "Volume name cannot be empty").optional(),
    internal_dir: z
      .string()
      .min(1, "Internal directory cannot be empty")
      .startsWith("/", "Internal directory must be an absolute path"),
    mode: z.string().min(1, "Volume mode cannot be empty").optional(),
  })
  .strict();

const MountSchema = z
  .object({
    type: z.enum(["bind", "volume"]).optional(),
    source: z.string().min(1, "Mount source cannot be empty").optional(),
    target: z
      .string()
      .min(1, "Mount target cannot be empty")
      .startsWith("/", "Mount target must be an absolute path"),
    read_only: z.boolean().optional(),
    mode: z.string().min(1, "Mount mode cannot be empty").optional(),
  })
  .strict();

export const ContainerVolumeSchema = z.union([
  VolumeSchema,
  MountSchema,
  z
    .string()
    .min(1, "Volume cannot be empty")
    .refine(
      (value) => {
        const parts = value.split(":");
        if (parts.length === 1) return value.startsWith("/");
        if (parts.length === 2 && parts[0].startsWith("/")) {
          return parts[1].length > 0 && !parts[1].startsWith("/");
        }
        if (parts.length < 2 || parts.length > 3) return false;
        return (
          parts[0].length > 0 &&
          parts[1].startsWith("/") &&
          (parts.length === 2 || parts[2].length > 0)
        );
      },
      {
        message:
          "Volume string must be an absolute container path or 'source:/container/path' form",
      },
    ),
]);

const looksLikeEnvVarName = (value: string): boolean =>
  /^[A-Z_][A-Z0-9_]*$/.test(value);

const EnvFilePathSchema = z
  .string()
  .min(1, "Environment file path cannot be empty")
  .refine((value) => !looksLikeEnvVarName(value), {
    message:
      "Service env arrays define env file stacks, not variable whitelists. Move variable allowlists into a whitelist file and reference it with env: path/to/file.yaml.",
  })
  .refine((value) => !value.includes("="), {
    message:
      "Service env arrays define env file stacks and cannot contain inline KEY=value entries.",
  });

const EnvFilesArraySchema = z.array(EnvFilePathSchema);

const EnvFilesSchema = EnvFilesArraySchema;

const ProfileServicesSchema = z.union([
  z.literal("*"),
  z.array(validNameSchema),
]);

export const StackProfileSchema = z
  .object({
    env_files: EnvFilesArraySchema.default([]),
    services: ProfileServicesSchema.default("*"),
    isolate: z.boolean().default(false),
  })
  .strict();

// Service env: pass-all, service file stack, or strict whitelist file path.
const EnvSchema = z.union([
  z.literal("*"),
  z.array(EnvFilePathSchema),
  EnvFilePathSchema,
]);

// Port name schema: uppercase letters, numbers, and underscores only
const PortNameSchema = z
  .string()
  .min(1, "Port name cannot be empty")
  .regex(
    /^[A-Z0-9_]+$/,
    "Port name must contain only uppercase letters, numbers, and underscores",
  );

const DelayHealthcheckSchema = z
  .object({
    type: z.literal("delay"),
    seconds: z.number().nonnegative("Healthcheck delay cannot be negative"),
  })
  .strict();

const HttpHealthcheckSchema = z
  .object({
    type: z.literal("http"),
    url: z.string().url("Healthcheck URL must be a valid URL"),
    timeout: z
      .number()
      .positive("Healthcheck timeout must be positive")
      .optional(),
    interval: z
      .number()
      .positive("Healthcheck interval must be positive")
      .optional(),
  })
  .strict();

const HealthcheckSchema = z
  .union([
    z.number().nonnegative("Healthcheck delay cannot be negative"),
    z.string().url("Healthcheck must be a valid URL"),
    DelayHealthcheckSchema,
    HttpHealthcheckSchema,
  ])
  .optional();

const BuildSchema = z.union([
  z.string().min(1, "Build context cannot be empty"),
  z
    .object({
      context: z.string().min(1, "Build context cannot be empty"),
      dockerfile: z.string().min(1, "Dockerfile cannot be empty").optional(),
      target: z.string().min(1, "Build target cannot be empty").optional(),
      args: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
]);

const WatchSchema = z
  .array(
    z
      .object({
        path: z.string().min(1, "Watch path cannot be empty"),
        action: z.enum(["restart", "rebuild"]),
      })
      .strict(),
  )
  .optional();

const ServiceSecretSchema = z.union([
  z.string().min(1, "Secret name cannot be empty"),
  z
    .object({
      source: z.string().min(1, "Secret source cannot be empty"),
      target: z
        .string()
        .min(1, "Secret target cannot be empty")
        .startsWith("/", "Secret target must be an absolute path")
        .optional(),
    })
    .strict(),
]);

export const ProcessSchema = z
  .object({
    name: z.string().optional(),
    cmd: z.string().min(1, "Command cannot be empty"),
    cwd: z.string().optional(),
    envs: z.array(z.string()).optional(),
    env: EnvSchema.optional(),
    aliases: z.array(validNameSchema).optional(),
    resolvedEnv: z.record(z.string(), z.string()).optional(),
    source: z.string().optional(),
    repo: z.string().optional(),
    healthcheck: HealthcheckSchema,
    depends_on: z.array(validNameSchema).optional(),
  })
  .strict();

export const ContainerSchema = z
  .object({
    name: z.string().optional(),
    image: z.string().min(1, "Image cannot be empty").optional(),
    build: BuildSchema.optional(),
    ports: z.array(z.string().min(1, "Port cannot be empty")).optional(),
    env: EnvSchema.optional(),
    volumes: z.array(ContainerVolumeSchema).optional(),
    networks: z
      .array(z.string().min(1, "Network name cannot be empty"))
      .optional(),
    command: z.string().optional(),
    aliases: z.array(validNameSchema).optional(),
    resolvedEnv: z.record(z.string(), z.string()).optional(),
    healthcheck: HealthcheckSchema,
    depends_on: z.array(validNameSchema).optional(),
    watch: WatchSchema,
    secrets: z.array(ServiceSecretSchema).optional(),
  })
  .strict()
  .refine((container) => container.image || container.build, {
    message: "Docker service must define image or build",
    path: ["image"],
  });

const TopLevelVolumeSchema = z
  .object({
    name: z.string().min(1, "Volume name cannot be empty").optional(),
    external: z.boolean().optional(),
  })
  .strict();

const SecretSchema = z.union([
  z.string().min(1, "Secret file path cannot be empty"),
  z
    .object({
      file: z.string().min(1, "Secret file path cannot be empty").optional(),
      env: z.string().min(1, "Secret env var cannot be empty").optional(),
    })
    .strict()
    .refine((secret) => !!secret.file !== !!secret.env, {
      message: "Secret must define exactly one of file or env",
    }),
]);

export const TaskCmdSchema = z.union([
  z.string(),
  z
    .object({
      cmd: z.string().min(1, "Command cannot be empty"),
      silent: z.boolean().optional(),
      interactive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      task: z.string().min(1, "Task name cannot be empty"),
      vars: z.record(validNameSchema, z.string()).optional(),
      silent: z.boolean().optional(),
    })
    .strict(),
]);

export const TaskPreconditionSchema = z.union([
  z.string().min(1, "Precondition cannot be empty"),
  z
    .object({
      sh: z.string().min(1, "Precondition command cannot be empty"),
      msg: z.string().min(1, "Precondition message cannot be empty").optional(),
    })
    .strict(),
]);

export const TaskParamSchema = z
  .object({
    name: validNameSchema,
    desc: z.string().optional(),
    default: z.string().optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const TaskSchema = z
  .object({
    name: z.string().optional(),
    desc: z.string().optional(),
    cmds: z.array(TaskCmdSchema).min(1, "Task must have at least one command"),
    env: EnvSchema.optional(),
    cwd: z.string().optional(),
    aliases: z.array(validNameSchema).optional(),
    resolvedEnv: z.record(z.string(), z.string()).optional(),
    params: z.array(TaskParamSchema).optional(),
    silent: z.boolean().optional(),
    interactive: z.boolean().optional(),
    preconditions: z.array(TaskPreconditionSchema).optional(),
    status: z
      .array(z.string().min(1, "Status command cannot be empty"))
      .optional(),
  })
  .strict();

export const TaskDelimitersSchema = z
  .tuple([z.string().min(1), z.string().min(1)])
  .optional();

export const LinkSchema = z
  .object({
    name: z
      .string()
      .min(1, "Link name cannot be empty")
      .max(100, "Link name cannot exceed 100 characters"),
    url: z.string().min(1, "Link URL cannot be empty"),
  })
  .strict();

export const ZapperConfigSchema = processValidation(
  duplicateValidation(
    z
      .object({
        project: validNameSchema,
        env: EnvFilesSchema.optional(),
        env_files: EnvFilesSchema.optional(),
        profiles: z.record(stackNameSchema, StackProfileSchema).optional(),
        ports: z.array(PortNameSchema).optional(),
        init_task: validNameSchema.optional(),
        git_method: z.enum(["http", "ssh", "cli"]).optional(),
        task_delimiters: TaskDelimitersSchema,
        native: z.record(validNameSchema, ProcessSchema).optional(),
        docker: z.record(validNameSchema, ContainerSchema).optional(),
        containers: z.record(validNameSchema, ContainerSchema).optional(),
        volumes: z.record(validNameSchema, TopLevelVolumeSchema).optional(),
        secrets: z.record(validNameSchema, SecretSchema).optional(),
        processes: z.array(ProcessSchema).optional(),
        tasks: z.record(validNameSchema, TaskSchema).optional(),
        homepage: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
        links: z.array(LinkSchema).optional(),
      })
      .strict()
      .refine((config) => !(config.env && config.env_files), {
        message: "Use either root env or env_files, not both",
        path: ["env"],
      }),
  ),
);

export const ServiceStateSchema = z.object({
  startPid: z.number().optional(),
  startRequestedAt: z.string().optional(),
});

export const StoredVolumeSchema = z
  .object({
    service: z.string().min(1),
    internal_dir: z.string().min(1).startsWith("/"),
  })
  .strict();

export const StackStateSchema = z
  .object({
    stackId: z.string().min(1),
    profile: stackNameSchema,
    ports: z.record(z.string(), z.string()).optional(),
    volumes: z.record(z.string(), StoredVolumeSchema).optional(),
  })
  .strict();

export const ZapperStateSchema = z.object({
  selectedProfile: stackNameSchema.optional(),
  stacks: z.record(stackNameSchema, StackStateSchema).optional(),
  defaultInstance: z.string().optional(),
  instances: z
    .record(
      z.string(),
      z.object({
        id: z.string(),
        label: z.string().max(100).optional(),
        ports: z.record(z.string(), z.string()).optional(),
        volumes: z.record(z.string(), StoredVolumeSchema).optional(),
      }),
    )
    .optional(),
  instanceId: z.string().optional(),
  mode: z.enum(["normal", "isolate"]).optional(),
  ports: z.record(z.string(), z.string()).optional(),
  lastUpdated: z.string().optional(),
});

export type Process = z.infer<typeof ProcessSchema>;
export type Container = z.infer<typeof ContainerSchema>;
export type Volume = z.infer<typeof VolumeSchema>;
export type TopLevelVolume = z.infer<typeof TopLevelVolumeSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskParam = z.infer<typeof TaskParamSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type StackProfile = z.infer<typeof StackProfileSchema>;
export type ZapperConfig = z.infer<typeof ZapperConfigSchema>;
export type ServiceState = z.infer<typeof ServiceStateSchema>;
export type StoredVolume = z.infer<typeof StoredVolumeSchema>;
export type StackState = z.infer<typeof StackStateSchema>;
export type ZapperState = z.infer<typeof ZapperStateSchema>;

// Resolved types after whitelist resolution - env fields are guaranteed to be arrays
export type ResolvedProcess = Omit<Process, "env"> & {
  env?: string[];
};

export type ResolvedContainer = Omit<Container, "env"> & {
  env?: string[];
};

export type ResolvedTask = Omit<Task, "env"> & {
  env?: string[];
};

export type ResolvedZapperConfig = Omit<
  ZapperConfig,
  "native" | "docker" | "containers" | "processes" | "tasks"
> & {
  native?: Record<string, ResolvedProcess>;
  docker?: Record<string, ResolvedContainer>;
  containers?: Record<string, ResolvedContainer>;
  processes?: ResolvedProcess[];
  tasks?: Record<string, ResolvedTask>;
};
