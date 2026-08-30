import { describe, expect, it } from 'vitest';
import { backupFilename, fromBackup, toBackup } from './backup';
import { seedData } from './storage/schema';

describe('backup', () => {
  it('round-trips a workspace through JSON', () => {
    const data = seedData();
    const file = JSON.parse(JSON.stringify(toBackup(data)));
    expect(fromBackup(file)).toEqual(data);
  });

  it('records when the backup was taken', () => {
    const backup = toBackup(seedData(), new Date('2026-08-08T12:00:00Z'));
    expect(backup.exportedAt).toBe('2026-08-08T12:00:00.000Z');
  });

  it('accepts a bare workspace object', () => {
    const data = seedData();
    const restored = fromBackup(JSON.parse(JSON.stringify(data)));
    expect(restored.collections).toHaveLength(1);
  });

  it('repairs a damaged backup rather than refusing it', () => {
    const restored = fromBackup({
      kind: 'localrest-backup',
      version: 1,
      data: { collections: [{ name: 'Mine', requests: [{ url: 'https://x.test' }] }] },
    });
    expect(restored.collections[0]?.requests[0]?.method).toBe('GET');
  });

  it('rejects an unrelated json file', () => {
    expect(() => fromBackup({ hello: 'world' })).toThrow(/not a LocalREST backup/);
    expect(() => fromBackup(null)).toThrow(/not a LocalREST backup/);
    expect(() => fromBackup('text')).toThrow(/not a LocalREST backup/);
  });

  it('names the file by date', () => {
    expect(backupFilename(new Date('2026-08-08T12:00:00Z'))).toBe(
      'localrest-backup-2026-08-08.json',
    );
  });
});

describe('fromBackup — incomplete files', () => {
  // migrate() answers a missing payload with seed data, which is right for a
  // first run and catastrophic here: a truncated file replaced the workspace
  // with the three Examples requests and reported "Restored 3 requests from
  // backup", indistinguishable from a real restore.
  it.each([
    ['no data key', { kind: 'localrest-backup', version: 1 }],
    ['null data', { kind: 'localrest-backup', version: 1, data: null }],
    ['data is an array', { kind: 'localrest-backup', version: 1, data: [] }],
    ['data is a string', { kind: 'localrest-backup', version: 1, data: 'oops' }],
  ])('refuses a backup with %s rather than seeding', (_label, file) => {
    expect(() => fromBackup(file)).toThrow(/incomplete/i);
  });

  it('still restores a backup whose workspace is legitimately empty', () => {
    const restored = fromBackup({
      kind: 'localrest-backup',
      version: 1,
      data: { collections: [], environments: [] },
    });
    expect(restored.collections).toEqual([]);
  });
});
