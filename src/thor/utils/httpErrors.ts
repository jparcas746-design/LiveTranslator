type MaybeCodedError = {
  code?: unknown;
  message?: unknown;
};

export function toApiError(error: unknown) {
  const maybe = (error || {}) as MaybeCodedError;

  return {
    code: typeof maybe.code === "string" ? maybe.code : "KNOWLEDGE_ENGINE_ERROR",
    message:
      typeof maybe.message === "string"
        ? maybe.message
        : error instanceof Error
          ? error.message
          : String(error),
  };
}
