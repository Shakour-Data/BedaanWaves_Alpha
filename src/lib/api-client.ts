export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(input, init);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

export async function apiFetchSafe<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback: T = {} as T,
): Promise<T> {
  try {
    const r = await fetch(input, init);
    if (!r.ok) return fallback;
    return (r.json() as Promise<T>) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function safeJson<T = unknown>(r: Response, fallback: T = {} as T): Promise<T> {
  try {
    if (!r.ok) return fallback;
    return (r.json() as Promise<T>) ?? fallback;
  } catch {
    return fallback;
  }
}