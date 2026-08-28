const pendingInvitationKey = 'ohmaudit.pendingInvitation';

export function storePendingInvitation(token: string, storage: Storage = localStorage): void {
  storage.setItem(pendingInvitationKey, token);
}

export function readPendingInvitation(storage: Storage = localStorage): string | null {
  return storage.getItem(pendingInvitationKey);
}

export function clearPendingInvitation(storage: Storage = localStorage): void {
  storage.removeItem(pendingInvitationKey);
}
