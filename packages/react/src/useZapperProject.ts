import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalZapperClient } from "./context";
import type {
  UseZapperProjectOptions,
  UseZapperProjectResult,
  ZapperAction,
  ZapperProjectActionResult,
  ZapperProjectSnapshot,
} from "./types";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useZapperProject(
  options: UseZapperProjectOptions,
): UseZapperProjectResult {
  const contextClient = useOptionalZapperClient();
  const client = options.client ?? contextClient;
  const enabled = options.enabled ?? true;

  const query = useMemo(
    () => ({ dir: options.dir, profile: options.profile }),
    [options.dir, options.profile],
  );

  const [data, setData] = useState<ZapperProjectSnapshot>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [pendingAction, setPendingAction] =
    useState<UseZapperProjectResult["pendingAction"]>();

  const requestId = useRef(0);
  const hasData = useRef(false);

  const requireClient = useCallback(() => {
    if (!client) {
      throw new Error(
        "No Zapper client configured. Wrap your app in <ZapperProvider client={...}> or pass a client to useZapperProject().",
      );
    }

    return client;
  }, [client]);

  const refresh = useCallback(async () => {
    if (!enabled) return undefined;

    const activeClient = requireClient();
    const id = requestId.current + 1;
    requestId.current = id;

    setRefreshing(true);
    if (!hasData.current) setLoading(true);

    try {
      const snapshot = await activeClient.getProject(query);

      if (requestId.current === id) {
        hasData.current = true;
        setData(snapshot);
        setError(undefined);
      }

      return snapshot;
    } catch (caught) {
      const nextError = toError(caught);

      if (requestId.current === id) {
        setError(nextError);
      }

      throw nextError;
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled, query, requireClient]);

  const runAction = useCallback(
    async (
      action: ZapperAction | "profile.select" | "profile.reset",
      run: () => Promise<ZapperProjectActionResult>,
    ) => {
      const id = requestId.current + 1;
      requestId.current = id;

      setPendingAction(action);
      setError(undefined);

      try {
        const result = await run();

        if (requestId.current === id) {
          hasData.current = true;
          setData(result.snapshot);
          setError(undefined);
        }

        return result;
      } catch (caught) {
        const nextError = toError(caught);

        if (requestId.current === id) {
          setError(nextError);
        }

        throw nextError;
      } finally {
        if (requestId.current === id) {
          setPendingAction(undefined);
        }
      }
    },
    [],
  );

  const up = useCallback(
    () => runAction("up", () => requireClient().up(query)),
    [query, requireClient, runAction],
  );

  const down = useCallback(
    () => runAction("down", () => requireClient().down(query)),
    [query, requireClient, runAction],
  );

  const restart = useCallback(
    () => runAction("restart", () => requireClient().restart(query)),
    [query, requireClient, runAction],
  );

  const setProfile = useCallback(
    (profile: string) =>
      runAction("profile.select", () =>
        requireClient().selectProfile(query, profile),
      ),
    [query, requireClient, runAction],
  );

  const resetProfile = useCallback(
    () => runAction("profile.reset", () => requireClient().resetProfile(query)),
    [query, requireClient, runAction],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    queueMicrotask(() => {
      refresh().catch(() => undefined);
    });
  }, [enabled, refresh]);

  return {
    data,
    status: data?.status,
    counts: data?.counts,
    links: data?.links ?? [],
    homepage: data?.homepage,
    profiles: data?.profiles.configured ?? [],
    profile: data?.profiles.current,
    selectedProfile: data?.profiles.selected,
    loading,
    refreshing,
    settling: pendingAction !== undefined,
    error,
    pendingAction,
    refresh,
    up,
    down,
    restart,
    setProfile,
    resetProfile,
  };
}
