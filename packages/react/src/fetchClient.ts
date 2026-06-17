import type {
  ZapperProjectActionResult,
  ZapperProjectClient,
  ZapperProjectQuery,
  ZapperProjectSnapshot,
} from "./types";

export interface ZapperFetchClientOptions {
  endpoint: string;
  fetch?: typeof fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

interface ZapperFetchRequest {
  method:
    | "getProject"
    | "up"
    | "down"
    | "restart"
    | "selectProfile"
    | "resetProfile";
  query: ZapperProjectQuery;
  profile?: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Zapper request failed with HTTP ${response.status}`;

    throw new Error(message);
  }

  return body as T;
}

export function createZapperFetchClient({
  endpoint,
  fetch: fetchImpl = fetch,
  headers,
}: ZapperFetchClientOptions): ZapperProjectClient {
  async function request<T>(payload: ZapperFetchRequest): Promise<T> {
    const resolvedHeaders =
      typeof headers === "function" ? await headers() : headers;

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...resolvedHeaders,
      },
      body: JSON.stringify(payload),
    });

    return parseJsonResponse<T>(response);
  }

  return {
    getProject(query) {
      return request<ZapperProjectSnapshot>({ method: "getProject", query });
    },
    up(query) {
      return request<ZapperProjectActionResult>({ method: "up", query });
    },
    down(query) {
      return request<ZapperProjectActionResult>({ method: "down", query });
    },
    restart(query) {
      return request<ZapperProjectActionResult>({ method: "restart", query });
    },
    selectProfile(query, profile) {
      return request<ZapperProjectActionResult>({
        method: "selectProfile",
        query,
        profile,
      });
    },
    resetProfile(query) {
      return request<ZapperProjectActionResult>({
        method: "resetProfile",
        query,
      });
    },
  };
}
