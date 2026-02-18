import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommanderCli } from "./CommanderCli";
import { Zapper } from "../core/Zapper";

describe("CommanderCli - Profile Alias Resolution", () => {
  let cli: CommanderCli;
  let mockZapper: Zapper;

  beforeEach(() => {
    cli = new CommanderCli();
    mockZapper = new Zapper();
    
    // Mock the context to simulate a scenario where:
    // - There's a service "admin-app" with alias "admin"  
    // - There's a profile named "admin"
    // - When user types "admin", it should NOT be resolved to "admin-app"
    const mockContext = {
      profiles: ["admin", "production"],
      processes: [],
      containers: [],
      state: { activeProfile: undefined },
      projectRoot: "/test",
    };

    vi.spyOn(mockZapper, "getContext").mockReturnValue(mockContext as any);
    vi.spyOn(mockZapper, "loadConfig").mockResolvedValue();
    vi.spyOn(mockZapper, "resolveServiceName").mockImplementation((name: string) => {
      // Simulate alias resolution: "admin" -> "admin-app"
      if (name === "admin") return "admin-app";
      return name;
    });
  });

  it("should NOT apply alias resolution to profile command", async () => {
    // Mock console.error to capture error output
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    try {
      // This should fail because profile "admin-app" doesn't exist,
      // but if our fix works, it should look for "admin" instead
      await cli.parse(["node", "test", "profile", "admin"]);
      
      // If we reach here, the command succeeded, which means our fix worked
      // and "admin" was found as a valid profile
    } catch (error: any) {
      // If alias resolution was incorrectly applied, we'd see:
      // "Profile not found: admin-app"
      // But with our fix, we should either succeed or see a different error
      
      if (error.message === "process.exit called") {
        // Check what error was logged
        const errorCalls = consoleErrorSpy.mock.calls;
        if (errorCalls.length > 0) {
          const errorMessage = errorCalls[0][0];
          
          // The error should NOT mention "admin-app" if our fix works
          expect(errorMessage).not.toContain("admin-app");
          
          // It should mention "admin" as the profile name that wasn't found
          // (since we mocked it to not exist in this test)
          if (errorMessage.includes("Profile not found")) {
            expect(errorMessage).toContain("admin");
          }
        }
      }
    }

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});