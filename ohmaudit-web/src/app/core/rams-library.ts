import type { RamsDraft, RamsMethodStep } from './api.service';

export type IdFactory = () => string;

export function cloneMethodSteps(steps: RamsMethodStep[], createId: IdFactory): RamsMethodStep[] {
  return steps.map((step) => ({ ...structuredClone(step), id: createId() }));
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
