// Thin client for the Impress Design API (server/). Set VITE_API_URL when the API lives on another host.
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'impress-design-token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };

export class ApiError extends Error {
  constructor(message, status, fromApi = false) { super(message); this.status = status; this.fromApi = fromApi; }
}

export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  // A web server without the API (e.g. static hosting) answers /api/... with index.html and 200 — treat as unreachable.
  if (res.ok && res.status !== 204 && !(res.headers.get('content-type') || '').includes('json')) {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('impress-auth-expired')); }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data != null);
  }
  return data;
}

/** Fetches an authenticated file as a Blob (e.g. customer artwork for an admin preview). */
export async function fetchBlob(path) {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('Could not load file', res.status);
  return res.blob();
}

/** Downloads an authenticated file (e.g. customer artwork) through the browser. */
export async function download(path, filename) {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('Download failed', res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const formatMoney = (n, currency = 'EUR') => (n == null ? '' : new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(n));
export const formatDate = (d, withTime = false) => (d ? new Date(d).toLocaleString('en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '');
