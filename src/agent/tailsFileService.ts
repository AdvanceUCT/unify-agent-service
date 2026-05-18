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
      // Keep the public filename equal to the tails hash so revocation URLs stay predictable.
      await fileSystem.copyFile(sourcePath, publishedPath)
    }

    return { tailsFileUrl: `${this.tailsBaseUrl}/${encodeURIComponent(tailsHash)}` }
  }
}
