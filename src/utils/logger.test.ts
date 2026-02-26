import { describe, it, expect, beforeEach, vi } from "vitest";
import { Logger, LogLevel } from "./logger";

describe("Logger", () => {
  let logger: Logger;
  let consoleSpy: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logger = new Logger();

    // Mock sink methods
    consoleSpy = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    logger.setSink(consoleSpy);
  });

  it("should log info messages by default", () => {
    logger.info("test message");
    const call = consoleSpy.log.mock.calls[0][0] as string;
    expect(call).toContain("test message");
    expect(call).toContain("🔹");
  });

  it("should not log debug messages by default", () => {
    logger.debug("debug message");
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it("should log debug messages when level is set to DEBUG", () => {
    logger.setLevel(LogLevel.DEBUG);
    logger.debug("debug message");
    const call = consoleSpy.log.mock.calls[0][0] as string;
    expect(call).toContain("debug message");
    expect(call).toContain("🐞");
  });

  it("should not log when silent is true", () => {
    logger.setSilent(true);
    logger.info("test message");
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it("should include timestamp when enabled", () => {
    logger.setTimestamp(true);
    logger.info("test message");
    const call = consoleSpy.log.mock.calls[0][0] as string;
    expect(call).toContain("test message");
    expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\./);
  });

  it("should format data correctly", () => {
    const testData = { key: "value" };
    logger.info("test message", { data: testData });
    const call = consoleSpy.log.mock.calls[0][0] as string;
    expect(call).toContain("test message");
    expect(call).toContain('{"key":"value"}');
  });

  it("should respect log level hierarchy", () => {
    logger.setLevel(LogLevel.WARN);

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const warnCall = consoleSpy.warn.mock.calls[0][0] as string;
    const errorCall = consoleSpy.error.mock.calls[0][0] as string;

    expect(consoleSpy.log).not.toHaveBeenCalledWith(
      expect.stringContaining("debug message"),
    );
    expect(consoleSpy.log).not.toHaveBeenCalledWith(
      expect.stringContaining("info message"),
    );
    expect(warnCall).toContain("⚠️");
    expect(errorCall).toContain("❌");
  });
});
