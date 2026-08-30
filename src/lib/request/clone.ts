import { newId } from '../ids';
import type { ApiRequest } from '../types';

/**
 * A copy of a request that shares nothing with the original.
 *
 * Every row gets a fresh id, not just the request. Row ids are the key of the
 * session-only file map (see App.tsx), so a shallow copy left a duplicated
 * form-data field pointing at the file the *original* was holding: the copy
 * silently uploaded a file nobody attached to it, and clearing the field on
 * either row cleared it for both.
 */
export function cloneRequest(request: ApiRequest, id: string = newId()): ApiRequest {
  return {
    ...request,
    id,
    params: request.params.map((row) => ({ ...row, id: newId() })),
    headers: request.headers.map((row) => ({ ...row, id: newId() })),
    body: {
      ...request.body,
      formData: request.body.formData.map((field) => ({ ...field, id: newId() })),
      urlencoded: request.body.urlencoded.map((row) => ({ ...row, id: newId() })),
    },
    auth: { ...request.auth },
  };
}
