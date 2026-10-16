export type PlatformOptionNavigationKey =
  | 'ArrowDown'
  | 'ArrowUp'
  | 'Home'
  | 'End';

export function nextPlatformOptionIndex(
  currentIndex: number,
  optionCount: number,
  key: PlatformOptionNavigationKey,
): number {
  if (optionCount <= 0) return -1;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return optionCount - 1;
    case 'ArrowDown':
      return currentIndex < 0 ? 0 : (currentIndex + 1) % optionCount;
    case 'ArrowUp':
      return currentIndex < 0
        ? optionCount - 1
        : (currentIndex - 1 + optionCount) % optionCount;
  }
}

export function platformOptionDomId(platformId: string): string {
  return `platform-switcher-option-${platformId}`;
}
