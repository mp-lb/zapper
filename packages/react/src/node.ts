import {
  DownCommand,
  ProfilesCommand,
  RestartCommand,
  StatusCommand,
  UpCommand,
  Zapper,
  type CommandResult,
  type ProjectLinkResult,
  type Zapper as ZapperInstance,
} from "@mp-lb/zapper-sdk";
import { countServices } from "./counts";
import type {
  ZapperAction,
  ZapperProjectActionResult,
  ZapperProjectClient,
  ZapperProjectQuery,
  ZapperProjectSnapshot,
} from "./types";

function getLinks(zapper: ZapperInstance): ProjectLinkResult[] {
  const context = zapper.getContext();
  if (!context) throw new Error("Context not loaded");

  return [
    ...(context.homepage
      ? [{ name: "Home", url: context.homepage, isHomepage: true }]
      : []),
    ...context.links.map((link) => ({
      name: link.name,
      url: link.url,
      isHomepage: false,
    })),
  ];
}

function commandContext(zapper: ZapperInstance, query: ZapperProjectQuery) {
  return {
    zapper,
    options: {
      config: query.dir,
      profile: query.profile,
      json: true,
      force: true,
      __command: "react",
    },
  };
}

async function loadProject(query: ZapperProjectQuery): Promise<ZapperInstance> {
  const zapper = new Zapper();
  await zapper.loadConfig(query.dir, {
    profile: query.profile,
    __command: "status",
  });

  return zapper;
}

async function readSnapshot(
  query: ZapperProjectQuery,
): Promise<ZapperProjectSnapshot> {
  const zapper = await loadProject(query);
  const context = zapper.getContext();

  if (!context) {
    throw new Error("Context not loaded");
  }

  const statusResult = await new StatusCommand().execute(
    commandContext(zapper, query),
  );

  if (statusResult.kind !== "status") {
    throw new Error("Unexpected Zapper status result");
  }

  return {
    projectName: context.projectName,
    projectRoot: context.projectRoot,
    homepage: context.homepage,
    links: getLinks(zapper),
    status: statusResult.statusResult,
    counts: countServices(statusResult.statusResult),
    profiles: {
      configured: context.profiles,
      current: context.profile?.name,
      selected: context.state.selectedProfile,
      override: query.profile,
    },
    refreshedAt: new Date().toISOString(),
  };
}

function actionReport(
  result: CommandResult | void,
): ZapperProjectActionResult["report"] {
  if (result?.kind === "services.action") return result.report;
  return undefined;
}

async function runServiceAction(
  query: ZapperProjectQuery,
  action: ZapperAction,
): Promise<ZapperProjectActionResult> {
  const zapper = await loadProject(query);
  const context = commandContext(zapper, query);

  const command =
    action === "up"
      ? new UpCommand()
      : action === "down"
        ? new DownCommand()
        : new RestartCommand();

  const result = await command.execute(context);
  const snapshot = await readSnapshot(query);

  return {
    action,
    report: actionReport(result),
    snapshot,
  };
}

async function runProfileAction(
  query: ZapperProjectQuery,
  args: string[],
): Promise<ZapperProjectActionResult> {
  const zapper = await loadProject(query);
  await new ProfilesCommand().execute({
    ...commandContext(zapper, query),
    service: args,
  });

  const snapshot = await readSnapshot(query);

  return {
    action: args[0] === "use" ? "profile.select" : "profile.reset",
    report: undefined,
    snapshot,
  };
}

export function createZapperNodeClient(): ZapperProjectClient {
  return {
    getProject(query) {
      return readSnapshot(query);
    },
    up(query) {
      return runServiceAction(query, "up");
    },
    down(query) {
      return runServiceAction(query, "down");
    },
    restart(query) {
      return runServiceAction(query, "restart");
    },
    selectProfile(query, profile) {
      return runProfileAction(query, ["use", profile]);
    },
    resetProfile(query) {
      return runProfileAction(query, ["reset"]);
    },
  };
}
