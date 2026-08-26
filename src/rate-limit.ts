export type RateLimiter = {
  allow: (key: string) => boolean;
};

const maxTrackedKeys = 5000;

export function createRateLimiter(windowMs: number, maxHits: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key: string) {
      const now = Date.now();
      for (const [tracked, stamps] of hits) {
        const recent = stamps.filter((stamp) => now - stamp < windowMs);
        if (recent.length === 0) {
          hits.delete(tracked);
        } else {
          hits.set(tracked, recent);
        }
      }

      const recent = hits.get(key) ?? [];
      if (recent.length >= maxHits) {
        hits.set(key, recent);
        return false;
      }

      if (hits.size >= maxTrackedKeys && !hits.has(key)) {
        hits.clear();
      }

      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
