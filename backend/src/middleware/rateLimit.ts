/**
 * Per-IP token-bucket rate limiter.
 *
 * Each client IP is granted `max` requests per sliding window. Requests
 * beyond the budget are rejected with HTTP 429. Buckets are pruned lazily
 * to avoid unbounded memory growth from spoofed/rotating addresses.
 */

export interface RateLimiter {
  consume(key: string, now?: number): boolean
}

interface Bucket {
  tokens: number
  windowStart: number
}

/**
 * Fixed-window token bucket. `consume` returns true when the request is
 * within budget; false when it exceeds `max` for the current window.
 */
export function createRateLimiter(
  windowSeconds: number,
  max: number,
): RateLimiter {
  const buckets = new Map<string, Bucket>()
  const windowMs = windowSeconds * 1000

  function prune(now: number): void {
    if (buckets.size < 10_000) return
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= windowMs) {
        buckets.delete(key)
      }
    }
  }

  return {
    consume(key: string, now: number = Date.now()): boolean {
      prune(now)
      let bucket = buckets.get(key)

      if (!bucket || now - bucket.windowStart >= windowMs) {
        bucket = { tokens: max - 1, windowStart: now }
        buckets.set(key, bucket)
        return true
      }

      if (bucket.tokens <= 0) {
        return false
      }

      bucket.tokens -= 1
      return true
    },
  }
}
