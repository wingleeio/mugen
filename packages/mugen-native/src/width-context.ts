import { createContext } from 'react';

/**
 * The available content width, threaded down the render tree with exactly the
 * same arithmetic the measure walk uses (`measureBox`/`distribute`).
 *
 * On the web, mugen's render half leaves wrapping to the browser and only the
 * *measure* needs widths. React Native's text engine breaks lines differently
 * from pretext, so the native renderer paints pretext's own materialized lines
 * instead — and for that, every `Text` must know the width its height was
 * measured at. Boxes narrow it (`padding`), rows split it (`distribute`), rows
 * provide it here.
 *
 * `0` means "not inside a mugen row yet" — Text renders nothing rather than
 * guessing a width the measure never saw.
 */
export const WidthContext = createContext<number>(0);
