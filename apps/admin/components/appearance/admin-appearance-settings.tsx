'use client';

import type { ReactNode } from 'react';

import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@kit/ui/sheet';

import {
  appearanceAccents,
  appearanceModes,
  appearanceSurfaces,
  type AppearanceAccent,
  type AppearanceMode,
  type AppearanceSurface,
} from './appearance-model';
import { useAdminAppearance } from './admin-appearance';

const modeLabels: Record<AppearanceMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

const accentLabels: Record<AppearanceAccent, string> = {
  blue: 'Blue',
  indigo: 'Indigo',
  violet: 'Violet',
  azure: 'Azure',
};

const surfaceLabels: Record<AppearanceSurface, string> = {
  neutral: 'Neutral',
  cool: 'Cool',
  warm: 'Warm',
};

function ModeIcon({ mode }: { mode: AppearanceMode }) {
  if (mode === 'light') return <Sun aria-hidden="true" />;
  if (mode === 'dark') return <Moon aria-hidden="true" />;
  return <Monitor aria-hidden="true" />;
}

function ChoiceButton({
  selected,
  children,
  onClick,
  testId,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="admin-appearance-choice h-auto min-h-10 justify-between px-3 py-2"
      aria-pressed={selected}
      data-selected={selected ? 'true' : 'false'}
      data-test={testId}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      <Check
        className={selected ? 'opacity-100' : 'opacity-0'}
        aria-hidden="true"
      />
    </Button>
  );
}

export function AdminAppearanceSettings() {
  const appearance = useAdminAppearance();

  return (
    <Sheet
      open={appearance.settingsOpen}
      onOpenChange={appearance.setSettingsOpen}
    >
      <SheetContent
        side="right"
        className="admin-appearance-sheet w-[min(92vw,28rem)] sm:max-w-md"
        data-test="admin-appearance-settings"
      >
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2 text-primary">
            <Palette className="size-4" aria-hidden="true" />
            <SheetTitle>外观设置</SheetTitle>
          </div>
          <SheetDescription>
            统一调整整个 Admin 的明暗模式、强调色和表面气质。
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 overflow-y-auto px-5 py-5">
          <section
            className="grid gap-3"
            aria-labelledby="appearance-mode-title"
          >
            <div>
              <h2 id="appearance-mode-title" className="text-sm font-semibold">
                明暗模式
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                当前实际显示为{' '}
                {appearance.resolvedTheme === 'dark' ? '深色' : '浅色'}。
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {appearanceModes.map((mode) => (
                <ChoiceButton
                  key={mode}
                  selected={appearance.mode === mode}
                  onClick={() => appearance.setMode(mode)}
                  testId={`appearance-mode-${mode}`}
                >
                  <ModeIcon mode={mode} />
                  <span>{modeLabels[mode]}</span>
                </ChoiceButton>
              ))}
            </div>
          </section>

          <section
            className="grid gap-3"
            aria-labelledby="appearance-accent-title"
          >
            <div>
              <h2
                id="appearance-accent-title"
                className="text-sm font-semibold"
              >
                强调色
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                只影响 action、selection、focus 和 link；状态语义保持独立。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {appearanceAccents.map((accent) => (
                <ChoiceButton
                  key={accent}
                  selected={appearance.accent === accent}
                  onClick={() => appearance.setAccent(accent)}
                  testId={`appearance-accent-${accent}`}
                >
                  <span
                    className="admin-accent-swatch"
                    data-accent-preview={accent}
                    aria-hidden="true"
                  />
                  <span>{accentLabels[accent]}</span>
                </ChoiceButton>
              ))}
            </div>
          </section>

          <section
            className="grid gap-3"
            aria-labelledby="appearance-surface-title"
          >
            <div>
              <h2
                id="appearance-surface-title"
                className="text-sm font-semibold"
              >
                背景与材质
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                调整 neutral family 与玻璃 tint，不改变业务状态颜色。
              </p>
            </div>
            <div className="grid gap-2">
              {appearanceSurfaces.map((surface) => (
                <ChoiceButton
                  key={surface}
                  selected={appearance.surface === surface}
                  onClick={() => appearance.setSurface(surface)}
                  testId={`appearance-surface-${surface}`}
                >
                  <span
                    className="admin-surface-swatch"
                    data-surface-preview={surface}
                    aria-hidden="true"
                  />
                  <span>{surfaceLabels[surface]}</span>
                </ChoiceButton>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
