// Test environment shims. happy-dom has no real layout engine and no canvas
// text metrics, so the node suite mocks `@chenglou/pretext`'s measurement (a
// linear chars-per-line model) — enough to exercise the AST -> primitive tree
// and the walker integration. Real metric accuracy is covered by the browser
// suite (`*.browser.test.tsx`).

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

export function emitResize(width: number, height = 600) {
  for (const inst of TestResizeObserver.instances) {
    inst.cb([{ contentRect: { width, height } }]);
  }
}
