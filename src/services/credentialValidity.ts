/** Strict, timezone-qualified credential validity. Never use permissive Date parsing alone. */
export function credentialDate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
  const zone = match[7]
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return undefined
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

export function credentialValidityFailure(attributes: Record<string, unknown>, now: number, legacy = false): 'CREDENTIAL_EXPIRED' | 'CREDENTIAL_NOT_YET_VALID' | 'CREDENTIAL_VALIDITY_INVALID' | undefined {
  const start = credentialDate(attributes.validFrom), end = credentialDate(attributes.expiresAt)
  if (legacy && attributes.validFrom === undefined && attributes.expiresAt === undefined) return undefined
  if (start === undefined || end === undefined || start >= end || !Number.isFinite(now)) return 'CREDENTIAL_VALIDITY_INVALID'
  if (now < start) return 'CREDENTIAL_NOT_YET_VALID'
  if (now >= end) return 'CREDENTIAL_EXPIRED'
  return undefined
}
