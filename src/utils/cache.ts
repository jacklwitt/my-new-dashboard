// Simple cache implementation
const cache = new Map<string, {value: any, timestamp: number}>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export function getCachedResponse(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedResponse(key: string, value: any) {
  cache.set(key, {value, timestamp: Date.now()});
} 