/**
 * What the app gets back from the server, and from a request that failed.
 *
 * The services used `any` for both, which hid the shape of every answer and made
 * `error.response?.status` a guess. These are narrow on purpose: the fields the app actually
 * reads, with helpers that take `unknown` (what a `catch` really has).
 */

/** An error from api/axiosClient or services/NativeFetchService */
export type HttpError = Error & {
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: unknown;
  };
};

export function httpError(message: string, response: HttpError['response']): HttpError {
  return Object.assign(new Error(message), { response });
}

/** The HTTP status of a failed request, if it had one (a network failure has none) */
export function errorStatus(error: unknown): number | undefined {
  const status = (error as HttpError | undefined)?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * The server's own explanation, else the error's message, else `fallback`. Endpoints answer
 * with `message` or, on the venue registration ones, `error`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const data = (error as HttpError | undefined)?.response?.data as
    | { message?: unknown; error?: unknown }
    | undefined;
  const fromServer = typeof data?.message === 'string' ? data.message : data?.error;
  if (typeof fromServer === 'string' && fromServer) return fromServer;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Every write endpoint answers at least this */
export type ApiResult = { success?: boolean; message?: string };

/** What the verification services hand back: the answer, plus the body they read it from */
export type ApiResultWithData = ApiResult & { data: ApiResult };

/**
 * An event as the mobile endpoints return it. Everything is optional and several fields come
 * under either spelling (`theme_name` or `name`/`event_name`, `event_date` or `date`), which is
 * what the callers already handle with `||`; the app fills the gaps.
 */
export type ApiEvent = {
  id?: string;
  theme_name?: string;
  name?: string;
  event_name?: string;
  date?: string;
  genres?: string[];
  artists?: { id: string; name: string }[];
  description?: string;
  event_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  recurring?: boolean;
  recurrence_pattern?: string | null;
  special_genres?: string[];
};

/** A venue as the app's bar endpoints return it */
export type ApiBarData = {
  id: string;
  name: string;
  address?: string | null;
  postcode?: string | null;
  city?: string;
  email?: string;
  phone?: string | null;
  contact_person?: string;
  description?: string | null;
  opening_hours?: string | null;
  closing_hours?: string | null;
  website?: string | null;
};
