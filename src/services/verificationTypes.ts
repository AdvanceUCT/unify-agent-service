export type VerificationDecision = 'Pending' | 'Approved' | 'Declined' | 'Expired' | 'Failed'

export type VerificationFailureCode =
  | 'CREDO_PROTOCOL_ERROR'
  | 'CREDENTIAL_NOT_CURRENT'
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
  credentialDefinitionId?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type VerificationSessionRecord = {
  verificationRequestId: string
  mode?: 'STATIC' | 'CHECKOUT'
  checkoutId?: string
  claimNonceHash?: string
  claimedAt?: string
  proofRecordId?: string
  outOfBandId?: string
  servicePointId: string
  clientRequestId: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  state: string
  decision: VerificationDecision
  credentialDefinitionId?: string
  requestedAttributes?: string[]
  nonRevocationRequested?: boolean
  isVerified?: boolean
  failureCode?: VerificationFailureCode
  completedAt?: string
  detailsVisibleUntil?: string
  proofRecordDeletedAt?: string
}

export type MinimalVerificationResult = {
  verificationRequestId: string
  checkoutId?: string
  status: VerificationDecision
  failureCode?: VerificationFailureCode
  createdAt: string
  expiresAt: string
  completedAt?: string
}

export type RevealedVerificationAttributes = Record<string, string>

export type TrustedCredentialDefinitionRecord = {
  credentialDefinitionId: string
  schemaId: string
  schemaName: string
  schemaVersion: string
  attributes: string[]
  active: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}
