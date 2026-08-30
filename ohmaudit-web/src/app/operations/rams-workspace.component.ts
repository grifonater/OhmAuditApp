import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ApiService,
  type RamsDetail,
  type RamsDraft,
  type RamsHazard,
  type RamsMethodGroup,
  type RamsTemplate,
} from '../core/api.service';
import { applyRamsTemplate, cloneMethodSteps, hasReplaceableRamsWork } from '../core/rams-library';
import { ramsPdfFileName } from '../core/rams-routes';

type RamsTab = 'overview' | 'scope' | 'method' | 'risk' | 'requirements' | 'supporting' | 'review';
type ScopeList = 'exclusions' | 'engineerBriefing' | 'keyActivities' | 'assumptions' | 'workAreas';
type RequirementList =
  | 'ppe'
  | 'tools'
  | 'competencies'
  | 'emergencyArrangements'
  | 'plant'
  | 'materials'
  | 'training'
  | 'substances'
  | 'welfare';
type SupportingReferenceList =
  'permitReferences' | 'coshhReferences' | 'workingAtHeightReferences' | 'legislationReferences';

@Component({
  selector: 'oa-rams-workspace',
  imports: [RouterLink],
  templateUrl: './rams-workspace.component.html',
  styleUrls: ['./operations.css', './rams-workspace.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RamsWorkspaceComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly organisationId = this.route.snapshot.paramMap.get('organisationId') ?? '';
  protected readonly visitId = this.route.snapshot.paramMap.get('visitId') ?? '';
  private readonly routeRamsId = this.route.snapshot.paramMap.get('ramsId');
  protected readonly rams = signal<RamsDetail | undefined>(undefined);
  protected readonly draft = signal<RamsDraft | undefined>(undefined);
  protected readonly capabilities = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly reviewComment = signal('');
  protected readonly savedAt = signal<Date | undefined>(undefined);
  protected readonly templates = signal<RamsTemplate[]>([]);
  protected readonly methodGroups = signal<RamsMethodGroup[]>([]);
  protected readonly templateQuery = signal('');
  protected readonly methodGroupQuery = signal('');
  protected readonly selectedTemplateId = signal('');
  protected readonly selectedMethodGroupId = signal('');
  protected readonly tabs: Array<{ key: RamsTab; label: string; number: number }> = [
    { key: 'overview', label: 'Overview', number: 1 },
    { key: 'scope', label: 'Scope', number: 2 },
    { key: 'method', label: 'Method Statement', number: 3 },
    { key: 'risk', label: 'Risk Assessment', number: 4 },
    { key: 'requirements', label: 'PPE & Requirements', number: 5 },
    { key: 'supporting', label: 'Supporting Information', number: 6 },
    { key: 'review', label: 'Review & Issue', number: 7 },
  ];
  protected readonly activeTab = signal<RamsTab>(this.initialTab());
  protected readonly ppeOptions = [
    'Safety helmet',
    'Safety glasses',
    'Protective gloves',
    'High-visibility clothing',
    'Safety footwear',
    'Hearing protection',
    'Arc-rated clothing',
    'Respiratory protection',
  ];
  protected readonly toolOptions = [
    'Insulated hand tools',
    'Approved voltage indicator',
    'Proving unit',
    'Lock-off kit',
    'Barriers and signage',
    'First aid kit',
  ];
  protected readonly competencyOptions = [
    '18th Edition Wiring Regulations',
    'Authorised Person (LV)',
    'Electrical safe isolation',
    'Manual handling',
    'Working at height',
    'Emergency first aid',
  ];
  protected readonly emergencyOptions = [
    'Emergency contact numbers confirmed',
    'Isolation and emergency procedures briefed',
    'First aid arrangements confirmed',
    'Fire and evacuation procedures confirmed',
    'Nearest hospital / treatment route identified',
  ];
  protected readonly requirementCards: Array<{
    key: RequirementList;
    eyebrow: string;
    label: string;
    required?: boolean;
  }> = [
    { key: 'plant', eyebrow: 'Equipment', label: 'Plant & machinery' },
    { key: 'materials', eyebrow: 'Resources', label: 'Materials' },
    { key: 'training', eyebrow: 'People', label: 'Training' },
    { key: 'substances', eyebrow: 'COSHH', label: 'Substances' },
    { key: 'welfare', eyebrow: 'Site', label: 'Welfare' },
  ];
  protected readonly likelihoods = [1, 2, 3, 4, 5];
  protected readonly severities = [5, 4, 3, 2, 1];
  protected readonly canManage = computed(() => this.capabilities().includes('rams.manage'));
  protected readonly canReview = computed(() => this.capabilities().includes('rams.review'));
  protected readonly canApprove = computed(() => this.capabilities().includes('rams.approve'));
  protected readonly editable = computed(() => {
    const status = this.rams()?.status;
    return this.canManage() && (status === 'DRAFT' || status === 'RETURNED');
  });
  protected readonly filteredTemplates = computed(() => {
    const query = this.templateQuery().trim().toLocaleLowerCase('en-GB');
    return this.templates().filter(
      (template) =>
        !query ||
        template.name.toLocaleLowerCase('en-GB').includes(query) ||
        template.description.toLocaleLowerCase('en-GB').includes(query),
    );
  });
  protected readonly filteredMethodGroups = computed(() => {
    const query = this.methodGroupQuery().trim().toLocaleLowerCase('en-GB');
    return this.methodGroups().filter(
      (group) =>
        !query ||
        group.name.toLocaleLowerCase('en-GB').includes(query) ||
        group.description.toLocaleLowerCase('en-GB').includes(query) ||
        group.steps.some((step) => step.title.toLocaleLowerCase('en-GB').includes(query)),
    );
  });
  protected readonly sectionCompletion = computed<Record<RamsTab, boolean>>(() => {
    const draft = this.draft();
    if (draft === undefined)
      return {
        overview: false,
        scope: false,
        method: false,
        risk: false,
        requirements: false,
        supporting: false,
        review: false,
      };
    const riskComplete =
      draft.riskAssessment.hazards.length > 0 &&
      draft.riskAssessment.hazards.every(
        (hazard) =>
          hazard.hazard.trim() &&
          hazard.peopleAtRisk.trim() &&
          hazard.howHarmed.trim() &&
          hazard.controls.trim(),
      );
    const supportingComplete = Boolean(
      draft.supportingInformation.siteAccess.trim() ||
      draft.supportingInformation.permits.trim() ||
      draft.supportingInformation.welfare.trim() ||
      draft.supportingInformation.environmental.trim() ||
      draft.supportingInformation.references.length ||
      draft.supportingInformation.permitReferences.length ||
      draft.supportingInformation.coshhReferences.length ||
      draft.supportingInformation.workingAtHeightReferences.length ||
      draft.supportingInformation.legislationReferences.length ||
      draft.supportingInformation.documents.length ||
      draft.supportingInformation.electricalSafety.length,
    );
    const scopeComplete = Boolean(
      draft.scope.scopeOfWorks.trim() &&
      draft.scope.keyActivities.some((item) => item.trim()) &&
      draft.scope.workAreas.some((item) => item.trim()) &&
      draft.scope.workBoundaries.trim() &&
      draft.scope.responsibilities.some(
        (item) => item.name.trim() && item.role.trim() && item.responsibility.trim(),
      ),
    );
    const methodComplete =
      draft.methodStatement.steps.length > 0 &&
      draft.methodStatement.steps.every(
        (step) => step.title.trim() && step.detail.trim() && step.responsibility.trim(),
      );
    const requirementsComplete = Boolean(
      draft.requirements.ppe.length > 0 &&
      draft.requirements.emergencyArrangements.length > 0 &&
      draft.requirements.emergencyDetails.contactName.trim() &&
      draft.requirements.emergencyDetails.contactNumber.trim() &&
      draft.requirements.emergencyDetails.assemblyPoint.trim(),
    );
    const requiredComplete =
      draft.overview.title.trim().length > 0 &&
      Boolean(draft.overview.effectiveFrom) &&
      scopeComplete &&
      methodComplete &&
      riskComplete &&
      requirementsComplete;
    return {
      overview: Boolean(draft.overview.title.trim() && draft.overview.effectiveFrom),
      scope: scopeComplete,
      method: methodComplete,
      risk: riskComplete,
      requirements: requirementsComplete,
      supporting: supportingComplete,
      review: requiredComplete,
    };
  });
  protected readonly readiness = computed(() => {
    const completion = this.sectionCompletion();
    const keys: RamsTab[] = ['overview', 'scope', 'method', 'risk', 'requirements'];
    return Math.round((keys.filter((key) => completion[key]).length / keys.length) * 100);
  });

  constructor() {
    void this.load();
  }

  protected switchTab(tab: RamsTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goRelative(offset: number): void {
    const current = this.tabs.findIndex(({ key }) => key === this.activeTab());
    const next = this.tabs[Math.max(0, Math.min(this.tabs.length - 1, current + offset))];
    if (next) this.switchTab(next.key);
  }

  protected applyTemplate(): void {
    const current = this.draft();
    const template = this.templates().find(({ id }) => id === this.selectedTemplateId());
    if (!current || !template || !this.editable()) return;
    if (
      hasReplaceableRamsWork(current) &&
      !confirm(
        `Replace the reusable content in this RAMS with "${template.name}"? Job and site details will be preserved.`,
      )
    )
      return;
    this.draft.set(applyRamsTemplate(current, template.data, () => crypto.randomUUID()));
    this.notice.set(`Applied "${template.name}". Save the draft to keep this change.`);
  }

  protected applyMethodGroup(mode: 'APPEND' | 'REPLACE'): void {
    const group = this.methodGroups().find(({ id }) => id === this.selectedMethodGroupId());
    const current = this.draft();
    if (!group || !current || !this.editable()) return;
    const existing = current.methodStatement.steps.length;
    if (mode === 'APPEND' && existing + group.steps.length > 200) {
      this.error.set('Method statements can contain no more than 200 steps.');
      return;
    }
    if (
      mode === 'REPLACE' &&
      existing > 0 &&
      !confirm(`Replace all method steps with "${group.name}"?`)
    )
      return;
    this.mutate((draft) => {
      const steps = cloneMethodSteps(group.steps.slice(0, 200), () => crypto.randomUUID());
      draft.methodStatement.steps =
        mode === 'REPLACE' ? steps : [...draft.methodStatement.steps, ...steps];
    });
    this.error.set('');
    this.notice.set(
      `${mode === 'REPLACE' ? 'Replaced' : 'Appended'} method steps from "${group.name}". Save the draft to keep this change.`,
    );
  }

  protected updateOverview(field: keyof RamsDraft['overview'], value: string): void {
    this.mutate((draft) => {
      draft.overview[field] = value;
    });
  }

  protected updateScope(field: 'scopeOfWorks' | 'workBoundaries', value: string): void {
    this.mutate((draft) => {
      draft.scope[field] = value;
    });
  }

  protected addScopeItem(list: ScopeList): void {
    this.mutate((draft) => draft.scope[list].push(''));
  }

  protected updateScopeItem(list: ScopeList, index: number, value: string): void {
    this.mutate((draft) => {
      draft.scope[list][index] = value;
    });
  }

  protected removeScopeItem(list: ScopeList, index: number): void {
    this.mutate((draft) => draft.scope[list].splice(index, 1));
  }

  protected scopeItems(draft: RamsDraft, list: ScopeList): string[] {
    return draft.scope[list];
  }

  protected addResponsibility(): void {
    this.mutate((draft) =>
      draft.scope.responsibilities.push({
        id: crypto.randomUUID(),
        name: '',
        role: '',
        organisation: '',
        responsibility: '',
        contact: '',
      }),
    );
  }

  protected updateResponsibility(
    index: number,
    field: Exclude<keyof RamsDraft['scope']['responsibilities'][number], 'id'>,
    value: string,
  ): void {
    this.mutate((draft) => {
      const item = draft.scope.responsibilities[index];
      if (item) item[field] = value;
    });
  }

  protected removeResponsibility(index: number): void {
    this.mutate((draft) => draft.scope.responsibilities.splice(index, 1));
  }

  protected addMethodStep(): void {
    this.mutate((draft) =>
      draft.methodStatement.steps.push({
        id: crypto.randomUUID(),
        title: '',
        required: true,
        detail: '',
        responsibility: '',
        estimatedMinutes: 0,
      }),
    );
  }

  protected updateMethodStep(
    index: number,
    field: 'title' | 'required' | 'detail' | 'responsibility' | 'estimatedMinutes',
    value: string | boolean | number,
  ): void {
    this.mutate((draft) => {
      const step = draft.methodStatement.steps[index];
      if (!step) return;
      if (field === 'title' && typeof value === 'string') step.title = value;
      if (field === 'detail' && typeof value === 'string') step.detail = value;
      if (field === 'responsibility' && typeof value === 'string') step.responsibility = value;
      if (field === 'estimatedMinutes') step.estimatedMinutes = Math.max(0, Number(value) || 0);
      if (field === 'required' && typeof value === 'boolean') step.required = value;
    });
  }

  protected moveMethodStep(index: number, offset: number): void {
    this.mutate((draft) => {
      const steps = draft.methodStatement.steps;
      const target = index + offset;
      if (target < 0 || target >= steps.length) return;
      const [step] = steps.splice(index, 1);
      if (step) steps.splice(target, 0, step);
    });
  }

  protected removeMethodStep(index: number): void {
    this.mutate((draft) => draft.methodStatement.steps.splice(index, 1));
  }

  protected readonly totalEstimatedMinutes = computed(() =>
    (this.draft()?.methodStatement.steps ?? []).reduce(
      (total, step) => total + step.estimatedMinutes,
      0,
    ),
  );

  protected addHazard(): void {
    const hazard: RamsHazard = {
      id: crypto.randomUUID(),
      hazard: '',
      peopleAtRisk: '',
      initialLikelihood: 3,
      initialSeverity: 3,
      controls: '',
      residualLikelihood: 1,
      residualSeverity: 3,
      howHarmed: '',
      furtherActions: '',
      actionOwner: '',
      actionDueDate: '',
      actionStatus: 'OPEN',
    };
    this.mutate((draft) => draft.riskAssessment.hazards.push(hazard));
  }

  protected updateHazard(index: number, field: keyof RamsHazard, value: string | number): void {
    this.mutate((draft) => {
      const hazard = draft.riskAssessment.hazards[index];
      if (!hazard || field === 'id') return;
      if (
        field === 'initialLikelihood' ||
        field === 'initialSeverity' ||
        field === 'residualLikelihood' ||
        field === 'residualSeverity'
      ) {
        hazard[field] = Number(value);
      } else if (field === 'actionStatus') {
        if (value === 'OPEN' || value === 'CONTROLLED') hazard.actionStatus = value;
      } else if (typeof value === 'string') {
        hazard[field] = value;
      }
    });
  }

  protected removeHazard(index: number): void {
    this.mutate((draft) => draft.riskAssessment.hazards.splice(index, 1));
  }

  protected readonly highResidualHazards = computed(() =>
    (this.draft()?.riskAssessment.hazards ?? []).filter(
      (hazard) => this.riskScore(hazard.residualLikelihood, hazard.residualSeverity) >= 10,
    ),
  );

  protected toggleRequirement(list: RequirementList, value: string): void {
    if (!this.editable()) return;
    this.mutate((draft) => {
      const values = draft.requirements[list];
      const index = values.indexOf(value);
      if (index === -1) values.push(value);
      else values.splice(index, 1);
    });
  }

  protected hasRequirement(list: RequirementList, value: string): boolean {
    return this.draft()?.requirements[list].includes(value) ?? false;
  }

  protected addCustomRequirement(list: RequirementList): void {
    this.mutate((draft) => draft.requirements[list].push(''));
  }

  protected updateRequirement(list: RequirementList, index: number, value: string): void {
    this.mutate((draft) => {
      draft.requirements[list][index] = value;
    });
  }

  protected removeRequirement(list: RequirementList, index: number): void {
    this.mutate((draft) => draft.requirements[list].splice(index, 1));
  }

  protected updateEmergencyDetail(
    field: keyof RamsDraft['requirements']['emergencyDetails'],
    value: string,
  ): void {
    this.mutate((draft) => {
      draft.requirements.emergencyDetails[field] = value;
    });
  }

  protected updateSupporting(
    field: 'siteAccess' | 'permits' | 'welfare' | 'environmental',
    value: string,
  ): void {
    this.mutate((draft) => {
      draft.supportingInformation[field] = value;
    });
  }

  protected addReference(): void {
    this.mutate((draft) =>
      draft.supportingInformation.references.push({ id: crypto.randomUUID(), title: '', url: '' }),
    );
  }

  protected updateReference(index: number, field: 'title' | 'url', value: string): void {
    this.mutate((draft) => {
      const reference = draft.supportingInformation.references[index];
      if (reference) reference[field] = value;
    });
  }

  protected removeReference(index: number): void {
    this.mutate((draft) => draft.supportingInformation.references.splice(index, 1));
  }

  protected addStructuredReference(list: SupportingReferenceList): void {
    this.mutate((draft) =>
      draft.supportingInformation[list].push({ id: crypto.randomUUID(), name: '', reference: '' }),
    );
  }

  protected structuredReferences(draft: RamsDraft, list: SupportingReferenceList) {
    return draft.supportingInformation[list];
  }

  protected updateStructuredReference(
    list: SupportingReferenceList,
    index: number,
    field: 'name' | 'reference',
    value: string,
  ): void {
    this.mutate((draft) => {
      const reference = draft.supportingInformation[list][index];
      if (reference) reference[field] = value;
    });
  }

  protected removeStructuredReference(list: SupportingReferenceList, index: number): void {
    this.mutate((draft) => draft.supportingInformation[list].splice(index, 1));
  }

  protected addDocument(): void {
    this.mutate((draft) =>
      draft.supportingInformation.documents.push({
        id: crypto.randomUUID(),
        name: '',
        type: '',
        reference: '',
        status: '',
      }),
    );
  }

  protected updateDocument(
    index: number,
    field: Exclude<keyof RamsDraft['supportingInformation']['documents'][number], 'id'>,
    value: string,
  ): void {
    this.mutate((draft) => {
      const document = draft.supportingInformation.documents[index];
      if (document) document[field] = value;
    });
  }

  protected removeDocument(index: number): void {
    this.mutate((draft) => draft.supportingInformation.documents.splice(index, 1));
  }

  protected addElectricalSafety(): void {
    this.mutate((draft) => draft.supportingInformation.electricalSafety.push(''));
  }

  protected updateElectricalSafety(index: number, value: string): void {
    this.mutate((draft) => {
      draft.supportingInformation.electricalSafety[index] = value;
    });
  }

  protected removeElectricalSafety(index: number): void {
    this.mutate((draft) => draft.supportingInformation.electricalSafety.splice(index, 1));
  }

  protected updateApprovalMode(value: string): void {
    if (value !== 'AUTHOR' && value !== 'REVIEWER') return;
    this.mutate((draft) => {
      draft.review.approvalMode = value;
    });
  }

  protected toggleAcknowledgement(): void {
    this.mutate((draft) => {
      draft.review.requireEngineerAcknowledgement = !draft.review.requireEngineerAcknowledgement;
    });
  }

  protected updateReview(
    field: 'internalNotes' | 'revisionReason' | 'changeSummary',
    value: string,
  ): void {
    this.mutate((draft) => {
      draft.review[field] = value;
    });
  }

  protected updateChangeImpact(value: string): void {
    if (value !== 'LOW' && value !== 'MEDIUM' && value !== 'HIGH') return;
    this.mutate((draft) => {
      draft.review.changeImpact = value;
    });
  }

  protected riskScore(likelihood: number, severity: number): number {
    return likelihood * severity;
  }

  protected riskClass(score: number): string {
    return score <= 4 ? 'low' : score <= 9 ? 'medium' : score <= 15 ? 'high' : 'very-high';
  }

  protected async save(): Promise<void> {
    const rams = this.rams();
    const draft = this.draft();
    if (!rams || !draft || !this.editable()) return;
    await this.run(async () => {
      await this.api.updateRams(this.organisationId, rams.id, this.cleanDraft(draft));
      await this.reload(rams.id);
      this.savedAt.set(new Date());
      this.notice.set('Draft saved.');
    });
  }

  protected async saveAndContinue(): Promise<void> {
    if (this.editable()) await this.save();
    if (!this.error()) this.goRelative(1);
  }

  protected async requestReview(): Promise<void> {
    const rams = this.rams();
    if (!rams || !this.editable() || !this.sectionCompletion().review) return;
    await this.run(async () => {
      const draft = this.draft();
      if (draft) await this.api.updateRams(this.organisationId, rams.id, this.cleanDraft(draft));
      await this.api.submitRams(this.organisationId, rams.id);
      await this.reload(rams.id);
      this.switchTab('review');
      this.notice.set('RAMS submitted for review.');
    });
  }

  protected pdfActionLabel(): string {
    const status = this.rams()?.status;
    if (status === 'APPROVED') return 'Download approved PDF';
    if (status === 'UNDER_REVIEW') return 'Download review PDF';
    return 'Download draft PDF';
  }

  protected async downloadPdf(): Promise<void> {
    const rams = this.rams();
    if (!rams) return;
    await this.run(async () => {
      const blob = await this.api.downloadRamsPdf(this.organisationId, rams.id);
      this.saveBlob(
        blob,
        ramsPdfFileName(
          this.draft()?.overview.title || rams.title || rams.reference,
          rams.status,
          rams.currentRevisionNumber,
        ),
      );
      this.notice.set('RAMS PDF downloaded.');
    });
  }

  protected async review(action: 'APPROVE' | 'RETURN'): Promise<void> {
    const rams = this.rams();
    if (!rams || rams.status !== 'UNDER_REVIEW') return;
    await this.run(async () => {
      await this.api.reviewRams(this.organisationId, rams.id, {
        action,
        ...(this.reviewComment().trim() ? { comment: this.reviewComment().trim() } : {}),
      });
      await this.reload(rams.id);
      this.reviewComment.set('');
      this.notice.set(action === 'APPROVE' ? 'RAMS approved.' : 'RAMS returned for changes.');
    });
  }

  protected formatDate(value: string | null | undefined, includeTime = false): string {
    if (!value) return 'Not set';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(value));
  }

  protected personName(
    person: { displayName?: string | null; email: string } | null | undefined,
  ): string {
    return person?.displayName || person?.email || 'Not assigned';
  }

  protected statusLabel(status: string): string {
    return status
      .toLocaleLowerCase('en-GB')
      .replaceAll('_', ' ')
      .replace(/^./u, (value) => value.toLocaleUpperCase('en-GB'));
  }

  private initialTab(): RamsTab {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    return this.tabs.some(({ key }) => key === tab) ? (tab as RamsTab) : 'overview';
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      const [account, templates, groups] = await Promise.all([
        this.api.currentUser(),
        this.api.listRamsTemplates(this.organisationId),
        this.api.listRamsMethodGroups(this.organisationId),
      ]);
      this.templates.set(templates.templates);
      this.methodGroups.set(groups.groups);
      this.capabilities.set(
        account.memberships.find(({ organisation }) => organisation.id === this.organisationId)
          ?.role.capabilities ?? [],
      );
      if (this.routeRamsId === null) {
        const { rams } = await this.api.createVisitRams(this.organisationId, this.visitId);
        this.setRams(rams);
        await this.router.navigate(
          ['/app/org', this.organisationId, 'visits', this.visitId, 'rams', rams.id],
          { replaceUrl: true, queryParams: { tab: this.activeTab() } },
        );
      } else {
        await this.reload(this.routeRamsId);
      }
    });
  }

  private async reload(ramsId: string): Promise<void> {
    const { rams } = await this.api.getRams(this.organisationId, ramsId);
    this.setRams(rams);
  }

  private setRams(rams: RamsDetail): void {
    this.rams.set(rams);
    this.draft.set(this.normalizeDraft(rams.draftData));
    this.reviewComment.set(rams.reviewComment ?? '');
  }

  private mutate(operation: (draft: RamsDraft) => void): void {
    if (!this.editable()) return;
    const current = this.draft();
    if (!current) return;
    const draft = structuredClone(current);
    operation(draft);
    this.draft.set(draft);
  }

  private cleanDraft(draft: RamsDraft): RamsDraft {
    const cleaned = structuredClone(draft);
    const scopeLists: ScopeList[] = [
      'exclusions',
      'engineerBriefing',
      'keyActivities',
      'assumptions',
      'workAreas',
    ];
    for (const list of scopeLists)
      cleaned.scope[list] = cleaned.scope[list].filter((item) => item.trim());
    const requirementLists: RequirementList[] = [
      'ppe',
      'tools',
      'competencies',
      'emergencyArrangements',
      'plant',
      'materials',
      'training',
      'substances',
      'welfare',
    ];
    for (const list of requirementLists)
      cleaned.requirements[list] = cleaned.requirements[list].filter((item) => item.trim());
    cleaned.supportingInformation.references = cleaned.supportingInformation.references.filter(
      (item) => item.title.trim(),
    );
    const structuredLists: SupportingReferenceList[] = [
      'permitReferences',
      'coshhReferences',
      'workingAtHeightReferences',
      'legislationReferences',
    ];
    for (const list of structuredLists)
      cleaned.supportingInformation[list] = cleaned.supportingInformation[list].filter((item) =>
        item.name.trim(),
      );
    cleaned.supportingInformation.documents = cleaned.supportingInformation.documents.filter(
      (item) => item.name.trim(),
    );
    cleaned.supportingInformation.electricalSafety =
      cleaned.supportingInformation.electricalSafety.filter((item) => item.trim());
    return cleaned;
  }

  private normalizeDraft(source: RamsDraft): RamsDraft {
    const draft = structuredClone(source);
    draft.schemaVersion = 2;
    draft.overview.reviewBy ??= '';
    draft.overview.revisionSummary ??= '';
    draft.scope.keyActivities ??= [];
    draft.scope.assumptions ??= [];
    draft.scope.workAreas ??= [];
    draft.scope.workBoundaries ??= '';
    draft.scope.responsibilities ??= [];
    draft.methodStatement.steps = (draft.methodStatement.steps ?? []).map((step) => ({
      ...step,
      detail: step.detail ?? '',
      responsibility: step.responsibility ?? '',
      estimatedMinutes: step.estimatedMinutes ?? 0,
    }));
    draft.riskAssessment.hazards = (draft.riskAssessment.hazards ?? []).map((hazard) => ({
      ...hazard,
      howHarmed: hazard.howHarmed ?? '',
      furtherActions: hazard.furtherActions ?? '',
      actionOwner: hazard.actionOwner ?? '',
      actionDueDate: hazard.actionDueDate ?? '',
      actionStatus: hazard.actionStatus ?? 'OPEN',
    }));
    draft.requirements.plant ??= [];
    draft.requirements.materials ??= [];
    draft.requirements.training ??= [];
    draft.requirements.substances ??= [];
    draft.requirements.welfare ??= [];
    draft.requirements.emergencyDetails ??= {
      contactName: '',
      contactNumber: '',
      nearestHospital: '',
      hospitalAddress: '',
      assemblyPoint: '',
      additionalInfo: '',
    };
    draft.supportingInformation.permitReferences ??= [];
    draft.supportingInformation.coshhReferences ??= [];
    draft.supportingInformation.workingAtHeightReferences ??= [];
    draft.supportingInformation.legislationReferences ??= [];
    draft.supportingInformation.documents ??= [];
    draft.supportingInformation.electricalSafety ??= [];
    draft.review.internalNotes ??= '';
    draft.review.changeImpact ??= 'LOW';
    draft.review.revisionReason ??= '';
    draft.review.changeSummary ??= '';
    return draft;
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update RAMS.');
    } finally {
      this.busy.set(false);
    }
  }
}
