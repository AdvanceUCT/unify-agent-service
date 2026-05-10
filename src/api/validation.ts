import { AppError } from '../errors'

export type CredentialAttributeInput = { name: string; value: string }

/**
 * Small route-local validation helpers.
 *
 * These keep the current API strict without introducing a schema library while
 * the Admin Portal contract is still moving. They deliberately throw AppError
 * with status 400 so the central error handler can return caller-actionable
 * JSON instead of a generic 500.
 *
 * TODO(contract hardening):
 * Once the request/response shapes stop changing, consider replacing these
 * helpers with shared Zod/JSON Schema contracts that both the Admin Portal and
 * this service import. Until then, keep validation failures explicit and close
 * to the route that owns the payload.
 */
function fail(message: string): never {
  throw new AppError(400, message)
}

export function requireObject(value: unknown, label = 'Request body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`)
  }

  return value as Record<string, unknown>
}

export function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${key} must be a non-empty string.`)
  }

  return value.trim()
}

export function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${key} must be a non-empty string when provided.`)
  }

  return value.trim()
}

export function requireBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') {
    fail(`${key} must be a boolean.`)
  }

  return value
}

export function optionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    fail(`${key} must be a boolean when provided.`)
  }

  return value
}

export function requirePositiveInteger(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(`${key} must be a positive integer.`)
  }

  return value
}

export function requireStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key]
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${key} must be a non-empty array of strings.`)
  }

  const values = value.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      fail(`${key}[${index}] must be a non-empty string.`)
    }
    return item.trim()
  })

  return [...new Set(values)]
}

export function requireAttributes(source: Record<string, unknown>, key = 'attributes'): CredentialAttributeInput[] {
  const value = source[key]
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${key} must be a non-empty array of { name, value } objects.`)
  }

  return value.map((item, index) => {
    const attribute = requireObject(item, `${key}[${index}]`)
    return {
      name: requireString(attribute, 'name'),
      value: requireString(attribute, 'value'),
    }
  })
}
