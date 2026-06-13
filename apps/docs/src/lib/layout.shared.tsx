import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2.5">
          {/* the favicon mark — single source of truth in public/icon.svg */}
          <img src="/icon.svg" alt="" width={20} height={20} className="shrink-0" />
          <span className="font-serif text-[19px] leading-none tracking-[0.01em]">{appName}</span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
