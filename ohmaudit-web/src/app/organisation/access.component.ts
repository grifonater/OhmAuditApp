import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ApiService,
  type AccessOverview,
  type CapabilityDefinition,
  type OrganisationRole,
} from '../core/api.service';

@Component({
  selector: 'oa-access',
  imports: [ReactiveFormsModule],
  templateUrl: './access.component.html',
  styleUrl: './access.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly data = signal<AccessOverview | undefined>(undefined);
  protected readonly tab = signal<'users' | 'roles'>('users');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly inviteUrl = signal('');
  protected readonly editingRoleId = signal<string | null>(null);
  protected readonly selectedCapabilities = signal(new Set<string>());
  protected readonly userSearch = new FormControl('', { nonNullable: true });
  protected readonly inviteForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    roleKey: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly roleForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  protected readonly filteredMembers = computed(() => {
    const query = this.userSearch.value.trim().toLowerCase();
    return (this.data()?.members ?? []).filter(
      (member) =>
        query.length === 0 ||
        `${member.user.displayName ?? ''} ${member.user.email} ${member.role.name}`
          .toLowerCase()
          .includes(query),
    );
  });
  protected readonly permissionGroups = computed(() => {
    const groups = new Map<string, CapabilityDefinition[]>();
    for (const permission of this.data()?.capabilities ?? []) {
      const entries = groups.get(permission.group) ?? [];
      entries.push(permission);
      groups.set(permission.group, entries);
    }
    return [...groups.entries()].map(([name, permissions]) => ({ name, permissions }));
  });
  protected readonly assignableRoles = computed(() => {
    const assignable = new Set(this.data()?.assignableCapabilityKeys ?? []);
    return (this.data()?.roles ?? []).filter((role) =>
      role.capabilityKeys.every((key) => assignable.has(key)),
    );
  });

  constructor() {
    void this.load();
  }

  protected get organisationId(): string {
    return this.route.snapshot.paramMap.get('organisationId') ?? '';
  }

  protected setTab(tab: 'users' | 'roles'): void {
    this.tab.set(tab);
    this.clearNotices();
  }

  protected startRole(role?: OrganisationRole): void {
    this.editingRoleId.set(role?.id ?? 'new');
    this.roleForm.setValue({ name: role?.name ?? '', description: role?.description ?? '' });
    this.selectedCapabilities.set(new Set(role?.capabilityKeys ?? []));
    this.clearNotices();
  }

  protected duplicateRole(role: OrganisationRole): void {
    this.editingRoleId.set('new');
    this.roleForm.setValue({ name: `${role.name} copy`, description: role.description ?? '' });
    const assignable = new Set(this.data()?.assignableCapabilityKeys ?? []);
    this.selectedCapabilities.set(
      new Set(role.capabilityKeys.filter((key) => assignable.has(key))),
    );
  }

  protected cancelRole(): void {
    this.editingRoleId.set(null);
    this.roleForm.reset();
    this.selectedCapabilities.set(new Set());
  }

  protected togglePermission(key: string): void {
    const next = new Set(this.selectedCapabilities());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedCapabilities.set(next);
  }

  protected toggleGroup(permissions: CapabilityDefinition[]): void {
    const available = permissions.filter((item) => this.canGrant(item.key));
    const allSelected = available.every((item) => this.selectedCapabilities().has(item.key));
    const next = new Set(this.selectedCapabilities());
    for (const permission of available) {
      if (allSelected) next.delete(permission.key);
      else next.add(permission.key);
    }
    this.selectedCapabilities.set(next);
  }

  protected canGrant(key: string): boolean {
    return this.data()?.assignableCapabilityKeys.includes(key) ?? false;
  }

  protected canAssignRole(role: OrganisationRole): boolean {
    const available = new Set(this.data()?.assignableCapabilityKeys ?? []);
    return role.capabilityKeys.every((key) => available.has(key));
  }

  protected primaryAction(): void {
    if (this.tab() === 'roles') this.startRole();
    else document.querySelector<HTMLInputElement>('#invite-email')?.focus();
  }

  protected async saveRole(): Promise<void> {
    if (this.roleForm.invalid || this.editingRoleId() === null) return;
    this.saving.set(true);
    this.clearNotices();
    const value = this.roleForm.getRawValue();
    const input = {
      name: value.name,
      description: value.description || undefined,
      capabilityKeys: [...this.selectedCapabilities()],
    };
    try {
      const id = this.editingRoleId();
      if (id === 'new') await this.api.createRole(this.organisationId, input);
      else await this.api.updateRole(this.organisationId, id!, input);
      this.cancelRole();
      await this.load(false);
      this.message.set(id === 'new' ? 'Custom role created.' : 'Role updated.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save the role.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteRole(role: OrganisationRole): Promise<void> {
    if (!window.confirm(`Delete the “${role.name}” role?`)) return;
    this.clearNotices();
    try {
      await this.api.deleteRole(this.organisationId, role.id);
      await this.load(false);
      this.message.set('Role deleted.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to delete the role.');
    }
  }

  protected async invite(): Promise<void> {
    if (this.inviteForm.invalid) return;
    this.saving.set(true);
    this.clearNotices();
    try {
      const result = await this.api.inviteMember(
        this.organisationId,
        this.inviteForm.getRawValue(),
      );
      await this.load(false);
      this.inviteUrl.set(new URL(result.inviteUrl, location.origin).href);
      this.inviteForm.controls.email.reset();
      this.message.set('Invitation created. Share the link with the new user.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to invite this user.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async revokeInvitation(invitationId: string): Promise<void> {
    if (!window.confirm('Revoke this pending invitation?')) return;
    this.clearNotices();
    try {
      await this.api.revokeInvitation(this.organisationId, invitationId);
      await this.load(false);
      this.message.set('Invitation revoked.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to revoke the invitation.');
    }
  }

  protected async changeRole(membershipId: string, event: Event): Promise<void> {
    const roleId = (event.target as HTMLSelectElement).value;
    this.clearNotices();
    try {
      await this.api.setMemberRole(this.organisationId, membershipId, roleId);
      await this.load(false);
      this.message.set('User role updated.');
    } catch (error: unknown) {
      await this.load(false);
      this.error.set(error instanceof Error ? error.message : 'Unable to change the user role.');
    }
  }

  protected async toggleStatus(
    membershipId: string,
    current: 'ACTIVE' | 'INACTIVE',
  ): Promise<void> {
    const status = current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (status === 'INACTIVE' && !window.confirm('Suspend this user’s organisation access?'))
      return;
    this.clearNotices();
    try {
      await this.api.setMemberStatus(this.organisationId, membershipId, status);
      await this.load(false);
      this.message.set(status === 'ACTIVE' ? 'User access restored.' : 'User access suspended.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to change user access.');
    }
  }

  protected initials(name: string | undefined, email: string): string {
    return (name || email)
      .split(/\s|@/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    try {
      const data = await this.api.accessOverview(this.organisationId);
      this.data.set(data);
      if (!this.inviteForm.controls.roleKey.value) {
        this.inviteForm.controls.roleKey.setValue(
          data.roles.find((role) => role.key === 'engineer')?.key ?? data.roles[0]?.key ?? '',
        );
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load users and roles.');
    } finally {
      this.loading.set(false);
    }
  }

  private clearNotices(): void {
    this.error.set('');
    this.message.set('');
    this.inviteUrl.set('');
  }
}
