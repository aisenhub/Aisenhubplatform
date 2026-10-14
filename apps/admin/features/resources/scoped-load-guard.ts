export type ScopedLoadRef<T> = { current: T };

export type ScopedLoadToken = {
  generation: number;
  scope: string;
};

export function beginScopedLoad(
  generationRef: ScopedLoadRef<number>,
  scope: string,
): ScopedLoadToken {
  return { generation: ++generationRef.current, scope };
}

export function isScopedLoadCurrent(
  generationRef: ScopedLoadRef<number>,
  scopeRef: ScopedLoadRef<string>,
  token: ScopedLoadToken,
): boolean {
  return (
    generationRef.current === token.generation &&
    scopeRef.current === token.scope
  );
}
