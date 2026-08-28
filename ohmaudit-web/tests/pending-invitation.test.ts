import { describe, expect, it } from 'vitest';
import {
  clearPendingInvitation,
  readPendingInvitation,
  storePendingInvitation,
} from '../src/app/core/pending-invitation';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('pending invitation storage', () => {
  it('retains an invitation until it has been accepted', () => {
    const storage = memoryStorage();

    storePendingInvitation('invite-token', storage);
    expect(readPendingInvitation(storage)).toBe('invite-token');

    clearPendingInvitation(storage);
    expect(readPendingInvitation(storage)).toBeNull();
  });
});
