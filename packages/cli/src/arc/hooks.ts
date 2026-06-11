import { spawnSync } from "node:child_process";
import { ModuleInstance } from "./modules";
import { ModuleHook } from "./schemas";
import { Deployment } from "./render";
import { renderRefs, maskSecrets, RefResolver } from "./template";

// Module-declared hook commands: zap substitutes and runs, understands
// nothing. Behavior lives in the manifest, not in engine code.
export interface HookRunContext {
  projectDir: string;
  creds: Record<string, string>;
  deployment: Deployment;
  // Root output values, available to post-apply hooks as {{output.*}}.
  outputs?: Record<string, string>;
}

type Phase = "pre-apply" | "post-apply";

function refResolver(
  instance: ModuleInstance,
  phase: Phase,
  ctx: HookRunContext,
): RefResolver {
  return (namespace, key) => {
    if (namespace === "params") {
      const value = ctx.deployment.hookParams[instance.key]?.[key];
      return value === undefined ? "" : String(value);
    }

    if (namespace === "cred") {
      const value = ctx.creds[key];

      if (value === undefined) {
        throw new Error(`credential ${key} is not set`);
      }

      return value;
    }

    if (namespace === "output") {
      if (phase !== "post-apply") {
        throw new Error(`{{output.${key}}} is only available post-apply`);
      }

      const value = ctx.outputs?.[`${instance.tfName}_${key}`];

      if (value === undefined) {
        throw new Error(
          `output '${key}' of module '${instance.ref}' was not produced by apply`,
        );
      }

      return value;
    }

    throw new Error(`unknown reference namespace '${namespace}'`);
  };
}

async function runHook(
  instance: ModuleInstance,
  hook: ModuleHook,
  phase: Phase,
  ctx: HookRunContext,
): Promise<void> {
  const what = `hook '${hook.name ?? hook.task ?? "run"}' (${phase}, ${instance.kind} '${instance.key}')`;
  const resolve = refResolver(instance, phase, ctx);

  const serviceEnv = ctx.deployment.serviceEnv[instance.key] ?? {};

  const declaredCreds = Object.fromEntries(
    instance.manifest.credentials.map((cred) => [
      cred.name,
      ctx.creds[cred.name] ?? "",
    ]),
  );

  const hookEnv = Object.fromEntries(
    Object.entries(hook.env).map(([key, value]) => [
      key,
      renderRefs(value, resolve, `${what} env ${key}`),
    ]),
  );

  // Hook processes get the service's deploy env, the module's declared
  // credentials, and the env map as JSON for scripts that need to enumerate
  // it. Local dev env is whatever the operator shell carries — arc injects
  // none of it.
  const env = {
    ...process.env,
    ...serviceEnv,
    ...declaredCreds,
    ARC_SERVICE_ENV: JSON.stringify(serviceEnv),
    ...hookEnv,
  };

  console.log(`\n${what}`);

  if (hook.task) {
    await runZapTask(hook.task, ctx.projectDir, {
      ...serviceEnv,
      ...declaredCreds,
      ARC_SERVICE_ENV: JSON.stringify(serviceEnv),
      ...hookEnv,
    });

    return;
  }

  const command = renderRefs(hook.run!, resolve, what);
  const secrets = Object.values(ctx.creds);

  console.log(`> ${maskSecrets(command, secrets)}`);

  const result = spawnSync("bash", ["-c", command], {
    cwd: ctx.projectDir,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${what} failed (exit ${result.status})`);
  }
}

// task: hooks reuse the builds developers run — the project's own zap task,
// with the deploy env injected and the local dev env suppressed (each task's
// resolvedEnv from env files is replaced wholesale).
async function runZapTask(
  taskName: string,
  projectDir: string,
  env: Record<string, string>,
): Promise<void> {
  const { Zapper } = await import("../core/Zapper");
  const zapper = new Zapper();
  await zapper.loadConfig();
  const context = zapper.getContext();

  if (!context) {
    throw new Error("Failed to load the project's zap config for task hook");
  }

  const resolved = zapper.resolveTaskName(taskName);

  if (!resolved) {
    throw new Error(`task hook references unknown zap task '${taskName}'`);
  }

  const tasks = Object.fromEntries(
    context.tasks.map((task) => [task.name, { ...task, resolvedEnv: env }]),
  );

  const { TaskRunner } = await import("../core/tasks/TaskRunner");

  await TaskRunner.runTask(tasks, projectDir, resolved, {
    delimiters: context.taskDelimiters,
    context: {
      projectName: context.projectName,
      instanceKey: context.instanceKey,
    },
  });
}

export async function runHooks(
  phase: Phase,
  ctx: HookRunContext,
): Promise<void> {
  for (const instance of ctx.deployment.instances) {
    for (const hook of instance.manifest.hooks[phase]) {
      await runHook(instance, hook, phase, ctx);
    }
  }
}

// Early errors: a used module's declared credentials must exist before any
// terraform or hook runs.
export function requireModuleCredentials(
  instances: ModuleInstance[],
  creds: Record<string, string>,
  credentialsPath: string,
): void {
  const missing: string[] = [];

  for (const instance of instances) {
    for (const cred of instance.manifest.credentials) {
      if (!creds[cred.name]) {
        missing.push(
          `${cred.name} — ${cred.why} (module '${instance.ref}', ${instance.kind} '${instance.key}')`,
        );
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing operator credentials. Add to ${credentialsPath}:\n  ${missing.join("\n  ")}`,
    );
  }
}
