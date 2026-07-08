//
//  HybridMugenTextBlock.swift
//  PretextCore
//
//  The iOS half of <MugenTextBlock> — the "one native view per block" piece of
//  NATIVE-TEXT.md. Draws a whole markdown block as ONE UIView using Core Text,
//  painting pretext-core's own line geometry so the painted block is exactly
//  `lines × lineHeight` and every fragment sits at pretext's x.
//
//  Spec shape is PRE-BROKEN LINES (see mugen-text-block.nitro.ts header): the JS
//  side ran pretext-core's rich-inline walk and handed us positioned fragments,
//  so this view performs NO line breaking — it just draws. That is what makes
//  painted geometry equal measured geometry: both flow from the same walk.
//
//  ⚠️ NOT COMPILED ON THE HOST. This file builds only inside the comet dev
//  client (RN 0.81, Xcode 26) per NATIVE-TEXT.md — `pod install` in the app
//  picks it up via PretextCore.podspec (`ios/**/*.swift`). Nitro autolinking
//  (nitro.json → HybridMugenTextBlock) wires it into the Fabric component
//  registered as "MugenTextBlock".

import CoreText
import Foundation
import NitroModules
import UIKit

/// Nitro HybridView implementation. Holds the single block view and forwards
/// the `spec` prop into it. One prop diff, one native view, per markdown block.
final class HybridMugenTextBlock: HybridMugenTextBlockSpec {
  private let blockView = MugenBlockView()

  /// The UIView Nitro mounts for this HybridView. Stable for the view's life.
  var view: UIView { blockView }

  /// The whole attributed-string block. Assigning re-lays and repaints the view.
  var spec: MugenTextBlockSpec = MugenTextBlockSpec(
    runs: [], lines: [], lineHeight: 0, maxWidth: 0, align: nil
  ) {
    didSet { blockView.apply(spec) }
  }
}

// MARK: - The single block view

/// One UIView that paints the entire block. Core Text draws each fragment at
/// pretext's `(x, lineTop + baseline)`; inline-box placeholders reserve their
/// advance and draw nothing (the React tree overlays box content as a sibling).
private final class MugenBlockView: UIView {
  private var runs: [MugenTextRun] = []
  private var lines: [MugenTextLine] = []
  private var lineHeight: CGFloat = 0
  private var maxWidth: CGFloat = 0
  private var align: MugenTextAlign = .left

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = false
    backgroundColor = .clear
    // We paint on the JS/UI thread only when props change.
    contentMode = .redraw
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }

  func apply(_ spec: MugenTextBlockSpec) {
    runs = spec.runs
    lines = spec.lines
    lineHeight = CGFloat(spec.lineHeight)
    maxWidth = CGFloat(spec.maxWidth)
    align = spec.align ?? .left
    invalidateIntrinsicContentSize()
    setNeedsDisplay()
  }

  /// pretext owns the block's geometry: width is the break width, height is
  /// `lines × lineHeight` exactly (blank lines counted), matching the measure.
  override var intrinsicContentSize: CGSize {
    CGSize(width: maxWidth, height: CGFloat(lines.count) * lineHeight)
  }

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext(), lineHeight > 0 else { return }

    // Core Text's coordinate system is y-up; UIKit's is y-down. Flip once so we
    // can address lines top-down like the measure does.
    ctx.textMatrix = .identity
    ctx.translateBy(x: 0, y: bounds.height)
    ctx.scaleBy(x: 1, y: -1)

    for (lineIndex, line) in lines.enumerated() {
      if line.fragments.isEmpty { continue } // blank line — reserves height only

      // Per-line alignment offset within the break width (mirrors alignOffset()).
      let alignDx = alignmentOffset(lineWidth: CGFloat(line.width))
      // Top of this line in UIKit (y-down) space.
      let lineTop = CGFloat(lineIndex) * lineHeight

      for fragment in line.fragments {
        let runIndex = Int(fragment.runIndex)
        guard runIndex >= 0, runIndex < runs.count else { continue }
        let run = runs[runIndex]

        // Inline-box placeholder: reserve `advance`, draw nothing here. The
        // React side overlays the box content at (fragment.x, lineTop).
        if run.advance != nil { continue }
        if fragment.text.isEmpty { continue }

        let attributed = attributedString(for: fragment.text, run: run)
        let ctLine = CTLineCreateWithAttributedString(attributed)

        // Baseline: center the font's line box inside `lineHeight`, exactly like
        // RN's <Text lineHeight> vertical centering (matches rich-text.tsx).
        let font = ctFont(for: run)
        let ascent = CTFontGetAscent(font)
        let descent = CTFontGetDescent(font)
        let leading = max(0, lineHeight - (ascent + descent))
        let baselineFromTop = leading / 2 + ascent

        // Convert the top-down baseline into the flipped (y-up) context.
        let drawX = alignDx + CGFloat(fragment.x)
        let drawY = bounds.height - (lineTop + baselineFromTop)
        ctx.textPosition = CGPoint(x: drawX, y: drawY)
        CTLineDraw(ctLine, ctx)
      }
    }
  }

  private func alignmentOffset(lineWidth: CGFloat) -> CGFloat {
    switch align {
    case .center: return max(0, (maxWidth - lineWidth) / 2)
    case .right: return max(0, maxWidth - lineWidth)
    case .left: return 0
    }
  }

  // MARK: Attribute building

  private func attributedString(for text: String, run: MugenTextRun) -> NSAttributedString {
    let font = ctFont(for: run)
    var attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: MugenColor.parse(run.color).cgColor,
    ]

    if let background = run.background {
      attrs[.backgroundColor] = MugenColor.parse(background).cgColor
    }
    if let decoration = run.decoration {
      if decoration.contains("underline") {
        attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
      }
      if decoration.contains("line-through") {
        attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
      }
    }
    if let letterSpacing = run.letterSpacing, letterSpacing != 0 {
      attrs[.kern] = letterSpacing
    }
    // Turn ligatures off for code runs (literal `===`/`!=`/`=>`); height-neutral.
    if run.noLigatures == true {
      attrs[.ligature] = 0
    }
    return NSAttributedString(string: text, attributes: attrs)
  }

  private func ctFont(for run: MugenTextRun) -> CTFont {
    let ui = MugenFont.parse(run.font)
    return CTFontCreateWithName(ui.fontName as CFString, ui.pointSize, nil)
  }
}

// MARK: - Font shorthand → UIFont

/// Parse the canvas font shorthand pretext measured with (e.g.
/// `"italic 600 16px Inter, sans-serif"`) into a UIFont. Mirrors the fields
/// pretext-native's shorthand parser reads: [style] [weight] <size>px <family>.
private enum MugenFont {
  static func parse(_ shorthand: String) -> UIFont {
    var italic = false
    var fontWeight = UIFont.Weight.regular
    var size: CGFloat = UIFont.systemFontSize
    var family: String? = nil

    // Split into the pre-size tokens, the `<n>px` size, and the family remainder.
    let tokens = shorthand.split(separator: " ", omittingEmptySubsequences: true)
    var sizeIndex: Int? = nil
    for (i, tokenSub) in tokens.enumerated() {
      let token = String(tokenSub)
      if token.hasSuffix("px"), let value = Double(token.dropLast(2)) {
        size = CGFloat(value)
        sizeIndex = i
        break
      }
      switch token.lowercased() {
      case "italic", "oblique": italic = true
      case "normal": break
      case "bold": fontWeight = .bold
      default:
        if let numeric = Double(token) { fontWeight = weight(from: numeric) }
      }
    }
    if let sizeIndex, sizeIndex + 1 < tokens.count {
      let familyList = tokens[(sizeIndex + 1)...].joined(separator: " ")
      family = familyList
        .split(separator: ",").first
        .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: " \"'")) }
    }

    var font: UIFont
    if let family, !isGeneric(family), let named = UIFont(name: family, size: size) {
      font = named
      if fontWeight != .regular {
        font = named.withWeight(fontWeight) ?? named
      }
    } else {
      font = UIFont.systemFont(ofSize: size, weight: fontWeight)
    }
    if italic {
      font = font.withItalic() ?? font
    }
    return font
  }

  private static func weight(from numeric: Double) -> UIFont.Weight {
    switch numeric {
    case ..<150: return .ultraLight
    case ..<250: return .thin
    case ..<350: return .light
    case ..<450: return .regular
    case ..<550: return .medium
    case ..<650: return .semibold
    case ..<750: return .bold
    case ..<850: return .heavy
    default: return .black
    }
  }

  private static func isGeneric(_ family: String) -> Bool {
    switch family.lowercased() {
    case "sans-serif", "serif", "monospace", "system-ui", "-apple-system", "ui-monospace":
      return true
    default:
      return false
    }
  }
}

private extension UIFont {
  func withWeight(_ weight: UIFont.Weight) -> UIFont? {
    let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
    let descriptor = fontDescriptor.addingAttributes([.traits: traits])
    return UIFont(descriptor: descriptor, size: pointSize)
  }

  func withItalic() -> UIFont? {
    var symbolic = fontDescriptor.symbolicTraits
    symbolic.insert(.traitItalic)
    guard let descriptor = fontDescriptor.withSymbolicTraits(symbolic) else { return nil }
    return UIFont(descriptor: descriptor, size: pointSize)
  }
}

// MARK: - CSS color → UIColor

private enum MugenColor {
  static func parse(_ css: String) -> UIColor {
    let value = css.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("#") { return hex(String(value.dropFirst())) }
    if value.lowercased().hasPrefix("rgb") { return rgb(value) }
    return .label // sensible fallback for named colors we don't map
  }

  private static func hex(_ hex: String) -> UIColor {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 1
    func component(_ s: Substring) -> CGFloat { CGFloat(Int(s, radix: 16) ?? 0) / 255 }
    switch hex.count {
    case 3, 4:
      let chars = Array(hex)
      r = component(Substring(String([chars[0], chars[0]])))
      g = component(Substring(String([chars[1], chars[1]])))
      b = component(Substring(String([chars[2], chars[2]])))
      if hex.count == 4 { a = component(Substring(String([chars[3], chars[3]]))) }
    case 6, 8:
      let chars = Array(hex)
      r = component(Substring(String(chars[0...1])))
      g = component(Substring(String(chars[2...3])))
      b = component(Substring(String(chars[4...5])))
      if hex.count == 8 { a = component(Substring(String(chars[6...7]))) }
    default:
      break
    }
    return UIColor(red: r, green: g, blue: b, alpha: a)
  }

  private static func rgb(_ css: String) -> UIColor {
    guard let open = css.firstIndex(of: "("), let close = css.firstIndex(of: ")") else {
      return .label
    }
    let inner = css[css.index(after: open)..<close]
    let parts = inner.split(separator: ",").map {
      $0.trimmingCharacters(in: .whitespaces)
    }
    func channel(_ i: Int) -> CGFloat {
      guard i < parts.count, let v = Double(parts[i]) else { return 0 }
      return CGFloat(v) / 255
    }
    let alpha: CGFloat = parts.count > 3 ? CGFloat(Double(parts[3]) ?? 1) : 1
    return UIColor(red: channel(0), green: channel(1), blue: channel(2), alpha: alpha)
  }
}
