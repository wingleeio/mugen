// The canvas surface pretext actually touches, and nothing more.
//
// pretext's getMeasureContext() does `new OffscreenCanvas(1, 1).getContext('2d')`
// and then only ever (a) assigns `ctx.font = <shorthand>` and (b) reads
// `ctx.measureText(str).width`. So a "canvas" here is two classes and one
// number — everything else 2D contexts do is irrelevant to text measurement.

import { measureTextWidth } from './measure.js';

export class MeasureContext2D {
  // Canvas contexts default to '10px sans-serif'; pretext always sets font
  // before measuring, but matching the default keeps stray callers sane.
  font = '10px sans-serif';

  measureText(text: string): { width: number } {
    // Only `width` — pretext never reads actualBoundingBox* or the other
    // TextMetrics fields, and we couldn't honestly produce them from advance
    // data alone anyway.
    return { width: measureTextWidth(text, this.font) };
  }
}

export class OffscreenCanvasShim {
  // Dimensions are accepted for constructor-signature compatibility;
  // pretext creates a 1x1 canvas purely to reach getContext('2d').
  constructor(_width: number, _height: number) {}

  getContext(kind: string): MeasureContext2D | null {
    return kind === '2d' ? new MeasureContext2D() : null;
  }
}
