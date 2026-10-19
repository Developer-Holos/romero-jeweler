import type { HTTPMethods, Result } from "#lib";

type FetcherArgs = {
  base?: string;
};

type BaseRequest = {
  method: HTTPMethods;
  body?: any;
  headers?: Record<string, string>;
};

type UrlRequestArgs = BaseRequest & {
  url: string;
  base?: never;
  endpoint?: never;
};

type EndpointRequestArgs = BaseRequest & {
  endpoint: string;
  base?: string; // Optional here so it can fallback to the factory-level base
  url?: never;
};

type RequestArgs = UrlRequestArgs | EndpointRequestArgs;

// Type Guard / Discriminator function
function isUrlRequest(args: RequestArgs): args is UrlRequestArgs {
  return "url" in args && typeof args.url === "string";
}

export function standardFetcher(factoryArgs?: FetcherArgs) {
  function trimBase(base: string) {
    // Fixed bug: use slice(0, -1) to remove trailing slash instead of substring(1)
    return base.endsWith("/") ? base.slice(0, -1) : base;
  }

  function trimEndpoint(endpoint: string) {
    return endpoint.startsWith("/") ? endpoint.substring(1) : endpoint;
  }

  function constructOptions(
    method: HTTPMethods,
    body?: any,
    headers?: Record<string, string>
  ) {
    let options: any = {
      method,
      headers: {
        ...headers,
      },
    };
    if (method !== "GET" && body) {
      try {
        options["body"] = JSON.stringify(body);
      } catch (e) {
        throw Error("Error while parsing JSON");
      }
    }
    return options;
  }

  function getRetryTime(response: Response) {
    const retryAfterHeader = response.headers.get("Retry-After");
    return retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 2000;
  }

  async function doFetch<T>(url: string, options: RequestInit, retries = 3): Promise<Result<T>> {
    try {
      let response = await fetch(url, options);
      if (response.status === 204) {
        return { success: true, data: null as unknown as T };
      }

      if (response.status === 429) {
        if (retries <= 0) {
          return {
            success: false,
            error: `Kommo API Error [429 Too Many Requests]: Se superaron los reintentos máximos permitidos.`,
            status: 429,
          };
        }

        await new Promise((r) => setTimeout(r, getRetryTime(response)));
        return doFetch<T>(url, options, retries - 1);
      }

      const text = await response.text();
      let data: any = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const errorDetail = (typeof data === "object" && data !== null) ? JSON.stringify(data) : text;
        return {
          success: false,
          error: `Kommo API Error [${response.status} ${response.statusText}]: ${errorDetail}`,
          status: response.status,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Kommo API Network Error: ${error.message}`,
        status: 500,
      };
    }
  }

  function constructUrl(args: RequestArgs): Result<string> {
    let finalUrl: string;
    if (isUrlRequest(args)) {
      finalUrl = args.url;
    } else {
      const baseVal = args.base ?? factoryArgs?.base;
      if (!baseVal) {
        return {
          success: false,
          error: "Missing 'base' URL in request or fetcher configuration.",
          status: 400,
        };
      }
      const cleanBase = trimBase(baseVal);
      const cleanEndpoint = trimEndpoint(args.endpoint);
      finalUrl = `${cleanBase}/${cleanEndpoint}`;
    }
    return {
      success: true,
      data: finalUrl
    };
  }

  async function request<T>(args: RequestArgs): Promise<Result<T>> {
    let finalUrl = constructUrl(args);
    if (!finalUrl.success) {
      return finalUrl
    }
    const options = constructOptions(args.method, args.body, args.headers);
    return doFetch<T>(finalUrl.data, options);
  }

  return {
    request,
  };
}
