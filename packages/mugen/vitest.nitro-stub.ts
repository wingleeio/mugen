// Empty stub: react-native-nitro-modules ships React-Native Flow source the
// web bundler can't parse. Browser/happy-dom tests never use the native module
// (pretext-core's getNative falls back to JS), so alias it to this in the
// vitest configs.
export const NitroModules = undefined;
export function getHostComponent() {
  return null;
}
