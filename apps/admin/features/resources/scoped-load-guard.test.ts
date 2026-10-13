import { describe, expect, it } from 'vitest';

import { beginScopedLoad, isScopedLoadCurrent } from './scoped-load-guard';

describe('scoped load guard', () => {
  it('rejects A after B starts and resolves first', () => {
    const generation = { current: 0 };
    const scope = { current: 'platform-a' };
    const a = beginScopedLoad(generation, scope.current);

    scope.current = 'platform-b';
    const b = beginScopedLoad(generation, scope.current);

    let rendered = 'none';
    if (isScopedLoadCurrent(generation, scope, b)) rendered = 'platform-b';
    if (isScopedLoadCurrent(generation, scope, a)) rendered = 'platform-a';

    expect(rendered).toBe('platform-b');
  });

  it('rejects A as soon as render scope changes, before B effect starts', () => {
    const generation = { current: 0 };
    const scope = { current: 'platform-a' };
    const a = beginScopedLoad(generation, scope.current);

    scope.current = 'platform-b';

    expect(isScopedLoadCurrent(generation, scope, a)).toBe(false);
  });
});
