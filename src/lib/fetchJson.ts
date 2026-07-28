export type FetchJsonSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type FetchJsonFailure = {
  ok: false;
  status: number;
  message: string;
  details?: unknown;
};

export type FetchJsonResult<T> = FetchJsonSuccess<T> | FetchJsonFailure;

function summarizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `fetch-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method || "GET";

  console.log("FETCH_JSON_START", { requestId, url, method });

  try {
    const response = await fetch(input, init);
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    console.log("FETCH_JSON_RESPONSE", {
      requestId,
      url,
      method,
      status: response.status,
      contentType,
      preview: summarizeText(raw),
    });

    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        status: response.status,
        message: `Expected JSON but received '${contentType || "unknown"}'`,
        details: {
          requestId,
          url,
          preview: summarizeText(raw),
        },
      };
    }

    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        message: "Invalid JSON received from server",
        details: {
          requestId,
          url,
          parseError: error instanceof Error ? error.message : String(error),
          preview: summarizeText(raw),
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message:
          (parsed as { error?: { message?: string } | string })?.error &&
          typeof (parsed as { error?: unknown }).error === "object"
            ? ((parsed as { error?: { message?: string } }).error?.message || "Request failed")
            : typeof (parsed as { error?: unknown }).error === "string"
              ? ((parsed as { error?: string }).error || "Request failed")
              : `Request failed with status ${response.status}`,
        details: parsed,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsed as T,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : String(error),
      details: {
        requestId,
        url,
      },
    };
  }
}
