/**
 * One-time measurement setup: feed the exact TTFs the app renders with to
 * pretext-native, so measured widths and painted glyphs come from the same
 * font tables.
 *
 * Paint side: `useFonts` (expo-font) registers each face under its module name
 * (`Inter_600SemiBold`); the `fontFaceResolver` below maps mugen's
 * `family + weight` requests onto those per-face names — the reliable way to
 * select weights of a bundled font on both iOS and Android.
 */
import { Asset } from 'expo-asset';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { configureMugenNative } from '@wingleeio/mugen-native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';

const INTER_WEIGHTS: Record<number, { module: number; face: string }> = {
  400: { module: Inter_400Regular, face: 'Inter_400Regular' },
  500: { module: Inter_500Medium, face: 'Inter_500Medium' },
  600: { module: Inter_600SemiBold, face: 'Inter_600SemiBold' },
  700: { module: Inter_700Bold, face: 'Inter_700Bold' },
};

async function fontBytes(moduleId: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  // Hermes ships atob (RN >= 0.74); fonts are a few hundred KB, this is fine.
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** The map to hand `useFonts` so paint has every face measurement knows. */
export const FONT_MODULES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  JetBrainsMono_400Regular,
};

/** Parse the same TTFs for measurement and wire the paint-face resolver. */
export async function setupMeasurement(): Promise<void> {
  const inter = await Promise.all(
    Object.entries(INTER_WEIGHTS).map(async ([weight, spec]) => ({
      family: 'Inter',
      weight: Number(weight),
      data: await fontBytes(spec.module),
    })),
  );
  const mono = {
    family: 'JetBrains Mono',
    weight: 400,
    data: await fontBytes(JetBrainsMono_400Regular),
  };
  configureMugenNative({
    fonts: [...inter, mono],
    genericFamilies: { 'sans-serif': 'Inter', monospace: 'JetBrains Mono' },
    fontFaceResolver: ({ family, weight, style }) => {
      if (family === 'Inter') {
        // Snap to the nearest bundled face.
        const nearest = [400, 500, 600, 700].reduce((a, b) =>
          Math.abs(b - weight) < Math.abs(a - weight) ? b : a,
        );
        return { fontFamily: INTER_WEIGHTS[nearest]!.face };
      }
      if (family === 'JetBrains Mono') return { fontFamily: 'JetBrainsMono_400Regular' };
      return {
        fontFamily: family,
        fontWeight: String(weight) as '400',
        ...(style === 'italic' ? { fontStyle: 'italic' as const } : null),
      };
    },
  });
}
