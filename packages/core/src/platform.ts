/** Platform-injected key-value storage. Async-first so AsyncStorage (TV) and
 *  localStorage (web, wrapped in resolved promises) share one interface. */
export interface KVStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

let kv: KVStorage | null = null;
export function setKVStorage(s: KVStorage | null): void { kv = s; }
export function getKVStorage(): KVStorage | null { return kv; }
