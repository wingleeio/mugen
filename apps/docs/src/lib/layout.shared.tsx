import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-baseline gap-2">
          <span className="font-serif text-[19px] leading-none tracking-[0.01em]">{appName}</span>
          <span
            aria-hidden
            className="font-serif text-[11px] leading-none text-fd-muted-foreground/70"
          >
            無限
          </span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
