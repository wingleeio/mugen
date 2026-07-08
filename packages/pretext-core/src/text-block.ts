// Subpath entry `@wingleeio/pretext-core/text-block` for the <MugenTextBlock>
// React component. Kept separate from the package root so importing the
// measurement API (prepare/layout/registerFont/…) never pulls in
// react / react-native — the root stays usable from Node and from mugen's
// pure measure code.
export {
  MugenTextBlock,
  type MugenTextBlockViewProps,
  type MugenTextBlockNativeProps,
  type MugenTextBlockSpec,
  type MugenTextRun,
  type MugenTextFragment,
  type MugenTextLine,
  type MugenTextAlign,
} from './MugenTextBlock.js';
