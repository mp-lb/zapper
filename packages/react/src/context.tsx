import { createContext, useContext } from "react";
import type { ZapperProjectClient, ZapperProviderProps } from "./types";

const ZapperClientContext = createContext<ZapperProjectClient | undefined>(
  undefined,
);

export function ZapperProvider({
  client,
  children,
}: ZapperProviderProps): React.JSX.Element {
  return (
    <ZapperClientContext.Provider value={client}>
      {children}
    </ZapperClientContext.Provider>
  );
}

export function useZapperClient(): ZapperProjectClient {
  const client = useContext(ZapperClientContext);

  if (!client) {
    throw new Error(
      "No Zapper client configured. Wrap your app in <ZapperProvider client={...}> or pass a client to useZapperProject().",
    );
  }

  return client;
}

export function useOptionalZapperClient(): ZapperProjectClient | undefined {
  return useContext(ZapperClientContext);
}
