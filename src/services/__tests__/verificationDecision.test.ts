import { evaluateVerification } from '../verificationDecision'

const attributes = {
  studentNumber: 'VOSCAL100',
  faculty: 'Commerce',
  year: '2026',
}

const validInput = {
  state: 'done',
  isVerified: true,
  credentialDefinitionIds: ['cred-def-001'],
  trustedCredentialDefinitionIds: ['cred-def-001'],
  requiredAttributes: ['studentNumber', 'faculty', 'year'],
  attributes,
}

describe('evaluateVerification', () => {
  it('approves a cryptographically verified student credential', () => {
    expect(evaluateVerification(validInput)).toEqual({ decision: 'Approved', attributes })
  })

  it('declines a proof Credo did not verify', () => {
    expect(evaluateVerification({ ...validInput, isVerified: false })).toEqual({
      decision: 'Declined',
      failureCode: 'PROOF_NOT_VERIFIED',
    })
  })

  it.each(['studentNumber', 'faculty', 'year'] as const)(
    'identifies a missing %s attribute',
    (name) => {
      const incomplete = { ...attributes }
      delete incomplete[name]
      expect(evaluateVerification({ ...validInput, attributes: incomplete })).toEqual({
        decision: 'Declined',
        failureCode: 'REQUIRED_ATTRIBUTE_MISSING',
      })
    },
  )

  it('declines credentials outside the trusted allowlist', () => {
    expect(
      evaluateVerification({ ...validInput, credentialDefinitionIds: ['untrusted-cred-def'] }),
    ).toEqual({ decision: 'Declined', failureCode: 'UNTRUSTED_CREDENTIAL_DEFINITION' })
  })

  it('reports an expired request before evaluating its presentation', () => {
    expect(evaluateVerification({ ...validInput, expired: true })).toEqual({
      decision: 'Expired',
      failureCode: 'PROOF_REQUEST_EXPIRED',
    })
  })

  it('maps abandoned revocation failures separately from other Credo failures', () => {
    expect(
      evaluateVerification({
        ...validInput,
        state: 'abandoned',
        errorMessage: 'revocation registry could not be resolved',
      }),
    ).toEqual({ decision: 'Failed', failureCode: 'REVOCATION_CHECK_FAILED' })
  })

  it('declines a credential explicitly reported as revoked or suspended', () => {
    expect(
      evaluateVerification({
        ...validInput,
        state: 'abandoned',
        isVerified: false,
        errorMessage: 'Credential does not satisfy the non-revocation interval because credential is revoked',
      }),
    ).toEqual({ decision: 'Declined', failureCode: 'CREDENTIAL_NOT_CURRENT' })
  })

  it('keeps non-terminal proof exchanges pending', () => {
    expect(evaluateVerification({ ...validInput, state: 'request-sent', isVerified: undefined })).toEqual({
      decision: 'Pending',
    })
  })
})
