/**
 * @fileoverview Enforces bounded in-memory request rates for public verification entry points.
 * @module services/verificationRateLimiter
 */

import { AppError } from '../errors'

type RateLimitOptions = {
  perIp: number
  perServicePoint: number
  windowMs?: number
}

/** Tracks request windows by caller key and rejects callers that exceed the configured limit. */
export class VerificationRateLimiter {
  private readonly ipAttempts = new Map<string, number[]>()
  private readonly servicePointAttempts = new Map<string, number[]>()
  private readonly windowMs: number

  constructor(private readonly options: RateLimitOptions) {
    this.windowMs = options.windowMs ?? 60_000
  }

  check(ip: string, servicePointId: string, now = Date.now()): void {
    this.record(this.ipAttempts, ip || 'unknown', this.options.perIp, now, 'VERIFICATION_IP_RATE_LIMITED')
    this.record(
      this.servicePointAttempts,
      servicePointId,
      this.options.perServicePoint,
      now,
      'VERIFICATION_SERVICE_POINT_RATE_LIMITED',
    )
  }

  private record(
    attemptsByKey: Map<string, number[]>,
    key: string,
    limit: number,
    now: number,
    code: string,
  ): void {
    const cutoff = now - this.windowMs
    const attempts = (attemptsByKey.get(key) ?? []).filter((attempt) => attempt > cutoff)
    if (attempts.length >= limit) {
      throw new AppError(429, 'Too many verification requests. Try again shortly.', undefined, code)
    }

    attempts.push(now)
    attemptsByKey.set(key, attempts)
  }
}
