import type { ApiRequest } from '../types';

/**
 * What to call a request on screen.
 *
 * An unnamed request is stored with an empty name and shown as its URL rather
 * than having the URL copied into the name at creation: a stored default goes
 * stale the moment the URL is edited, and then the sidebar confidently says
 * `/users` about a request that now points at `/orders`. Falling back at
 * render time cannot drift.
 */
export function requestLabel(request: Pick<ApiRequest, 'name' | 'url'>): string {
  return request.name.trim() || request.url.trim() || 'Untitled request';
}

/** Whether this request is running on the URL fallback rather than a real name. */
export function isUnnamed(request: Pick<ApiRequest, 'name'>): boolean {
  return request.name.trim() === '';
}
