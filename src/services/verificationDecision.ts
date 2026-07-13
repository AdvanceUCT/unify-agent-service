import type {
  RevealedVerificationAttributes,
  VerificationDecision,
  VerificationFailureCode,
} from './verificationTypes'

export type VerificationDecisionInput = {
  state: string
  isVerified?: boolean
  credentialDefinitionIds: string[]
  trustedCredentialDefinitionIds: string[]
  requiredAttributes: string[]
  attributes?: Partial<RevealedVerificationAttributes>
  expired?: boolean
  errorMessage?: string
}

export type VerificationDecisionResult = {
  decision: VerificationDecision
  failureCode?: VerificationFailureCode
  attributes?: RevealedVerificationAttributes
}

function revocationFailureFromError(errorMessage?: string): VerificationFailureCode | undefined {
  const message = errorMessage?.toLowerCase()
  if (!message) return undefined

  if (
    message.includes('credential is revoked') ||
    message.includes('credential was revoked') ||
    message.includes('credential is suspended') ||
    message.includes('does not satisfy the non-revocation') ||
    message.includes('does not satisfy the non_revocation')
  ) {
    return 'CREDENTIAL_NOT_CURRENT'
  }

  if (
    message.includes('revocation') ||
    message.includes('tails file') ||
    message.includes('tails location') ||
    message.includes('status list')
  ) {
    return 'REVOCATION_CHECK_FAILED'
  }

  return undefined
}

function protocolFailureCode(errorMessage?: string): VerificationFailureCode {
  return revocationFailureFromError(errorMessage) ?? 'CREDO_PROTOCOL_ERROR'
}

export function evaluateVerification(input: VerificationDecisionInput): VerificationDecisionResult {
  if (input.expired) {
    return { decision: 'Expired', failureCode: 'PROOF_REQUEST_EXPIRED' }
  }

  if (input.state === 'abandoned') {
    const failureCode = protocolFailureCode(input.errorMessage)
    return {
      decision: failureCode === 'CREDENTIAL_NOT_CURRENT' ? 'Declined' : 'Failed',
      failureCode,
    }
  }

  if (input.state === 'declined') {
    return {
      decision: 'Declined',
      failureCode: revocationFailureFromError(input.errorMessage) ?? 'PROOF_NOT_VERIFIED',
    }
  }

  if (input.isVerified === false) {
    return {
      decision: 'Declined',
      failureCode: revocationFailureFromError(input.errorMessage) ?? 'PROOF_NOT_VERIFIED',
    }
  }

  if (input.state !== 'done' || input.isVerified !== true) {
    return { decision: 'Pending' }
  }

  if (
    input.credentialDefinitionIds.length === 0 ||
    input.credentialDefinitionIds.some((id) => !input.trustedCredentialDefinitionIds.includes(id))
  ) {
    return { decision: 'Declined', failureCode: 'UNTRUSTED_CREDENTIAL_DEFINITION' }
  }

  const attributes = input.attributes
  if (!attributes || input.requiredAttributes.some((name) => !attributes[name])) {
    return { decision: 'Declined', failureCode: 'REQUIRED_ATTRIBUTE_MISSING' }
  }

  return { decision: 'Approved', attributes: attributes as RevealedVerificationAttributes }
}
