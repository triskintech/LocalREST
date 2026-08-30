/** Short, collision-free ids for requests, collections and key/value rows. */
export function newId(): string {
  return crypto.randomUUID();
}
