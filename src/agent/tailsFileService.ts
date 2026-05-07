import { BasicTailsFileService, type AnonCredsRevocationRegistryDefinition } from '@credo-ts/anoncreds'
import { CredoError, InjectionSymbols, type AgentContext, type FileSystem } from '@credo-ts/core'
import { fileURLToPath } from 'node:url'

type LocalTailsFileServiceOptions = {
  tailsDirectoryPath: string
  tailsBaseUrl: string
}

function localPathFromTailsLocation(tailsLocation: string | undefined): string | undefined {
  if (!tailsLocation) return undefined
  if (!tailsLocation.startsWith('file://')) return tailsLocation

  return fileURLToPath(tailsLocation)
}

/**
 * Publishes AnonCreds tails files for revocation-enabled credentials.
 *
 * Credo creates a tails file locally while registering a revocation registry.
 * Holders and verifiers must later download that file from the URL embedded in
 * the revocation registry definition, so this service copies Credo's generated
 * file into the configured public tails directory and returns a stable URL.
 *
 * Current PoC behavior:
 *   - files are stored on the local filesystem/container volume
 *   - Express serves them from `/tails/:tailsHash`
 *
 * TODO(production):
 * Move tails files to durable object storage or another public static host
 * before production. Container-local tails files are fine for Docker smoke
 * tests, but losing the volume would break future revocation checks.
 */
export class LocalTailsFileService extends BasicTailsFileService {
  private readonly localTailsDirectoryPath: string
  private readonly tailsBaseUrl: string

  constructor(options: LocalTailsFileServiceOptions) {
    super({ tailsDirectoryPath: options.tailsDirectoryPath })
    this.localTailsDirectoryPath = options.tailsDirectoryPath.replace(/[\\/]+$/, '')
    this.tailsBaseUrl = options.tailsBaseUrl.replace(/\/+$/, '')
  }

  override async getTailsBasePath(agentContext: AgentContext): Promise<string> {
    const fileSystem = agentContext.dependencyManager.resolve(InjectionSymbols.FileSystem) as FileSystem

    if (!(await fileSystem.exists(this.localTailsDirectoryPath))) {
      // Credo expects a `file` child directory beneath the base path. Creating
      // that child also creates the parent path through Credo's FileSystem
      // abstraction, which keeps this code portable between local and Docker.
      await fileSystem.createDirectory(`${this.localTailsDirectoryPath}/file`)
    }

    return this.localTailsDirectoryPath
  }

  override async uploadTailsFile(
    agentContext: AgentContext,
    options: { revocationRegistryDefinition: AnonCredsRevocationRegistryDefinition },
  ): Promise<{ tailsFileUrl: string }> {
    const { tailsHash, tailsLocation } = options.revocationRegistryDefinition.value
    if (!tailsHash) {
      throw new CredoError('Cannot publish tails file because the revocation registry has no tails hash.')
    }

    const fileSystem = agentContext.dependencyManager.resolve(InjectionSymbols.FileSystem) as FileSystem
    const publishedPath = await this.getTailsFilePath(agentContext, tailsHash)
    const generatedPath = localPathFromTailsLocation(tailsLocation)
    const sourcePath = generatedPath && (await fileSystem.exists(generatedPath)) ? generatedPath : publishedPath

    if (!(await fileSystem.exists(sourcePath))) {
      throw new CredoError(`Cannot publish tails file because it was not found at ${sourcePath}.`)
    }

    if (sourcePath !== publishedPath && !(await fileSystem.exists(publishedPath))) {
      // Keep the published filename equal to the tails hash. That makes the
      // URL deterministic, cacheable, and easy to inspect during AD-71
      // revocation setup tests.
      await fileSystem.copyFile(sourcePath, publishedPath)
    }

    return { tailsFileUrl: `${this.tailsBaseUrl}/${encodeURIComponent(tailsHash)}` }
  }
}
