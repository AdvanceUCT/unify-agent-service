import { credentialDate, credentialValidityFailure } from '../credentialValidity'
const dates = { validFrom: '2026-10-01T10:00:00Z', expiresAt: '2026-10-01T11:00:00Z' }
describe('credential validity', () => {
  it('uses inclusive start and exclusive expiry', () => {
    const start = Date.parse(dates.validFrom), end = Date.parse(dates.expiresAt)
    expect(credentialValidityFailure(dates, start - 1)).toBe('CREDENTIAL_NOT_YET_VALID')
    expect(credentialValidityFailure(dates, start)).toBeUndefined()
    expect(credentialValidityFailure(dates, end - 1)).toBeUndefined()
    expect(credentialValidityFailure(dates, end)).toBe('CREDENTIAL_EXPIRED')
    expect(credentialValidityFailure(dates, end + 1)).toBe('CREDENTIAL_EXPIRED')
  })
  it.each(['2026-02-30T10:00:00Z', '2026-10-01', '2026-10-01T10:00:00', '2026-10-01T24:00:00Z', '2026-10-01T10:00:00+24:00', '', 'garbage'])('rejects %s', value => expect(credentialDate(value)).toBeUndefined())
  it('allows only explicitly exempt missing dates, never malformed or partial dates', () => {
    expect(credentialValidityFailure({}, 0)).toBe('CREDENTIAL_VALIDITY_INVALID')
    expect(credentialValidityFailure({}, 0, true)).toBeUndefined()
    expect(credentialValidityFailure({ validFrom: 'garbage' }, 0, true)).toBe('CREDENTIAL_VALIDITY_INVALID')
    expect(credentialValidityFailure({ validFrom: dates.validFrom }, 0, true)).toBe('CREDENTIAL_VALIDITY_INVALID')
    expect(credentialValidityFailure({ validFrom: dates.expiresAt, expiresAt: dates.validFrom }, 0)).toBe('CREDENTIAL_VALIDITY_INVALID')
  })
})
