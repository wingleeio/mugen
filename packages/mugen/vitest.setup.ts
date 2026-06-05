// Test environment shims. happy-dom has no real layout engine — which is fine,
// because mugen never measures the DOM. Heights come from (mocked) pretext and
// the offset index, so the windowing logic is fully exercisable here.

type ROCallback = (entries: { contentRect: { width: number; height: number } }[]) => void;

class TestResizeObserver {
  static instances: { cb: ROCallback; targets: Set<Element> }[] = [];
  private rec: { cb: ROCallback; targets: Set<Element> };
  constructor(cb: ROCallback) {
    this.rec = { cb, targets: new Set() };
    TestResizeObserver.instances.push(this.rec);
  }
  observe(el: Element) {
    this.rec.targets.add(el);
  }
  unobserve(el: Element) {
    this.rec.targets.delete(el);
  }
  disconnect() {
    this.rec.targets.clear();
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
}

// Emit a width to every live ResizeObserver — lets a test drive viewport width.
export function emitResize(width: number, height = 600) {
  for (const inst of TestResizeObserver.instances) {
    inst.cb([{ contentRect: { width, height } }]);
  }
}
