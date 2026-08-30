import type { RamsDraft, RamsMethodStep } from './api.service';

export type IdFactory = () => string;

export type RamsRiskBand = 'Low' | 'Medium' | 'High' | 'Very high';

export function ramsRiskScore(likelihood: number, severity: number): number {
  return likelihood * severity;
}

export function ramsRiskBand(score: number): RamsRiskBand {
  return score <= 4 ? 'Low' : score <= 9 ? 'Medium' : score <= 15 ? 'High' : 'Very high';
}

export function ramsRiskClass(score: number): string {
  return ramsRiskBand(score).toLocaleLowerCase('en-GB').replace(' ', '-');
}

export function blankRamsDraft(): RamsDraft {
  return {
    schemaVersion: 2,
    overview: { title: '', category: '', effectiveFrom: '', reviewBy: '', revisionSummary: '' },
    scope: {
      scopeOfWorks: '',
      exclusions: [],
      engineerBriefing: [],
      keyActivities: [],
      assumptions: [],
      workAreas: [],
      workBoundaries: '',
      responsibilities: [],
    },
    methodStatement: { steps: [] },
    riskAssessment: { hazards: [] },
    requirements: {
      ppe: [],
      tools: [],
      competencies: [],
      emergencyArrangements: [],
      plant: [],
      materials: [],
      training: [],
      substances: [],
      welfare: [],
      emergencyDetails: {
        contactName: '',
        contactNumber: '',
        nearestHospital: '',
        hospitalAddress: '',
        assemblyPoint: '',
        additionalInfo: '',
      },
    },
    supportingInformation: {
      siteAccess: '',
      permits: '',
      welfare: '',
      environmental: '',
      references: [],
      permitReferences: [],
      coshhReferences: [],
      workingAtHeightReferences: [],
      legislationReferences: [],
      documents: [],
      electricalSafety: [],
    },
    review: {
      approvalMode: 'REVIEWER',
      requireEngineerAcknowledgement: true,
      internalNotes: '',
      changeImpact: 'LOW',
      revisionReason: '',
      changeSummary: '',
    },
  };
}

export function cloneMethodSteps(steps: RamsMethodStep[], createId: IdFactory): RamsMethodStep[] {
  return steps.map((step) => ({ id: createId(), title: step.title, detail: step.detail }));
}

export function cloneRamsDraft(source: RamsDraft, createId: IdFactory): RamsDraft {
  const draft = structuredClone(source);
  draft.scope.responsibilities = draft.scope.responsibilities.map((item) => ({
    ...item,
    id: createId(),
  }));
  draft.methodStatement.steps = cloneMethodSteps(draft.methodStatement.steps, createId);
  draft.riskAssessment.hazards = draft.riskAssessment.hazards.map((item) => ({
    ...item,
    id: createId(),
  }));
  draft.supportingInformation.references = draft.supportingInformation.references.map((item) => ({
    ...item,
    id: createId(),
  }));
  for (const key of [
    'permitReferences',
    'coshhReferences',
    'workingAtHeightReferences',
    'legislationReferences',
  ] as const) {
    draft.supportingInformation[key] = draft.supportingInformation[key].map((item) => ({
      ...item,
      id: createId(),
    }));
  }
  draft.supportingInformation.documents = draft.supportingInformation.documents.map((item) => ({
    ...item,
    id: createId(),
  }));
  return draft;
}

export function applyRamsTemplate(
  current: RamsDraft,
  template: RamsDraft,
  createId: IdFactory,
): RamsDraft {
  const next = cloneRamsDraft(template, createId);
  next.overview.title = current.overview.title;
  next.overview.category = current.overview.category;
  next.overview.effectiveFrom = current.overview.effectiveFrom;
  next.scope.workAreas = structuredClone(current.scope.workAreas);
  next.scope.workBoundaries = current.scope.workBoundaries;
  next.scope.responsibilities = current.scope.responsibilities.map((item) => ({
    ...structuredClone(item),
    id: createId(),
  }));
  next.requirements.ppe = structuredClone(current.requirements.ppe);
  next.requirements.emergencyDetails = structuredClone(current.requirements.emergencyDetails);
  next.supportingInformation.siteAccess = current.supportingInformation.siteAccess;
  next.supportingInformation.permits = current.supportingInformation.permits;
  next.review = structuredClone(current.review);
  return next;
}

export function hasReplaceableRamsWork(draft: RamsDraft): boolean {
  return Boolean(
    draft.scope.scopeOfWorks.trim() ||
    draft.scope.exclusions.some((item) => item.trim()) ||
    draft.scope.engineerBriefing.some((item) => item.trim()) ||
    draft.scope.keyActivities.some((item) => item.trim()) ||
    draft.scope.assumptions.some((item) => item.trim()) ||
    draft.methodStatement.steps.length ||
    draft.riskAssessment.hazards.length ||
    draft.requirements.tools.length ||
    draft.requirements.competencies.length ||
    draft.requirements.emergencyArrangements.length ||
    draft.requirements.plant.length ||
    draft.requirements.materials.length ||
    draft.requirements.training.length ||
    draft.requirements.substances.length ||
    draft.requirements.welfare.length ||
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
}
