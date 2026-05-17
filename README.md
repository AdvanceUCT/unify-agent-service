# Unify Identity Agent Service
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Credo TS](https://img.shields.io/badge/Credo_TS-2D3748?logo=typescript&logoColor=white)](https://credo.js.org/)
[![AnonCreds](https://img.shields.io/badge/AnonCreds-00599C?logo=hyperledger&logoColor=white)](https://hyperledger.github.io/anoncreds-spec/)
[![Indy VDR](https://img.shields.io/badge/Indy_VDR-003B57?logo=hyperledger&logoColor=white)](https://github.com/hyperledger/indy-vdr)
[![Jest](https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white)](https://jestjs.io/)

<div align="center">

Backend service for the Unify university credential issuer.

It runs the Credo agent, connects to the Indy ledger, creates credential offers,
and exposes the REST API used by the Admin Portal.
</div>

---

## Overview

The Unify Identity Agent Service is the issuer-side backend for the student
digital identity system. It wraps Credo-TS behind a small Express API so the
Admin Portal can bootstrap issuance, generate student activation links, and
track credential exchange state.

The service features:

- **Issuer DID Management** - Creates and reuses the university issuer DID
- **Ledger Setup** - Registers schemas, credential definitions, and revocation setup data
- **Credential Offers** - Generates single or batch AnonCreds credential offers
- **Student Activation Links** - Creates short-lived tokenized links for email delivery
- **DIDComm Messaging** - Runs inbound and outbound transports for wallet handshakes
- **Webhook Events** - Sends connection and credential state changes back to the Admin Portal
- **Docker Development** - Runs the native Credo dependencies in a Linux container

---

## Tech Stack

### Backend
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

### SSI / Credentials
[![Credo TS](https://img.shields.io/badge/Credo_TS-2D3748?style=for-the-badge&logo=typescript&logoColor=white)](https://credo.js.org/)

[![Aries Askar](https://img.shields.io/badge/Aries_Askar-4B5563?style=for-the-badge&logo=hyperledger&logoColor=white)](https://github.com/hyperledger/aries-askar)

[![AnonCreds](https://img.shields.io/badge/AnonCreds-00599C?style=for-the-badge&logo=hyperledger&logoColor=white)](https://hyperledger.github.io/anoncreds-spec/)

[![Indy VDR](https://img.shields.io/badge/Indy_VDR-003B57?style=for-the-badge&logo=hyperledger&logoColor=white)](https://github.com/hyperledger/indy-vdr)

### Testing
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

[![ts-jest](https://img.shields.io/badge/ts--jest-3178C6?style=for-the-badge&logo=jest&logoColor=white)](https://kulshekhar.github.io/ts-jest/)

---

## Project Structure

```
unify-agent-service/
├── genesis/                  # Indy ledger genesis transaction files
├── src/
│   ├── agent/                # Credo agent setup, modules, networks, tails files
│   ├── api/                  # Express server, middleware, validation, routes
│   ├── config/               # Environment-driven runtime configuration
│   ├── events/               # Credo event listeners and webhook dispatch
│   ├── services/             # Issuer DID, setup, offers, activation, status logic
│   ├── errors.ts             # Expected API error type
│   └── index.ts              # Application entrypoint and graceful shutdown
├── docker-compose.yml        # Local service container setup
├── Dockerfile                # Production-style container build
├── package.json              # Scripts and dependencies
└── README.md                 # This file
```

---

## Setup

### Prerequisites

- **Git**
- **Docker Desktop**
- **Node.js 20+** for local typecheck/test commands
- **npm**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AdvanceUCT/unify-agent-service.git
   cd unify-agent-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create the environment file**
   ```bash
   cp .env.example .env
   ```

4. **Set the important environment values**

   ```env
   AGENT_WALLET_KEY=replace-with-a-strong-secret
   AGENT_API_KEY=replace-with-a-shared-admin-portal-secret
   AGENT_ENDPOINT=http://localhost:3001
   API_PORT=3000
   AGENT_PORT=3001
   ```

   For a deployed server, `AGENT_ENDPOINT` must be the public DIDComm URL that
   the student wallet can reach. `AGENT_API_KEY` must match the Admin Portal
   environment value.

5. **Start the service with Docker**
   ```bash
   docker compose up --build
   ```

   The API will run on:

   ```bash
   http://localhost:3000
   ```

   The DIDComm inbound transport will run on:

   ```bash
   http://localhost:3001
   ```

6. **Check the API**
   ```bash
   curl http://localhost:3000/api/health
   ```

   Expected response:

   ```json
   {
     "status": "ok",
     "agentLabel": "university-identity-agent",
     "isInitialized": true
   }
   ```

7. **Reset local wallet state when needed**
   ```bash
   docker compose down -v
   ```

   This removes the persisted `agent-data` Docker volume and clears stale DID,
   schema, credential definition, and activation-link data.

---

## Testing

### TypeScript Checks
```bash
npm run typecheck
```

### Unit Tests
```bash
npm test
npm test -- --runInBand
```

### Production Build
```bash
npm run build
```

---
