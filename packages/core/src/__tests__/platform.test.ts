import { describe, it, expect } from "vitest";
import { setKVStorage, getKVStorage, type KVStorage } from "../platform";

export function memoryKV(): KVStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(k) { return data.get(k) ?? null; },
    async set(k, v) { data.set(k, v); },
    async remove(k) { data.delete(k); },
  };
}

describe("KVStorage registry", () => {
  it("returns null before registration and the adapter after", () => {
    setKVStorage(null as unknown as KVStorage); // reset between test files
    expect(getKVStorage()).toBeNull();
    const kv = memoryKV();
    setKVStorage(kv);
    expect(getKVStorage()).toBe(kv);
  });
});
