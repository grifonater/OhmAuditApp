import { computed, signal } from '@angular/core';

export class PlatformStatus {
  readonly online = signal(true);
  readonly label = computed(() => (this.online() ? 'Online' : 'Saved on device'));
}
