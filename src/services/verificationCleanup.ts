import type { UniversityAgent } from '../agent'

import { VerificationService } from './verificationService'

export function startVerificationCleanup(agent: UniversityAgent): NodeJS.Timeout {
  const service = new VerificationService(agent)
  const run = () => void service.runCleanup()
  const timer = setInterval(run, 60_000)
  timer.unref()
  run()
  return timer
}
