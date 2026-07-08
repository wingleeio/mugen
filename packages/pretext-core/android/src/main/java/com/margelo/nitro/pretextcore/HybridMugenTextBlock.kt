//
// HybridMugenTextBlock.kt
// PretextCore
//
// The Android half of <MugenTextBlock> — the "one native view per block" piece
// of NATIVE-TEXT.md. Draws a whole markdown block as ONE android.view.View,
// painting pretext-core's own line geometry so the painted block is exactly
// `lines × lineHeight` and every fragment sits at pretext's x.
//
// Spec shape is PRE-BROKEN LINES (see mugen-text-block.nitro.ts header): the JS
// side ran pretext-core's rich-inline walk and handed us positioned fragments,
// so this view performs NO line breaking — it just draws. That is what makes
// painted geometry equal measured geometry: both flow from the same walk.
//
// A per-fragment Canvas.drawText is used rather than a single StaticLayout
// because pretext's fragments within a line are NOT contiguous — collapsed
// inter-item whitespace lives in the gaps between successive `x`s — so each
// fragment must be drawn at its own `x` (the exact analogue of rich-text.tsx
// painting each fragment as its own absolutely-positioned <Text>). A
// SpannableString/StaticLayout would re-flow those gaps.
//
// ⚠️ NOT COMPILED ON THE HOST. This file builds only inside the comet dev
// client (RN 0.81) per NATIVE-TEXT.md — the app's gradle sync picks it up via
// android/build.gradle (kotlin srcDir). Nitro autolinking (nitro.json →
// HybridMugenTextBlock) wires it into the Fabric ViewManager registered as
// "MugenTextBlock".

package com.margelo.nitro.pretextcore

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

/**
 * Nitro HybridView implementation. Holds the single block view and forwards the
 * `spec` prop into it. Constructed by the generated ViewManager with the
 * `ThemedReactContext`.
 */
@DoNotStrip
@Keep
class HybridMugenTextBlock(context: Context) : HybridMugenTextBlockSpec() {
  private val blockView = MugenBlockView(context)

  /** The View Nitro mounts for this HybridView. Stable for the view's life. */
  override val view: View
    get() = blockView

  /** The whole attributed-string block. Assigning re-lays and repaints. */
  override var spec: MugenTextBlockSpec =
    MugenTextBlockSpec(
      runs = emptyArray(),
      lines = emptyArray(),
      lineHeight = 0.0,
      maxWidth = 0.0,
      align = null,
    )
    set(value) {
      field = value
      blockView.apply(value)
    }
}

/**
 * One View that paints the entire block. Canvas.drawText draws each fragment at
 * pretext's `(x, lineTop + baseline)`; inline-box placeholders reserve their
 * advance and draw nothing (the React tree overlays box content as a sibling).
 */
@SuppressWarnings("ViewConstructor")
private class MugenBlockView(context: Context) : View(context) {
  private val density: Float = resources.displayMetrics.density

  private var runs: Array<MugenTextRun> = emptyArray()
  private var lines: Array<MugenTextLine> = emptyArray()
  private var lineHeightPx: Float = 0f
  private var maxWidthPx: Float = 0f
  private var align: MugenTextAlign = MugenTextAlign.LEFT

  // One reusable Paint; per-fragment attributes are re-applied before each draw.
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG)

  fun apply(spec: MugenTextBlockSpec) {
    runs = spec.runs
    lines = spec.lines
    // pretext geometry is in CSS px; Android Canvas is in device px.
    lineHeightPx = spec.lineHeight.toFloat() * density
    maxWidthPx = spec.maxWidth.toFloat() * density
    align = spec.align ?: MugenTextAlign.LEFT
    requestLayout()
    invalidate()
  }

  /**
   * pretext owns the block's geometry: width is the break width, height is
   * `lines × lineHeight` exactly (blank lines counted), matching the measure.
   */
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = resolveSize(Math.ceil(maxWidthPx.toDouble()).toInt(), widthMeasureSpec)
    val height = Math.ceil((lines.size * lineHeightPx).toDouble()).toInt()
    setMeasuredDimension(width, resolveSize(height, heightMeasureSpec))
  }

  override fun onDraw(canvas: Canvas) {
    if (lineHeightPx <= 0f) return

    for (lineIndex in lines.indices) {
      val line = lines[lineIndex]
      if (line.fragments.isEmpty()) continue // blank line — reserves height only

      val alignDx = alignmentOffset(line.width.toFloat() * density)
      val lineTop = lineIndex * lineHeightPx

      for (fragment in line.fragments) {
        val runIndex = fragment.runIndex.toInt()
        if (runIndex < 0 || runIndex >= runs.size) continue
        val run = runs[runIndex]

        // Inline-box placeholder: reserve `advance`, draw nothing. The React
        // side overlays the box content at (fragment.x, lineTop).
        if (run.advance != null) continue
        if (fragment.text.isEmpty()) continue

        applyRunToPaint(run)

        val fm = paint.fontMetrics
        // Center the font's line box inside `lineHeight`, like RN's <Text
        // lineHeight> vertical centering (matches rich-text.tsx).
        val glyphHeight = fm.descent - fm.ascent
        val leading = Math.max(0f, lineHeightPx - glyphHeight)
        val baseline = lineTop + leading / 2f - fm.ascent

        val drawX = alignDx + fragment.x.toFloat() * density

        // Background fill (inline-code chip / mark) behind the fragment advance.
        run.background?.let { bg ->
          val save = paint.color
          val style = paint.style
          paint.color = parseColor(bg)
          paint.style = Paint.Style.FILL
          canvas.drawRect(
            drawX,
            lineTop,
            drawX + fragment.width.toFloat() * density,
            lineTop + lineHeightPx,
            paint,
          )
          paint.color = save
          paint.style = style
        }

        canvas.drawText(fragment.text, drawX, baseline, paint)
      }
    }
  }

  private fun alignmentOffset(lineWidthPx: Float): Float =
    when (align) {
      MugenTextAlign.CENTER -> Math.max(0f, (maxWidthPx - lineWidthPx) / 2f)
      MugenTextAlign.RIGHT -> Math.max(0f, maxWidthPx - lineWidthPx)
      MugenTextAlign.LEFT -> 0f
    }

  private fun applyRunToPaint(run: MugenTextRun) {
    val parsed = parseFont(run.font)
    paint.reset()
    paint.flags = Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG
    paint.typeface = parsed.typeface
    paint.textSize = parsed.sizePx * density
    paint.color = parseColor(run.color)

    run.decoration?.let { decoration ->
      if (decoration.contains("underline")) paint.isUnderlineText = true
      if (decoration.contains("line-through")) paint.isStrikeThruText = true
    }
    run.letterSpacing?.let { spacing ->
      if (spacing != 0.0) {
        // Paint.letterSpacing is in ems; pretext measured it in px.
        val em = if (paint.textSize > 0f) (spacing.toFloat() * density) / paint.textSize else 0f
        paint.letterSpacing = em
      }
    }
    // Turn ligatures off for code runs (literal `===`/`!=`/`=>`); height-neutral.
    if (run.noLigatures == true) {
      paint.fontFeatureSettings = "\"liga\" 0, \"clig\" 0, \"dlig\" 0, \"hlig\" 0, \"calt\" 0"
    }
  }

  private fun parseColor(css: String): Int =
    try {
      when {
        css.startsWith("#") || css.startsWith("rgb", ignoreCase = true) -> Color.parseColor(css)
        else -> Color.parseColor(css)
      }
    } catch (_: IllegalArgumentException) {
      Color.BLACK
    }

  // Cache parsed fonts — shorthand strings repeat heavily across a block.
  private val fontCache = HashMap<String, ParsedFont>()

  private fun parseFont(shorthand: String): ParsedFont =
    fontCache.getOrPut(shorthand) { ParsedFont.parse(shorthand) }
}

/**
 * A canvas font shorthand pretext measured with (e.g.
 * `"italic 600 16px Inter, sans-serif"`) resolved to a Typeface + CSS px size.
 * Mirrors the fields pretext-native's shorthand parser reads:
 * [style] [weight] <size>px <family>.
 */
private data class ParsedFont(val typeface: Typeface, val sizePx: Float) {
  companion object {
    fun parse(shorthand: String): ParsedFont {
      var italic = false
      var bold = false
      var sizePx = 16f
      var family: String? = null

      val tokens = shorthand.split(" ").filter { it.isNotEmpty() }
      var sizeIndex = -1
      for (i in tokens.indices) {
        val token = tokens[i]
        if (token.endsWith("px")) {
          token.dropLast(2).toFloatOrNull()?.let { sizePx = it }
          sizeIndex = i
          break
        }
        when (token.lowercase()) {
          "italic", "oblique" -> italic = true
          "bold" -> bold = true
          "normal" -> {}
          else -> token.toIntOrNull()?.let { if (it >= 600) bold = true }
        }
      }
      if (sizeIndex >= 0 && sizeIndex + 1 < tokens.size) {
        family =
          tokens.subList(sizeIndex + 1, tokens.size)
            .joinToString(" ")
            .split(",")
            .firstOrNull()
            ?.trim(' ', '"', '\'')
      }

      val style =
        when {
          bold && italic -> Typeface.BOLD_ITALIC
          bold -> Typeface.BOLD
          italic -> Typeface.ITALIC
          else -> Typeface.NORMAL
        }
      val base =
        when (family?.lowercase()) {
          null, "sans-serif", "system-ui", "-apple-system" -> Typeface.SANS_SERIF
          "serif" -> Typeface.SERIF
          "monospace", "ui-monospace" -> Typeface.MONOSPACE
          else -> Typeface.create(family, Typeface.NORMAL)
        }
      return ParsedFont(Typeface.create(base, style), sizePx)
    }
  }
}
