// =====================================================================
// The small decisions the deletion job has to get right
//
// Kept here, away from the network and the database, because they are
// the parts that can be tested without either — and because "which files
// did we actually manage to remove" is a question the run has to answer
// honestly rather than optimistically.
// =====================================================================

export interface StorageFile {
  bucket: string;
  path: string;
}

/**
 * Paths grouped by bucket, deduplicated, in a stable order.
 *
 * The storage API removes many paths in one call per bucket, and the
 * same photo can be named twice — once by the listing that carries it
 * and once by the folder it sits in — so a plain list would ask for a
 * file that the first call has already taken and count the second
 * failure as a real one.
 */
export function groupByBucket(files: StorageFile[]): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();
  for (const file of files) {
    const bucket = file.bucket?.trim();
    const path = file.path?.trim();
    if (!bucket || !path) continue;
    const paths = grouped.get(bucket) ?? new Set<string>();
    paths.add(path);
    grouped.set(bucket, paths);
  }
  return new Map([...grouped].map(([bucket, paths]) => [bucket, [...paths].sort()]));
}

/**
 * Storage takes a bounded number of paths per call.
 *
 * A firm with a long history can own more files than one request may
 * name, and a request that is refused for being too large would leave
 * every one of them behind.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Whether a storage error means the file is not there.
 *
 * Deleting a file that has already gone is the normal outcome of a run
 * that died halfway and started again, and treating it as a failure
 * would stop the account from ever being erased.
 */
export function isAlreadyGone(message: string | null | undefined): boolean {
  if (!message) return false;
  return /not\s*found|does not exist|no such (file|key)/i.test(message);
}
