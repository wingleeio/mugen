import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2.5">
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 64 64"
            className="shrink-0"
          >
            <rect width="64" height="64" rx="14" className="fill-fd-foreground/[0.07]" />
            <rect x="15" y="15" width="32" height="6" rx="2" className="fill-fd-foreground" />
            <rect x="15" y="26" width="22" height="12" rx="2" className="fill-fd-primary" />
            <rect x="15" y="43" width="27" height="6" rx="2" className="fill-fd-foreground" />
          </svg>
          <span className="font-serif text-[19px] leading-none tracking-[0.01em]">{appName}</span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
