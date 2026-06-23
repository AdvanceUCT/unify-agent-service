import type {
  RevealedVerificationAttributes,
  VerificationDecision,
  VerificationFailureCode,
} from './verificationTypes'
import { VERIFICATION_ATTRIBUTES } from './verificationTypes'

export type VerificationDecisionInput = {
  state: string
  isVerified?: boolean
  credentialDefinitionIds: string[]
  trustedCredentialDefinitionIds: string[]
  attributes?: Partial<RevealedVerificationAttributes>
  expired?: boolean
  errorMessage?: string
}

export type VerificationDecisionResult = {
  decision: VerificationDecision
  failureCode?: VerificationFailureCode
  attributes?: RevealedVerificationAttributes
}

function failureCodeFromError(errorMessage?: string): VerificationFailureCode {
  return errorMessage?.toLowerCase().includes('revocation')
    ? 'REVOCATION_CHECK_FAILED'
    : 'CREDO_PROTOCOL_ERROR'
}

export function evaluateVerification(input: VerificationDecisionInput): VerificationDecisionResult {
  if (input.expired) {
    return { decision: 'Expired', failureCode: 'PROOF_REQUEST_EXPIRED' }
  }

  if (input.state === 'abandoned') {
    return { decision: 'Failed', failureCode: failureCodeFromError(input.errorMessage) }
  }

  if (input.state === 'declined') {
    return { decision: 'Declined', failureCode: 'PROOF_NOT_VERIFIED' }
  }

  if (input.isVerified === false) {
    return { decision: 'Declined', failureCode: 'PROOF_NOT_VERIFIED' }
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
  if (!attributes || VERIFICATION_ATTRIBUTES.some((name) => !attributes[name])) {
    return { decision: 'Declined', failureCode: 'REQUIRED_ATTRIBUTE_MISSING' }
  }

  const completeAttributes = attributes as RevealedVerificationAttributes
  if (completeAttributes.enrolmentStatus !== 'Registered') {
    return {
      decision: 'Declined',
      failureCode: 'STUDENT_NOT_REGISTERED',
      attributes: completeAttributes,
    }
  }

  return { decision: 'Approved', attributes: completeAttributes }
}
