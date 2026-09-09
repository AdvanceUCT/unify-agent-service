import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import express, { type Router } from 'express'

import { errorHandler } from '../../middleware/errorHandler'
import { buildCredentialsRouter } from '../credentials'

async function withServer(router: Router, action: (baseUrl: string) => Promise<void>) {
  const app = express()
  app.use(express.json())
  app.use(router)
  app.use(errorHandler)
  const server = app.listen(0)
  await once(server, 'listening')
  const port = (server.address() as AddressInfo).port

  try {
    await action(`http://127.0.0.1:${port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

function student(index: number, idempotencyKey = `batch:item-${index}`) {
  return {
    attributes: [{ name: 'studentNumber', value: `STU${index}` }],
    externalId: `student-${index}`,
    idempotencyKey,
  }
}

describe('credential batch routes', () => {
  it.each(['/offers/batch', '/activation-links/batch'])(
    'rejects more than one hundred students on %s',
    async (path) => {
      await withServer(buildCredentialsRouter({} as never), async (baseUrl) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentialDefinitionId: 'cred-def-1',
            students: Array.from({ length: 101 }, (_, index) => student(index)),
          }),
        })

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'BATCH_SIZE_EXCEEDED' },
        })
      })
    },
  )

  it('rejects duplicate activation idempotency keys before issuing offers', async () => {
    await withServer(buildCredentialsRouter({} as never), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/activation-links/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialDefinitionId: 'cred-def-1',
          students: [student(1, 'duplicate-key'), student(2, 'duplicate-key')],
        }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'DUPLICATE_IDEMPOTENCY_KEY' },
      })
    })
  })
})
