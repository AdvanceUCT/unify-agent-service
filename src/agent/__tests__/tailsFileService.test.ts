import { CredoError, type FileSystem } from '@credo-ts/core'

import { LocalTailsFileService } from '../tailsFileService'

type MockFileSystem = Pick<FileSystem, 'exists' | 'createDirectory' | 'copyFile'>
type AgentContextArg = Parameters<LocalTailsFileService['uploadTailsFile']>[0]
type UploadTailsFileOptions = Parameters<LocalTailsFileService['uploadTailsFile']>[1]

function makeAgentContext(fileSystem: MockFileSystem): AgentContextArg {
  const agentContext = {
    dependencyManager: {
      resolve: jest.fn().mockReturnValue(fileSystem),
    },
  }

  return agentContext as unknown as AgentContextArg
}

function makeUploadOptions(tailsHash: string, tailsLocation: string): UploadTailsFileOptions {
  const revocationRegistryDefinition = {
    value: {
      tailsHash,
      tailsLocation,
    },
  }

  return { revocationRegistryDefinition } as UploadTailsFileOptions
}

describe('LocalTailsFileService', () => {
  it('publishes a generated tails file under the configured public base URL', async () => {
    const tailsDirectoryPath = '/tmp/tails'
    const tailsHash = 'tailsHash123'
    const generatedPath = '/tmp/generated/tailsHash123'
    const publishedPath = `${tailsDirectoryPath}/${tailsHash}`
    const fileSystem: MockFileSystem = {
      exists: jest.fn(async (path: string) => path === tailsDirectoryPath || path === generatedPath),
      createDirectory: jest.fn(async (_path: string) => undefined),
      copyFile: jest.fn(async (_sourcePath: string, _destinationPath: string) => undefined),
    }
    const service = new LocalTailsFileService({
      tailsDirectoryPath,
      tailsBaseUrl: 'http://localhost:3000/tails/',
    })

    const result = await service.uploadTailsFile(makeAgentContext(fileSystem), makeUploadOptions(tailsHash, generatedPath))

    expect(result).toEqual({ tailsFileUrl: `http://localhost:3000/tails/${tailsHash}` })
    expect(fileSystem.copyFile).toHaveBeenCalledWith(generatedPath, publishedPath)
  })

  it('throws a CredoError when the generated tails file cannot be found', async () => {
    const fileSystem: MockFileSystem = {
      exists: jest.fn(async (_path: string) => false),
      createDirectory: jest.fn(async (_path: string) => undefined),
      copyFile: jest.fn(async (_sourcePath: string, _destinationPath: string) => undefined),
    }
    const service = new LocalTailsFileService({
      tailsDirectoryPath: '/tmp/tails',
      tailsBaseUrl: 'http://localhost:3000/tails',
    })

    const err = await service
      .uploadTailsFile(
        makeAgentContext(fileSystem),
        makeUploadOptions('missingHash', '/tmp/generated/missingHash'),
      )
      .catch((error) => error)

    expect(err).toBeInstanceOf(CredoError)
    expect((err as Error).message).toMatch(/not found/i)
  })
})
