import { describe, expect, it } from 'vitest';
import type { RamsDraft } from '../src/app/core/api.service';
import {
  applyRamsTemplate,
  cloneMethodSteps,
  hasReplaceableRamsWork,
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
          required: true,
        },
      ],
      () => 'new',
    );
    expect(steps[0]).toMatchObject({ id: 'new', title: 'Isolate' });
  });

  it('preserves job and review data while applying template content', () => {
    const current = draft('Job RAMS');
    const template = draft('Template title');
    template.scope.scopeOfWorks = 'Template work';
    template.methodStatement.steps.push({
      id: 'step-old',
      title: 'Test',
      detail: 'Test safely',
      required: true,
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
  });

  it('detects content that would be replaced', () => {
    const empty = draft('Job RAMS');
    expect(hasReplaceableRamsWork(empty)).toBe(false);
    empty.scope.scopeOfWorks = 'Existing work';
    expect(hasReplaceableRamsWork(empty)).toBe(true);
  });
});
