/** Maps inputs with a fixed worker count while preserving input order. */
export async function mapWithConcurrency<T, TResult>(
  inputs: readonly T[],
  concurrency: number,
  mapper: (input: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (inputs.length === 0) return []

  const results = new Array<TResult>(inputs.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, inputs.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1
        if (index >= inputs.length) return
        results[index] = await mapper(inputs[index], index)
      }
    }),
  )

  return results
}
