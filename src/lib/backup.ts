import { migrate } from './storage/schema';
import type { AppData } from './types';

// Frozen from first release: every backup file ever exported carries this
// string and fromBackup() matches on it, so changing it makes old exports
// unreadable. Safe to set now only because nothing has shipped yet.
const BACKUP_KIND = 'localrest-backup';
const BACKUP_VERSION = 1;

export type Backup = {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  data: AppData;
};

/**
 * The whole workspace as one file. Data lives only in this browser's extension
 * storage, so uninstalling destroys it — this is the only way out.
 */
export function toBackup(data: AppData, now = new Date()): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

/**
 * Read a backup file. Also accepts a bare AppData object, so a workspace
 * recovered by hand out of storage still restores.
 */
export function fromBackup(source: unknown): AppData {
  if (typeof source !== 'object' || source === null) {
    throw new Error('That file is not a LocalREST backup.');
  }

  const record = source as Record<string, unknown>;
  if (record['kind'] === BACKUP_KIND) {
    // migrate() answers a missing payload with seed data, which is the right
    // reply to a first run and a catastrophic one here: a truncated file would
    // replace the workspace with the three Examples requests and report
    // "Restored 3 requests from backup", indistinguishable from success.
    const data = record['data'];
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('That backup file is incomplete — it has no data to restore.');
    }
    return migrate(data);
  }

  if (Array.isArray(record['collections'])) return migrate(record);

  throw new Error('That file is not a LocalREST backup.');
}

export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `localrest-backup-${stamp}.json`;
}
