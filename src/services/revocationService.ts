import type { UniversityAgent } from '../agent'

export class RevocationService {
  constructor(private readonly agent: UniversityAgent) {}

  async revoke(_params: { credentialExchangeId: string; reason?: string }): Promise<{ revokedAt: string }> {
    // Revocation is still the one issuer-side flow that has not been wired to Credo yet.
    throw new Error('Not implemented: RevocationService.revoke')
  }
}
