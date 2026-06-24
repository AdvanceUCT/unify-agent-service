import { VerificationRateLimiter } from '../verificationRateLimiter'

describe('VerificationRateLimiter', () => {
  it('reports an IP-specific fault when one wallet starts too many sessions', () => {
    const limiter = new VerificationRateLimiter({ perIp: 2, perServicePoint: 10, windowMs: 1000 })
    limiter.check('192.0.2.1', 'service-point-1', 1000)
    limiter.check('192.0.2.1', 'service-point-1', 1001)

    expect(() => limiter.check('192.0.2.1', 'service-point-2', 1002)).toThrow(
      expect.objectContaining({ code: 'VERIFICATION_IP_RATE_LIMITED' }),
    )
  })

  it('reports a service-point-specific fault under aggregate load', () => {
    const limiter = new VerificationRateLimiter({ perIp: 10, perServicePoint: 2, windowMs: 1000 })
    limiter.check('192.0.2.1', 'service-point-1', 1000)
    limiter.check('192.0.2.2', 'service-point-1', 1001)

    expect(() => limiter.check('192.0.2.3', 'service-point-1', 1002)).toThrow(
      expect.objectContaining({ code: 'VERIFICATION_SERVICE_POINT_RATE_LIMITED' }),
    )
  })

  it('allows requests again after the rate-limit window', () => {
    const limiter = new VerificationRateLimiter({ perIp: 1, perServicePoint: 1, windowMs: 1000 })
    limiter.check('192.0.2.1', 'service-point-1', 1000)
    expect(() => limiter.check('192.0.2.1', 'service-point-1', 2001)).not.toThrow()
  })
})
