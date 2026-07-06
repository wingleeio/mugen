import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, ScrollView, Text as RNText, View, type TextStyle } from 'react-native';
import { getPrimitiveDef, markPrimitive, type Font } from '@wingleeio/mugen/native-core';
import {
  CodeBlock as WebCodeBlock,
  tokenizeLine,
  INITIAL_STATE,
  profileFor,
  defaultTokenColors,
  type CodeTokenColors,
  type CodeBlockHeader,
  type LineState,
  type Token,
} from '@wingleeio/mugen-markdown/native-core';
import { fontShorthandToTextStyle } from '@wingleeio/mugen-native';

export type { CodeBlockHeader };

export interface CodeBlockProps {
  /** Raw code text. Newlines determine the line count. */
  value: string;
  /** Info-string language (drives the highlighter / header label). */
  lang?: string;
  /** Monospace font. Required. */
  font: Font;
  /** Line height in px. Required. */
  lineHeight: number;
  /** Uniform padding in px (chrome counted in the height). */
  padding?: number;
  background?: string;
  color?: string;
  radius?: number;
  borderColor?: string;
  /** Token-colour overrides, or `false` to disable highlighting. */
  highlight?: Partial<CodeTokenColors> | false;
  /** Chrome bar above the code (label + copy). Height folds into the measure. */
  header?: CodeBlockHeader;
}

const webDef = getPrimitiveDef(WebCodeBlock)!;

// Copying text needs a clipboard implementation, which RN core no longer
// ships. Apps install one (`expo-clipboard`, `@react-native-clipboard`) and
// wire it here; without a handler the header simply omits the button.
let copyHandler: ((text: string) => void | Promise<void>) | null = null;
export function setCodeCopyHandler(handler: ((text: string) => void | Promise<void>) | null): void {
  copyHandler = handler;
}

function splitLines(value: string): string[] {
  if (value.length === 0) return [];
  const lines = value.split('\n');
  // A trailing newline doesn't add a visible line (matches the measure).
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Resolve the web palette's CSS sentinels to a concrete native colour. */
function tokenColor(c: string, fallback: string | undefined): string | undefined {
  return c === 'currentColor' || c === 'inherit' ? fallback : c;
}

interface TokenizedLine {
  text: string;
  tokens: Token[];
}

function CopyButton(props: { value: string; header: CodeBlockHeader }): ReactElement | null {
  const [copied, setCopied] = useState(false);
  if (copyHandler === null) return null;
  const h = props.header;
  return (
    <Pressable
      onPress={() => {
        void Promise.resolve(copyHandler?.(props.value)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      style={{
        borderWidth: 1,
        borderColor: h.borderColor ?? 'rgba(127, 127, 127, 0.2)',
        borderRadius: 8,
        paddingHorizontal: 9,
        paddingVertical: 4,
        ...(h.buttonBackground != null ? { backgroundColor: h.buttonBackground } : null),
      }}
    >
      <RNText style={{ fontSize: h.fontSize, ...(h.color != null ? { color: h.color } : null) }}>
        {copied ? 'Copied' : 'Copy'}
      </RNText>
    </Pressable>
  );
}

/**
 * The native render half: a fixed-height plate — optional header bar, then a
 * horizontal ScrollView of one single-line `<Text>` per code line. Every height
 * is pinned from the same numbers the measure used
 * (`header + lines × lineHeight + 2 × padding`), so highlighting, scrolling,
 * or font fallback can never move a row below it.
 *
 * Highlighting runs the shared line tokenizer synchronously — code blocks in
 * chat are small; a time-sliced path (web parity) can layer in later without
 * touching heights, because colours are paint-only here too.
 */
function CodeBlockComponent(props: CodeBlockProps): ReactElement {
  const pad = props.padding ?? 0;
  const lines = useMemo(() => splitLines(props.value), [props.value]);
  const profile = props.highlight === false ? null : profileFor(props.lang);
  const colors: CodeTokenColors = useMemo(
    () => ({
      ...defaultTokenColors,
      ...(props.highlight !== false && props.highlight != null ? props.highlight : null),
    }),
    [props.highlight],
  );

  const tokenized = useMemo<TokenizedLine[]>(() => {
    if (profile == null) return lines.map((text) => ({ text, tokens: [] }));
    let state: LineState = INITIAL_STATE;
    return lines.map((text) => {
      const { tokens, end } = tokenizeLine(text, state, profile);
      state = end;
      return { text, tokens };
    });
  }, [lines, profile]);

  const fontStyle: TextStyle = {
    ...fontShorthandToTextStyle(props.font),
    lineHeight: props.lineHeight,
    ...(props.color != null ? { color: props.color } : null),
  };

  const bodyHeight = lines.length * props.lineHeight + 2 * pad;
  const header = props.header;

  const body = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ height: bodyHeight, flexGrow: 0 }}
      contentContainerStyle={{ padding: pad, flexDirection: 'column' }}
    >
      <View>
        {tokenized.map((line, i) => {
          let children: ReactNode;
          if (line.tokens.length === 0) {
            children = line.text;
          } else {
            // Interleave uncoloured gaps with coloured token slices.
            const parts: ReactNode[] = [];
            let cursor = 0;
            for (let t = 0; t < line.tokens.length; t++) {
              const tok = line.tokens[t]!;
              if (tok.start > cursor) parts.push(line.text.slice(cursor, tok.start));
              const color = tokenColor(colors[tok.type], props.color);
              parts.push(
                <RNText key={t} style={color != null ? { color } : undefined}>
                  {line.text.slice(tok.start, tok.end)}
                </RNText>,
              );
              cursor = tok.end;
            }
            if (cursor < line.text.length) parts.push(line.text.slice(cursor));
            children = parts;
          }
          return (
            <RNText key={i} numberOfLines={1} style={[fontStyle, { height: props.lineHeight }]}>
              {children}
            </RNText>
          );
        })}
      </View>
    </ScrollView>
  );

  const plateStyle = {
    ...(props.background != null ? { backgroundColor: props.background } : null),
    ...(props.radius != null ? { borderRadius: props.radius, overflow: 'hidden' as const } : null),
  };

  // The outer border is an absolutely-positioned ring, not a real border — a
  // border would inset the content box and clip the last line; the ring is
  // height-neutral, exactly like the web's inset box-shadow.
  const ring =
    props.borderColor != null ? (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderWidth: 1,
          borderColor: props.borderColor,
          ...(props.radius != null ? { borderRadius: props.radius } : null),
        }}
      />
    ) : null;

  if (header == null) {
    return (
      <View style={[plateStyle, { height: bodyHeight }]}>
        {body}
        {ring}
      </View>
    );
  }

  return (
    <View style={[plateStyle, { height: header.height + bodyHeight }]}>
      <View
        style={{
          height: header.height,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          ...(header.background != null ? { backgroundColor: header.background } : null),
          ...(header.borderColor != null
            ? { borderBottomWidth: 1, borderBottomColor: header.borderColor }
            : null),
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontSize: header.fontSize,
            ...(header.fontFamily != null ? { fontFamily: header.fontFamily } : null),
            ...(header.color != null ? { color: header.color } : null),
          }}
        >
          {header.label ?? props.lang ?? 'code'}
        </RNText>
        <CopyButton value={props.value} header={header} />
      </View>
      {body}
      {ring}
    </View>
  );
}
CodeBlockComponent.displayName = 'CodeBlock';

/** Measured exactly like the web `CodeBlock` (width-independent line count). */
export const CodeBlock = markPrimitive(
  CodeBlockComponent as (props: CodeBlockProps) => ReactElement,
  {
    name: 'CodeBlock',
    measure: webDef.measure,
  },
);
