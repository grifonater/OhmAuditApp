import { describe, expect, it } from 'vitest';
import { sortNaturallyBy } from '../src/app/shared/natural-order';

describe('natural ordering', () => {
  it('sorts plain and embedded numbers numerically without mutating the input', () => {
    const references = ['10', '2', '1'];

    expect(sortNaturallyBy(references, (value) => value)).toEqual(['1', '2', '10']);
    expect(references).toEqual(['10', '2', '1']);
    expect(sortNaturallyBy(['EVCP-10', 'EVCP-2', 'EVCP-1'], (value) => value)).toEqual([
      'EVCP-1',
      'EVCP-2',
      'EVCP-10',
    ]);
    expect(
      sortNaturallyBy(['DB 10 circuit 1', 'DB 2 circuit 10', 'DB 2 circuit 2'], (value) => value),
    ).toEqual(['DB 2 circuit 2', 'DB 2 circuit 10', 'DB 10 circuit 1']);
  });
});
