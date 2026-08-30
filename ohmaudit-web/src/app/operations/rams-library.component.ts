import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ApiService,
  type OrganisationRamsSummary,
  type RamsHazard,
  type RamsLibraryHazard,
  type RamsMethodGroup,
  type RamsMethodStep,
  type RamsTemplate,
} from '../core/api.service';
import { blankRamsDraft, ramsRiskBand, ramsRiskClass, ramsRiskScore } from '../core/rams-library';
import { RiskMatrixComponent } from '../shared/risk-matrix.component';

type LibraryTab = 'all' | 'templates' | 'methods' | 'hazards';
type TemplateEdit = { name: string; description: string; sourceRamsId: string };
type GroupEdit = { name: string; description: string; steps: RamsMethodStep[] };
type HazardFields = {
  hazard: string;
  peopleAtRisk: string;
  howHarmed: string;
  controls: string;
  furtherActions: string;
  actionOwner: string;
  actionDueDate: string;
  actionStatus: 'OPEN' | 'CONTROLLED';
  initialLikelihood: number;
  initialSeverity: number;
  residualLikelihood: number;
  residualSeverity: number;
};
type HazardEdit = { name: string; description: string; isDefault: boolean } & HazardFields;

@Component({
  selector: 'oa-rams-library',
  imports: [RouterLink, RiskMatrixComponent],
  templateUrl: './rams-library.component.html',
  styleUrls: ['./operations.css', './rams-library.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RamsLibraryComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly activeTab = signal<LibraryTab>(this.initialTab());
  protected readonly rams = signal<OrganisationRamsSummary[]>([]);
  protected readonly templates = signal<RamsTemplate[]>([]);
  protected readonly groups = signal<RamsMethodGroup[]>([]);
  protected readonly hazards = signal<RamsLibraryHazard[]>([]);
  protected readonly capabilities = signal<string[]>([]);
  protected readonly query = signal('');
  protected readonly status = signal('ALL');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly showTemplateCreate = signal(false);
  protected readonly templateName = signal('');
  protected readonly templateDescription = signal('');
  protected readonly templateSourceRamsId = signal('');
  protected readonly templateSourceQuery = signal('');
  protected readonly templateSourceResults = signal<OrganisationRamsSummary[]>([]);
  protected readonly templateSourceDraftTouched = signal(false);
  protected readonly templateSourceEditTouched = signal(false);
  protected readonly templateEdits = signal<Record<string, TemplateEdit>>({});
  protected readonly editingTemplateId = signal('');
  protected readonly showGroupCreate = signal(false);
  protected readonly newGroup = signal<GroupEdit>(this.blankGroup());
  protected readonly groupEdits = signal<Record<string, GroupEdit>>({});
  protected readonly editingGroupId = signal('');
  protected readonly showHazardCreate = signal(false);
  protected readonly newHazard = signal<HazardEdit>(this.blankHazard());
  protected readonly hazardEdits = signal<Record<string, HazardEdit>>({});
  protected readonly editingHazardId = signal('');
  protected readonly likelihoods = [1, 2, 3, 4, 5];
  protected readonly severities = [5, 4, 3, 2, 1];
  protected readonly riskScore = ramsRiskScore;
  protected readonly riskBand = ramsRiskBand;
  protected readonly riskClass = ramsRiskClass;
  private sourceSearchTimer?: ReturnType<typeof setTimeout>;
  protected readonly canManage = computed(() => this.capabilities().includes('rams.manage'));
  protected readonly filteredRams = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en-GB');
    return this.rams().filter(
      (item) =>
        (this.status() === 'ALL' || item.status === this.status()) &&
        (!query ||
          [
            item.reference,
            item.title,
            ...item.visits.flatMap((visit) => [
              visit.reference,
              visit.title,
              visit.customer.name,
              visit.site.name,
            ]),
          ].some((value) => value?.toLocaleLowerCase('en-GB').includes(query))),
    );
  });
  protected readonly filteredTemplates = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en-GB');
    return this.templates().filter(
      (item) =>
        !query ||
        item.name.toLocaleLowerCase('en-GB').includes(query) ||
        item.description.toLocaleLowerCase('en-GB').includes(query),
    );
  });
  protected readonly filteredGroups = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en-GB');
    return this.groups().filter(
      (item) =>
        !query ||
        item.name.toLocaleLowerCase('en-GB').includes(query) ||
        item.description.toLocaleLowerCase('en-GB').includes(query) ||
        item.steps.some((step) => step.title.toLocaleLowerCase('en-GB').includes(query)),
    );
  });
  protected readonly filteredHazards = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en-GB');
    return this.hazards().filter(
      (item) =>
        !query ||
        item.name.toLocaleLowerCase('en-GB').includes(query) ||
        item.description.toLocaleLowerCase('en-GB').includes(query) ||
        item.data.hazard.toLocaleLowerCase('en-GB').includes(query) ||
        item.data.controls.toLocaleLowerCase('en-GB').includes(query),
    );
  });

  constructor() {
    void this.load();
  }

  protected switchTab(tab: LibraryTab): void {
    this.activeTab.set(tab);
    this.query.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected startTemplateEdit(template: RamsTemplate): void {
    this.templateEdits.update((edits) => ({
      ...edits,
      [template.id]: {
        name: template.name,
        description: template.description,
        sourceRamsId: '',
      },
    }));
    this.editingTemplateId.set(template.id);
    this.templateSourceEditTouched.set(false);
  }

  protected openTemplateCreate(): void {
    this.showTemplateCreate.set(true);
    this.templateSourceDraftTouched.set(false);
    this.templateSourceQuery.set('');
    this.templateSourceRamsId.set('');
    this.templateSourceResults.set([]);
  }

  protected closeTemplateCreate(): void {
    this.showTemplateCreate.set(false);
    this.templateSourceDraftTouched.set(false);
    this.templateSourceResults.set([]);
  }

  protected touchTemplateSourceDraft(): void {
    this.templateSourceDraftTouched.set(true);
  }

  protected touchTemplateSourceEdit(): void {
    this.templateSourceEditTouched.set(true);
  }

  protected closeTemplateEdit(): void {
    this.editingTemplateId.set('');
    this.templateSourceEditTouched.set(false);
    this.templateSourceResults.set([]);
  }

  protected updateTemplateEdit(id: string, field: keyof TemplateEdit, value: string): void {
    this.templateEdits.update((edits) => ({
      ...edits,
      [id]: { ...(edits[id] ?? { name: '', description: '', sourceRamsId: '' }), [field]: value },
    }));
  }

  protected async createTemplate(): Promise<void> {
    const name = this.templateName().trim();
    const sourceId = this.templateSourceRamsId();
    if (!name || !this.canManage()) return;
    await this.run(async () => {
      const data = sourceId
        ? structuredClone((await this.api.getRams(this.organisationId, sourceId)).rams.draftData)
        : blankRamsDraft();
      await this.api.createRamsTemplate(this.organisationId, {
        name,
        description: this.templateDescription().trim(),
        data,
      });
      this.showTemplateCreate.set(false);
      this.templateName.set('');
      this.templateDescription.set('');
      this.templateSourceRamsId.set('');
      this.templateSourceQuery.set('');
      this.templateSourceDraftTouched.set(false);
      this.templateSourceResults.set([]);
      await this.reloadTemplates();
      this.notice.set('RAMS template created.');
    });
  }

  protected searchTemplateSources(value: string): void {
    this.templateSourceQuery.set(value);
    this.templateSourceRamsId.set('');
    if (this.sourceSearchTimer) clearTimeout(this.sourceSearchTimer);
    const query = value.trim();
    if (query.length < 2) {
      this.templateSourceResults.set(query ? [] : this.rams().slice(0, 10));
      return;
    }
    this.sourceSearchTimer = setTimeout(() => {
      void this.api
        .listRams(this.organisationId, { search: query, limit: 20 })
        .then(({ rams }) => this.templateSourceResults.set(rams))
        .catch(() => {
          const normalized = query.toLocaleLowerCase('en-GB');
          this.templateSourceResults.set(
            this.rams()
              .filter((item) => this.ramsSearchText(item).includes(normalized))
              .slice(0, 20),
          );
        });
    }, 250);
  }

  protected selectTemplateSource(item: OrganisationRamsSummary, templateId?: string): void {
    const label = `${item.reference} / ${item.title || item.visits[0]?.title || 'Untitled RAMS'}`;
    if (templateId) this.updateTemplateEdit(templateId, 'sourceRamsId', item.id);
    else this.templateSourceRamsId.set(item.id);
    this.templateSourceQuery.set(label);
    this.templateSourceResults.set([]);
  }

  protected async saveTemplate(template: RamsTemplate, replaceContent: boolean): Promise<void> {
    const edit = this.templateEdits()[template.id];
    if (!edit?.name.trim() || !this.canManage()) return;
    await this.run(async () => {
      let data = template.data;
      if (replaceContent) {
        if (!edit.sourceRamsId) throw new Error('Choose a RAMS to replace the template content.');
        data = (await this.api.getRams(this.organisationId, edit.sourceRamsId)).rams.draftData;
      }
      await this.api.updateRamsTemplate(this.organisationId, template.id, {
        name: edit.name.trim(),
        description: edit.description.trim(),
        data: structuredClone(data),
      });
      this.closeTemplateEdit();
      await this.reloadTemplates();
      this.notice.set(replaceContent ? 'Template content replaced.' : 'Template details saved.');
    });
  }

  protected async archiveTemplate(template: RamsTemplate): Promise<void> {
    if (!this.canManage() || !confirm(`Archive the "${template.name}" RAMS template?`)) return;
    await this.run(async () => {
      await this.api.deleteRamsTemplate(this.organisationId, template.id);
      await this.reloadTemplates();
      this.notice.set('RAMS template archived.');
    });
  }

  protected startGroupEdit(group: RamsMethodGroup): void {
    this.groupEdits.update((edits) => ({
      ...edits,
      [group.id]: {
        name: group.name,
        description: group.description,
        steps: structuredClone(group.steps),
      },
    }));
    this.editingGroupId.set(group.id);
  }

  protected updateGroup(id: string, field: 'name' | 'description', value: string): void {
    this.groupEdits.update((edits) => ({
      ...edits,
      [id]: { ...(edits[id] ?? this.blankGroup()), [field]: value },
    }));
  }

  protected updateNewGroup(field: 'name' | 'description', value: string): void {
    this.newGroup.update((group) => ({ ...group, [field]: value }));
  }

  protected addGroupStep(id?: string): void {
    this.changeGroupSteps(id, (steps) => {
      if (steps.length < 200) steps.push(this.blankStep());
    });
  }

  protected updateGroupStep(
    index: number,
    field: Exclude<keyof RamsMethodStep, 'id'>,
    value: string,
    id?: string,
  ): void {
    this.changeGroupSteps(id, (steps) => {
      const step = steps[index];
      if (!step) return;
      step[field] = value;
    });
  }

  protected moveGroupStep(index: number, offset: number, id?: string): void {
    this.changeGroupSteps(id, (steps) => {
      const target = index + offset;
      if (target < 0 || target >= steps.length) return;
      const [step] = steps.splice(index, 1);
      if (step) steps.splice(target, 0, step);
    });
  }

  protected removeGroupStep(index: number, id?: string): void {
    this.changeGroupSteps(id, (steps) => steps.splice(index, 1));
  }

  protected async createGroup(): Promise<void> {
    const group = this.newGroup();
    if (!group.name.trim() || !this.validSteps(group.steps) || !this.canManage()) return;
    await this.run(async () => {
      await this.api.createRamsMethodGroup(this.organisationId, this.cleanGroup(group));
      this.newGroup.set(this.blankGroup());
      this.showGroupCreate.set(false);
      await this.reloadGroups();
      this.notice.set('Method statement group created.');
    });
  }

  protected async saveGroup(group: RamsMethodGroup): Promise<void> {
    const edit = this.groupEdits()[group.id];
    if (!edit?.name.trim() || !this.validSteps(edit.steps) || !this.canManage()) return;
    await this.run(async () => {
      await this.api.updateRamsMethodGroup(this.organisationId, group.id, this.cleanGroup(edit));
      this.editingGroupId.set('');
      await this.reloadGroups();
      this.notice.set('Method statement group saved.');
    });
  }

  protected async archiveGroup(group: RamsMethodGroup): Promise<void> {
    if (!this.canManage() || !confirm(`Archive the "${group.name}" method statement group?`))
      return;
    await this.run(async () => {
      await this.api.deleteRamsMethodGroup(this.organisationId, group.id);
      await this.reloadGroups();
      this.notice.set('Method statement group archived.');
    });
  }

  protected startHazardEdit(hazard: RamsLibraryHazard): void {
    this.hazardEdits.update((edits) => ({
      ...edits,
      [hazard.id]: this.hazardToEdit(hazard),
    }));
    this.editingHazardId.set(hazard.id);
  }

  protected readonly toNumber = (value: unknown): number => Number(value);

  protected updateHazardEdit(
    id: string,
    field: keyof HazardEdit,
    value: string | boolean | number,
  ): void {
    this.hazardEdits.update((edits) => {
      const current = edits[id] ?? this.blankHazard();
      return {
        ...edits,
        [id]: { ...current, [field]: value },
      };
    });
  }

  protected updateNewHazard(field: keyof HazardEdit, value: string | boolean | number): void {
    this.newHazard.update((hazard) => ({ ...hazard, [field]: value }));
  }

  protected async createHazard(): Promise<void> {
    const hazard = this.newHazard();
    if (!hazard.name.trim() || !hazard.hazard.trim() || !this.canManage()) return;
    await this.run(async () => {
      await this.api.createRamsHazard(this.organisationId, this.cleanHazard(hazard));
      this.newHazard.set(this.blankHazard());
      this.showHazardCreate.set(false);
      await this.reloadHazards();
      this.notice.set('Hazard added to the library.');
    });
  }

  protected async saveHazard(hazard: RamsLibraryHazard): Promise<void> {
    const edit = this.hazardEdits()[hazard.id];
    if (!edit?.name.trim() || !edit?.hazard.trim() || !this.canManage()) return;
    await this.run(async () => {
      await this.api.updateRamsHazard(this.organisationId, hazard.id, this.cleanHazard(edit));
      this.editingHazardId.set('');
      await this.reloadHazards();
      this.notice.set('Library hazard saved.');
    });
  }

  protected async archiveHazard(hazard: RamsLibraryHazard): Promise<void> {
    if (!this.canManage() || !confirm(`Archive the "${hazard.name}" library hazard?`)) return;
    await this.run(async () => {
      await this.api.deleteRamsHazard(this.organisationId, hazard.id);
      await this.reloadHazards();
      this.notice.set('Library hazard archived.');
    });
  }

  protected async toggleHazardDefault(hazard: RamsLibraryHazard): Promise<void> {
    if (!this.canManage()) return;
    await this.run(async () => {
      const edit = this.hazardToEdit(hazard);
      await this.api.updateRamsHazard(this.organisationId, hazard.id, {
        ...this.cleanHazard(edit),
        isDefault: !hazard.isDefault,
      });
      await this.reloadHazards();
      this.notice.set(hazard.isDefault ? 'No longer a default hazard.' : 'Set as default hazard.');
    });
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  protected statusLabel(value: string): string {
    return value
      .toLocaleLowerCase('en-GB')
      .replaceAll('_', ' ')
      .replace(/^./u, (item) => item.toUpperCase());
  }

  private initialTab(): LibraryTab {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    return tab === 'templates' || tab === 'methods' || tab === 'hazards' ? tab : 'all';
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const [account, rams, templates, groups, hazards] = await Promise.all([
        this.api.currentUser(),
        this.api.listRams(this.organisationId, { limit: 50 }),
        this.api.listRamsTemplates(this.organisationId),
        this.api.listRamsMethodGroups(this.organisationId),
        this.api.listRamsHazards(this.organisationId),
      ]);
      this.capabilities.set(
        account.memberships.find(({ organisation }) => organisation.id === this.organisationId)
          ?.role.capabilities ?? [],
      );
      this.rams.set(rams.rams);
      this.templateSourceResults.set(rams.rams.slice(0, 10));
      this.templates.set(templates.templates);
      this.groups.set(groups.groups);
      this.hazards.set(hazards.hazards);
    });
  }

  private async reloadTemplates(): Promise<void> {
    this.templates.set((await this.api.listRamsTemplates(this.organisationId)).templates);
  }

  private async reloadGroups(): Promise<void> {
    this.groups.set((await this.api.listRamsMethodGroups(this.organisationId)).groups);
  }

  private async reloadHazards(): Promise<void> {
    this.hazards.set((await this.api.listRamsHazards(this.organisationId)).hazards);
  }

  private changeGroupSteps(
    id: string | undefined,
    operation: (steps: RamsMethodStep[]) => void,
  ): void {
    if (id === undefined) {
      this.newGroup.update((group) => {
        const next = structuredClone(group);
        operation(next.steps);
        return next;
      });
      return;
    }
    this.groupEdits.update((edits) => {
      const next = { ...edits };
      const group = structuredClone(next[id] ?? this.blankGroup());
      operation(group.steps);
      next[id] = group;
      return next;
    });
  }

  private validSteps(steps: RamsMethodStep[]): boolean {
    return (
      steps.length > 0 &&
      steps.length <= 200 &&
      steps.every((step) => step.title.trim() && step.detail.trim())
    );
  }

  private cleanGroup(group: GroupEdit) {
    return {
      name: group.name.trim(),
      description: group.description.trim(),
      steps: structuredClone(group.steps),
    };
  }

  private blankGroup(): GroupEdit {
    return { name: '', description: '', steps: [this.blankStep()] };
  }

  private blankStep(): RamsMethodStep {
    return {
      id: crypto.randomUUID(),
      title: '',
      detail: '',
    };
  }

  private ramsSearchText(item: OrganisationRamsSummary): string {
    return [
      item.reference,
      item.title,
      ...item.visits.flatMap((visit) => [
        visit.reference,
        visit.title,
        visit.customer.name,
        visit.site.name,
      ]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('en-GB');
  }

  private blankHazard(): HazardEdit {
    return {
      name: '',
      description: '',
      isDefault: false,
      hazard: '',
      peopleAtRisk: '',
      howHarmed: '',
      controls: '',
      furtherActions: '',
      actionOwner: '',
      actionDueDate: '',
      actionStatus: 'OPEN',
      initialLikelihood: 3,
      initialSeverity: 5,
      residualLikelihood: 1,
      residualSeverity: 3,
    };
  }

  private hazardToEdit(hazard: RamsLibraryHazard): HazardEdit {
    const data = hazard.data;
    return {
      name: hazard.name,
      description: hazard.description,
      isDefault: hazard.isDefault,
      hazard: data.hazard,
      peopleAtRisk: data.peopleAtRisk,
      howHarmed: data.howHarmed,
      controls: data.controls,
      furtherActions: data.furtherActions ?? '',
      actionOwner: data.actionOwner ?? '',
      actionDueDate: data.actionDueDate ?? '',
      actionStatus: data.actionStatus ?? 'OPEN',
      initialLikelihood: data.initialLikelihood,
      initialSeverity: data.initialSeverity,
      residualLikelihood: data.residualLikelihood,
      residualSeverity: data.residualSeverity,
    };
  }

  private cleanHazard(edit: HazardEdit): {
    name: string;
    description: string;
    isDefault: boolean;
    data: RamsHazard;
  } {
    const clamp = (value: number): number => Math.min(5, Math.max(1, Math.round(value) || 1));
    return {
      name: edit.name.trim(),
      description: edit.description.trim(),
      isDefault: edit.isDefault,
      data: {
        id: crypto.randomUUID(),
        hazard: edit.hazard.trim(),
        peopleAtRisk: edit.peopleAtRisk.trim(),
        howHarmed: edit.howHarmed.trim(),
        controls: edit.controls.trim(),
        furtherActions: edit.furtherActions.trim(),
        actionOwner: edit.actionOwner.trim(),
        actionDueDate: edit.actionDueDate.trim(),
        actionStatus: edit.actionStatus,
        initialLikelihood: clamp(edit.initialLikelihood),
        initialSeverity: clamp(edit.initialSeverity),
        residualLikelihood: clamp(edit.residualLikelihood),
        residualSeverity: clamp(edit.residualSeverity),
      },
    };
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update the RAMS library.');
    } finally {
      this.busy.set(false);
    }
  }
}
