import { z } from "zod";
import { processValidation, duplicateValidation } from "./validators";

const validNameSchema = z
  .string()
  .min(1, "Name cannot be empty")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Name must contain only alphanumeric characters, underscores, and hyphens",
  );

export const VolumeSchema = z
  .object({
    name: z.string().min(1, "Volume name cannot be empty"),
    internal_dir: z
      .string()
      .min(1, "Internal directory cannot be empty")
      .startsWith("/", "Internal directory must be an absolute path"),
  })
  .strict();

export const ContainerVolumeSchema = z.union([
  VolumeSchema,
  z
    .string()
    .regex(
      /^[^:]+:[^:]+$/,
      "Volume string must be in 'name:/container/path' form",
    ),
]);

// Union type for env - can be array of strings or string reference to whitelist
const EnvSchema = z.union([
  z.array(z.string()),
  z.string().min(1, "Environment whitelist reference cannot be empty"),
]);

const EnvFilesArraySchema = z.array(
  z.string().min(1, "Environment file path cannot be empty"),
);

const EnvFilesMapSchema = z.record(validNameSchema, EnvFilesArraySchema);

const EnvFilesSchema = z.union([EnvFilesArraySchema, EnvFilesMapSchema]);

// Port name schema: uppercase letters, numbers, and underscores only
const PortNameSchema = z
  .string()
  .min(1, "Port name cannot be empty")
  .regex(
    /^[A-Z0-9_]+$/,
    "Port name must contain only uppercase letters, numbers, and underscores",
  );

const HealthcheckSchema = z
  .union([z.number(), z.string().url("Healthcheck must be a valid URL")])
  .optional();

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
    env_files: z.array(z.string()).optional(),
    profiles: z
      .array(z.string().min(1, "Profile name cannot be empty"))
      .optional(),
    healthcheck: HealthcheckSchema,
    depends_on: z.array(validNameSchema).optional(),
  })
  .strict();

export const ContainerSchema = z
  .object({
    name: z.string().optional(),
    image: z.string().min(1, "Image cannot be empty"),
    ports: z.array(z.string().min(1, "Port cannot be empty")).optional(),
    env: EnvSchema.optional(),
    volumes: z.array(ContainerVolumeSchema).optional(),
    networks: z
      .array(z.string().min(1, "Network name cannot be empty"))
      .optional(),
    command: z.string().optional(),
    aliases: z.array(validNameSchema).optional(),
    resolvedEnv: z.record(z.string(), z.string()).optional(),
    profiles: z
      .array(z.string().min(1, "Profile name cannot be empty"))
      .optional(),
    healthcheck: HealthcheckSchema,
    depends_on: z.array(validNameSchema).optional(),
  })
  .strict();

export const TaskCmdSchema = z.union([
  z.string(),
  z
    .object({
      task: z.string().min(1, "Task name cannot be empty"),
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
    env_files: z.array(z.string()).optional(),
    params: z.array(TaskParamSchema).optional(),
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
        env_files: EnvFilesSchema.optional(),
        ports: z.array(PortNameSchema).optional(),
        init_task: validNameSchema.optional(),
        git_method: z.enum(["http", "ssh", "cli"]).optional(),
        task_delimiters: TaskDelimitersSchema,
        whitelists: z
          .record(
            validNameSchema,
            z.array(z.string().min(1, "Environment variable cannot be empty")),
          )
          .optional(),
        native: z.record(validNameSchema, ProcessSchema).optional(),
        docker: z.record(validNameSchema, ContainerSchema).optional(),
        containers: z.record(validNameSchema, ContainerSchema).optional(),
        processes: z.array(ProcessSchema).optional(),
        tasks: z.record(validNameSchema, TaskSchema).optional(),
        homepage: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
        links: z.array(LinkSchema).optional(),
      })
      .strict(),
  ),
);

export const ServiceStateSchema = z.object({
  startPid: z.number().optional(),
  startRequestedAt: z.string().optional(),
});

export const ZapperStateSchema = z.object({
  activeProfile: z.string().optional(),
  activeEnvironment: z.string().optional(),
  defaultInstance: z.string().optional(),
  instances: z
    .record(
      z.string(),
      z.object({
        id: z.string(),
        ports: z.record(z.string(), z.string()).optional(),
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
export type Task = z.infer<typeof TaskSchema>;
export type TaskParam = z.infer<typeof TaskParamSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type ZapperConfig = z.infer<typeof ZapperConfigSchema>;
export type ServiceState = z.infer<typeof ServiceStateSchema>;
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
