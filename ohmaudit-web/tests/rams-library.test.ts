import { describe, expect, it } from 'vitest';
import type { RamsDraft } from '../src/app/core/api.service';
import {
  applyRamsTemplate,
  blankRamsDraft,
  cloneMethodSteps,
  createRamsHazard,
  hasReplaceableRamsWork,
  ramsRiskBand,
  ramsRiskScore,
  importRamsHazards,
  resolveRamsRecommendations,
} from '../src/app/core/rams-library';

function draft(title: string): RamsDraft {
  return {
    schemaVersion: 2,
    overview: {
      title,
      category: 'Job category',
      effectiveFrom: '2026-08-30',
      reviewBy: '',
      revisionSummary: '',
    },
    scope: {
      scopeOfWorks: '',
      exclusions: [],
      engineerBriefing: [],
      keyActivities: [],
      assumptions: [],
      workAreas: ['Plant room'],
      workBoundaries: 'Job boundary',
      responsibilities: [
        {
          id: 'responsibility-old',
          name: 'Alex',
          role: 'Engineer',
          organisation: 'Ohm',
          responsibility: 'Isolate',
          contact: '',
        },
      ],
    },
    methodStatement: { steps: [] },
    riskAssessment: { hazards: [] },
    requirements: {
      ppe: ['Gloves'],
      tools: [],
      competencies: [],
      emergencyArrangements: [],
      plant: [],
      materials: [],
      training: [],
      substances: [],
      welfare: [],
      emergencyDetails: {
        contactName: 'Site contact',
        contactNumber: '0123',
        nearestHospital: '',
        hospitalAddress: '',
        assemblyPoint: 'Gate',
        additionalInfo: '',
      },
    },
    supportingInformation: {
      siteAccess: 'Report to reception',
      permits: 'Parking and induction details',
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
      internalNotes: 'Keep',
      changeImpact: 'LOW',
      revisionReason: '',
      changeSummary: '',
    },
  };
}

describe('RAMS reusable content', () => {
  it('clones method step IDs', () => {
    const steps = cloneMethodSteps(
      [
        {
          id: 'old',
          title: 'Isolate',
          detail: 'Lock off',
        },
      ],
      () => 'new',
    );
    expect(steps[0]).toMatchObject({ id: 'new', title: 'Isolate' });
    expect(steps[0]).not.toHaveProperty('required');
  });

  it('creates independent normalized blank template data', () => {
    const first = blankRamsDraft();
    const second = blankRamsDraft();
    first.scope.keyActivities.push('Test');
    expect(second.scope.keyActivities).toEqual([]);
    expect(first.schemaVersion).toBe(2);
  });

  it('uses the shared risk score bands', () => {
    expect(ramsRiskScore(3, 4)).toBe(12);
    expect(ramsRiskBand(4)).toBe('Low');
    expect(ramsRiskBand(9)).toBe('Medium');
    expect(ramsRiskBand(15)).toBe('High');
    expect(ramsRiskBand(16)).toBe('Very high');
  });

  it('creates hazards with canonical scores', () => {
    const hazard = createRamsHazard(() => 'hazard-id');
    expect(hazard).toMatchObject({
      id: 'hazard-id',
      initialLikelihood: 3,
      initialSeverity: 5,
      residualLikelihood: 1,
      residualSeverity: 3,
    });
    expect(ramsRiskScore(hazard.initialLikelihood, hazard.initialSeverity)).toBe(15);
    expect(ramsRiskScore(hazard.residualLikelihood, hazard.residualSeverity)).toBe(3);
  });

  it('preserves job and review data while applying template content', () => {
    const current = draft('Job RAMS');
    const template = draft('Template title');
    template.scope.scopeOfWorks = 'Template work';
    template.methodStatement.steps.push({
      id: 'step-old',
      title: 'Test',
      detail: 'Test safely',
    });
    let id = 0;
    const result = applyRamsTemplate(current, template, () => `new-${++id}`);

    expect(result.overview.title).toBe('Job RAMS');
    expect(result.scope.scopeOfWorks).toBe('Template work');
    expect(result.scope.workAreas).toEqual(['Plant room']);
    expect(result.requirements.ppe).toEqual(['Gloves']);
    expect(result.supportingInformation.permits).toBe('Parking and induction details');
    expect(result.review.internalNotes).toBe('Keep');
    expect(result.methodStatement.steps[0]?.id).not.toBe('step-old');
    expect(result.scope.responsibilities[0]?.id).not.toBe('responsibility-old');
    expect(result.overview).toMatchObject({
      title: 'Job RAMS',
      category: 'Job category',
      effectiveFrom: '2026-08-30',
    });
    expect(result.scope).toMatchObject({
      workAreas: ['Plant room'],
      workBoundaries: 'Job boundary',
    });
    expect(result.requirements.emergencyDetails).toEqual(current.requirements.emergencyDetails);
    expect(result.supportingInformation.siteAccess).toBe('Report to reception');
  });

  it('clones every nested ID when recommendation content is applied', () => {
    const current = draft('Job RAMS');
    const recommendation = draft('Similar RAMS');
    recommendation.methodStatement.steps = [{ id: 'step-old', title: 'Isolate', detail: 'Safely' }];
    recommendation.riskAssessment.hazards = [createRamsHazard(() => 'hazard-old')];
    recommendation.supportingInformation.references = [
      { id: 'reference-old', title: 'Guide', url: 'https://example.test' },
    ];
    recommendation.supportingInformation.permitReferences = [
      { id: 'permit-old', name: 'Permit', reference: 'P1' },
    ];
    recommendation.supportingInformation.documents = [
      { id: 'document-old', name: 'Plan', type: 'PDF', reference: 'D1', status: 'Current' },
    ];

    let id = 0;
    const result = applyRamsTemplate(current, recommendation, () => `fresh-${++id}`);
    const clonedIds = [
      result.scope.responsibilities[0]?.id,
      result.methodStatement.steps[0]?.id,
      result.riskAssessment.hazards[0]?.id,
      result.supportingInformation.references[0]?.id,
      result.supportingInformation.permitReferences[0]?.id,
      result.supportingInformation.documents[0]?.id,
    ];
    expect(clonedIds.every((value) => value?.startsWith('fresh-'))).toBe(true);
    expect(new Set(clonedIds).size).toBe(clonedIds.length);
  });

  it('leaves the draft unchanged when recommendations fail to load', async () => {
    const current = draft('Job RAMS');
    const before = structuredClone(current);

    const result = await resolveRamsRecommendations(() =>
      Promise.reject(new Error('Recommendation service unavailable')),
    );

    expect(result).toEqual({ recommendations: [], error: 'Unable to load similar RAMS.' });
    expect(current).toEqual(before);
  });

  it('merges and deduplicates all baseline requirement categories', () => {
    const current = draft('Job RAMS');
    const template = draft('Template');
    current.requirements.tools = ['Tester'];
    current.requirements.competencies = ['Authorised person'];
    current.requirements.emergencyArrangements = ['Call site'];
    current.requirements.welfare = ['Mess room'];
    current.requirements.plant = ['Tower'];
    template.requirements.ppe = [' gloves ', 'Helmet'];
    template.requirements.tools = ['tester', 'Drill'];
    template.requirements.competencies = ['Authorised person', 'First aid'];
    template.requirements.emergencyArrangements = ['Call site', 'Evacuate'];
    template.requirements.welfare = ['Mess room', 'Toilets'];
    template.requirements.plant = ['Tower', 'Hoist'];

    const result = applyRamsTemplate(current, template, () => 'new');
    expect(result.requirements.ppe).toEqual(['Gloves', 'Helmet']);
    expect(result.requirements.tools).toEqual(['Tester', 'Drill']);
    expect(result.requirements.competencies).toEqual(['Authorised person', 'First aid']);
    expect(result.requirements.emergencyArrangements).toEqual(['Call site', 'Evacuate']);
    expect(result.requirements.welfare).toEqual(['Mess room', 'Toilets']);
    expect(result.requirements.plant).toEqual(['Tower', 'Hoist']);
  });

  it('imports unique library hazards with fresh IDs and a maximum', () => {
    const existing = createRamsHazard(() => 'existing');
    existing.hazard = 'Electric shock';
    existing.controls = 'Isolate';
    const duplicate = {
      id: 'library-1',
      name: 'Duplicate',
      description: '',
      isDefault: false,
      data: { ...existing, id: 'old' },
      createdAt: '',
      updatedAt: '',
    };
    const unique = {
      ...duplicate,
      id: 'library-2',
      name: 'Fall',
      data: { ...existing, id: 'old-2', hazard: 'Fall' },
    };
    const result = importRamsHazards([existing], [duplicate, unique], () => 'fresh', 2);
    expect(result).toMatchObject({ imported: 1, skipped: 1 });
    expect(result.hazards.map(({ id }) => id)).toEqual(['existing', 'fresh']);
  });

  it('detects content that would be replaced', () => {
    const empty = draft('Job RAMS');
    expect(hasReplaceableRamsWork(empty)).toBe(false);
    empty.scope.scopeOfWorks = 'Existing work';
    expect(hasReplaceableRamsWork(empty)).toBe(true);
  });
});
