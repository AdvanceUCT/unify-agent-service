export const VERIFICATION_ATTRIBUTES = [
  'studentNumber',
  'faculty',
  'year',
] as const

export type VerificationAttributeName = (typeof VERIFICATION_ATTRIBUTES)[number]

export type VerificationDecision = 'Pending' | 'Approved' | 'Declined' | 'Expired' | 'Failed'

export type VerificationFailureCode =
  | 'CREDO_PROTOCOL_ERROR'
  | 'PROOF_EXCHANGE_ABANDONED'
  | 'PROOF_NOT_VERIFIED'
  | 'PROOF_REQUEST_EXPIRED'
  | 'REQUIRED_ATTRIBUTE_MISSING'
  | 'REVOCATION_CHECK_FAILED'
  | 'STUDENT_NOT_REGISTERED'
  | 'UNTRUSTED_CREDENTIAL_DEFINITION'

export type ServicePointRecord = {
  id: string
  publicId: string
  vendorId: string
  vendorName: string
  externalId: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type VerificationSessionRecord = {
  verificationRequestId: string
  proofRecordId: string
  outOfBandId: string
  servicePointId: string
  clientRequestId: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  state: string
  decision: VerificationDecision
  isVerified?: boolean
  failureCode?: VerificationFailureCode
  completedAt?: string
  detailsVisibleUntil?: string
  proofRecordDeletedAt?: string
}

export type RevealedVerificationAttributes = Record<VerificationAttributeName, string>
