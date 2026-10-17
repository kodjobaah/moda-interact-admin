export type ConfigurationErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "NOT_CONFIGURED" | "CONFLICT" | "DB_UNAVAILABLE";
export class ConfigurationError extends Error {
  constructor(readonly code: ConfigurationErrorCode, message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
export function isConfigurationError(cause: unknown): cause is ConfigurationError {
  return cause instanceof ConfigurationError;
}
