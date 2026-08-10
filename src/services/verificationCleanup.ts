/**
 * @fileoverview Schedules cleanup of expired proof exchanges and verification result records.
 * @module services/verificationCleanup
 */

import type { UniversityAgent } from '../agent'

import { VerificationService } from './verificationService'

/** Starts the recurring verifier cleanup task and returns its timer handle. */
export function startVerificationCleanup(agent: UniversityAgent): NodeJS.Timeout {
  const service = new VerificationService(agent)
  const run = () => void service.runCleanup()
  const timer = setInterval(run, 60_000)
  timer.unref()
  run()
  return timer
}
