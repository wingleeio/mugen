// <MugenTextBlock> — the React wrapper for the one-native-view-per-block Fabric
// component (NATIVE-TEXT.md). It renders a SINGLE native view that paints a
// whole markdown block from a pretext-walked attributed-string spec, replacing
// the per-fragment <Text> tree of mugen-markdown-native's RichText.
//
// The host component is resolved LAZILY via a guarded require — exactly like
// native.ts. `react-native-nitro-modules`' getHostComponent pulls in
// react-native's NativeComponentRegistry (a deep RN import) and throws off
// React Native; a static import would crash the pure-JS/host paths where this
// package is also consumed (web fallback, Node conformance tests). On those
// paths getHostComponent is never reached and this component renders null (the
// block is a native-only optimization; web/markdown keeps its span tree).
//
// The native implementations (ios/HybridMugenTextBlock.swift,
// android/.../HybridMugenTextBlock.kt) build only inside the comet dev client
// (RN 0.81, Xcode 26) — see NATIVE-TEXT.md.
import { createElement, type ReactElement } from 'react';
import type { ViewProps } from 'react-native';
// STATIC import (not a dynamic require): Metro only bundles statically-imported
// modules, so a `require('react-native-nitro-modules')` throws "unknown module"
// at runtime even when the pod is installed. This `/text-block` entry is
// React-Native-only (it already imports 'react-native'), so a static import is
// safe — Node never loads this module (the Node-safe API is the package root).
import { getHostComponent } from 'react-native-nitro-modules';
import type {
  MugenTextBlockSpec,
  MugenTextBlockProps as MugenTextBlockNativeProps,
} from './specs/mugen-text-block.nitro.js';

// Re-export the spec types so consumers get them from the component module.
export type {
  MugenTextBlockSpec,
  MugenTextRun,
  MugenTextFragment,
  MugenTextLine,
  MugenTextAlign,
} from './specs/mugen-text-block.nitro.js';
export type { MugenTextBlockNativeProps };

// The RN view config nitrogen emits (nitrogen/generated/shared/json/
// MugenTextBlockConfig.json). Inlined so the wrapper needs no JSON import
// (tsconfig doesn't enable resolveJsonModule) and stays a pure `src` module.
const VIEW_CONFIG = {
  uiViewClassName: 'MugenTextBlock',
  supportsRawText: false,
  bubblingEventTypes: {},
  directEventTypes: {},
  validAttributes: { spec: true, hybridRef: true },
} as const;

type HostComponent = (props: MugenTextBlockViewProps) => ReactElement | null;

let hostComponent: HostComponent | null | undefined;

/** Resolve (once) the Nitro host component, or null if it can't be created. */
function getHost(): HostComponent | null {
  if (hostComponent !== undefined) return hostComponent;
  try {
    hostComponent = getHostComponent(
      'MugenTextBlock',
      () => VIEW_CONFIG,
    ) as unknown as HostComponent;
  } catch {
    hostComponent = null;
  }
  return hostComponent;
}

/**
 * Props for {@link MugenTextBlock}: the attributed-string `spec` plus the
 * standard RN {@link ViewProps} (`style`, `testID`, …). The native view sizes
 * itself to `spec.maxWidth × (spec.lines.length · spec.lineHeight)`.
 */
export interface MugenTextBlockViewProps extends ViewProps {
  spec: MugenTextBlockSpec;
}

/**
 * Draw a whole markdown block as one native view.
 *
 * @example
 * ```tsx
 * <MugenTextBlock spec={{ runs, lines, lineHeight, maxWidth, align }} />
 * ```
 */
export function MugenTextBlock(props: MugenTextBlockViewProps): ReactElement | null {
  const Host = getHost();
  if (Host === null) return null;
  return createElement(Host as unknown as string, props);
}
