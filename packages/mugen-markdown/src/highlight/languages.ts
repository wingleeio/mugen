/**
 * Language profiles for the built-in tokenizer. A profile is a small data
 * description — comment markers, string delimiters, keyword sets, and a few
 * classification heuristics — interpreted by one shared scanner, so adding a
 * language is a handful of lines rather than a grammar.
 */
export interface LanguageProfile {
  /** Markers that comment to end-of-line (`//`, `#`, `--`). */
  lineComments: readonly string[];
  /** Open/close pairs that may span lines (C-style block comments, `<!-- … -->`). */
  blockComments: readonly (readonly [string, string])[];
  /** Single-char string delimiters; an unclosed one ends at end-of-line. */
  quotes: readonly string[];
  /** String delimiters that carry across lines (`` ` ``, `'''`, `"""`). */
  multilineQuotes: readonly string[];
  keywords: ReadonlySet<string>;
  constants: ReadonlySet<string>;
  /** Colour Capitalised identifiers as types. */
  capitalTypes: boolean;
  /** Extra identifier characters beyond `[A-Za-z0-9_$]` (e.g. `-` for CSS). */
  identExtra: string;
  /** Lower-case words before keyword/constant lookup (SQL, Dockerfile). */
  caseInsensitive?: boolean;
  /** A string immediately followed by `:` is a property key (JSON). */
  stringKeys?: boolean;
  /** An identifier immediately followed by `:` is a property key. */
  colonProps?: boolean;
  /** An identifier followed by `=` (not `==`) is a property/attribute name. */
  eqProps?: boolean;
  /** An identifier right after `<` or `</` is a tag name (HTML/XML). */
  tags?: boolean;
}

function words(s: string): ReadonlySet<string> {
  return new Set(s.split(' '));
}

const NONE: ReadonlySet<string> = new Set();

function profile(p: Partial<LanguageProfile>): LanguageProfile {
  return {
    lineComments: p.lineComments ?? [],
    blockComments: p.blockComments ?? [],
    quotes: p.quotes ?? ['"', "'"],
    multilineQuotes: p.multilineQuotes ?? [],
    keywords: p.keywords ?? NONE,
    constants: p.constants ?? NONE,
    capitalTypes: p.capitalTypes ?? false,
    identExtra: p.identExtra ?? '',
    ...(p.caseInsensitive ? { caseInsensitive: true } : null),
    ...(p.stringKeys ? { stringKeys: true } : null),
    ...(p.colonProps ? { colonProps: true } : null),
    ...(p.eqProps ? { eqProps: true } : null),
    ...(p.tags ? { tags: true } : null),
  };
}

// One profile covers JS and TS: TS-only words are harmless in JS sources.
const jsTs = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  multilineQuotes: ['`'],
  keywords: words(
    'abstract any as asserts async await bigint boolean break case catch class const continue ' +
      'debugger declare default delete do else enum export extends finally for from function get ' +
      'if implements import in infer instanceof interface is keyof let namespace never new number ' +
      'object of out override package private protected public readonly return satisfies set ' +
      'static string super switch symbol this throw try type typeof unique unknown var void while with yield',
  ),
  constants: words('true false null undefined NaN Infinity globalThis'),
  capitalTypes: true,
  colonProps: true,
});

const python = profile({
  lineComments: ['#'],
  multilineQuotes: ['"""', "'''"],
  keywords: words(
    'and as assert async await break class continue def del elif else except finally for from ' +
      'global if import in is lambda match nonlocal not or pass raise return try while with yield',
  ),
  constants: words('True False None self cls'),
  capitalTypes: true,
});

// Rust: only double-quoted strings — a single quote is a lifetime (`'a`) far
// more often than a char literal, and must not swallow the rest of the line.
const rust = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  quotes: ['"'],
  keywords: words(
    'as async await break const continue crate dyn else enum extern fn for if impl in let loop ' +
      'macro match mod move mut pub ref return self Self static struct super trait type union unsafe use where while',
  ),
  constants: words('true false'),
  capitalTypes: true,
});

const go = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  multilineQuotes: ['`'],
  keywords: words(
    'any break case chan const continue default defer else error fallthrough for func go goto if ' +
      'import interface map package range return select string struct switch type var int int8 int16 ' +
      'int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 byte rune bool',
  ),
  constants: words('true false nil iota'),
});

const cLike = (extra: string): LanguageProfile =>
  profile({
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    keywords: words(
      'auto break case char const continue default do double else enum extern float for goto if ' +
        'inline int long register restrict return short signed sizeof static struct switch typedef ' +
        'union unsigned void volatile while ' +
        extra,
    ),
    constants: words('true false NULL nullptr'),
    capitalTypes: true,
  });

const c = cLike('');
const cpp = cLike(
  'alignas alignof bool catch class concept constexpr consteval constinit decltype delete ' +
    'dynamic_cast explicit export friend mutable namespace new noexcept operator private protected ' +
    'public reinterpret_cast requires static_assert static_cast template this thread_local throw ' +
    'try typeid typename using virtual wchar_t co_await co_return co_yield',
);

const java = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  keywords: words(
    'abstract assert boolean break byte case catch char class const continue default do double ' +
      'else enum extends final finally float for goto if implements import instanceof int interface ' +
      'long native new package permits private protected public record return sealed short static ' +
      'strictfp super switch synchronized this throw throws transient try var void volatile while yield',
  ),
  constants: words('true false null'),
  capitalTypes: true,
});

const csharp = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  keywords: words(
    'abstract as async await base bool break byte case catch char checked class const continue ' +
      'decimal default delegate do double else enum event explicit extern finally fixed float for ' +
      'foreach goto if implicit in int interface internal is lock long namespace new object operator ' +
      'out override params private protected public readonly record ref return sbyte sealed short ' +
      'sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked ' +
      'unsafe ushort using var virtual void volatile when where while yield',
  ),
  constants: words('true false null'),
  capitalTypes: true,
});

const php = profile({
  lineComments: ['//', '#'],
  blockComments: [['/*', '*/']],
  keywords: words(
    'abstract and array as break callable case catch class clone const continue declare default do ' +
      'echo else elseif empty enum extends final finally fn for foreach function global goto if ' +
      'implements include include_once instanceof insteadof interface isset list match namespace new ' +
      'or print private protected public readonly require require_once return static switch throw ' +
      'trait try unset use var while xor yield',
  ),
  constants: words('true false null TRUE FALSE NULL'),
  capitalTypes: true,
});

const ruby = profile({
  lineComments: ['#'],
  keywords: words(
    'alias and begin break case class def defined? do else elsif end ensure for if in module next ' +
      'not or redo rescue retry return super then undef unless until when while yield require require_relative attr_accessor attr_reader attr_writer',
  ),
  constants: words('true false nil self'),
  capitalTypes: true,
});

const swift = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  multilineQuotes: ['"""'],
  keywords: words(
    'as associatedtype await break case catch class continue convenience default defer deinit ' +
      'didSet do dynamic else enum extension fallthrough fileprivate final for func get guard if ' +
      'import in indirect infix init inout internal is lazy let mutating nonmutating open operator ' +
      'optional override postfix prefix private protocol public repeat required rethrows return set ' +
      'some static struct subscript super switch throw throws try typealias unowned var weak where while willSet',
  ),
  constants: words('true false nil'),
  capitalTypes: true,
});

const kotlin = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  multilineQuotes: ['"""'],
  keywords: words(
    'abstract actual annotation as break by catch class companion const constructor continue ' +
      'crossinline data do else enum expect external final finally for fun get if import in infix ' +
      'init inline inner interface internal is lateinit noinline object open operator out override ' +
      'package private protected public reified return sealed set super suspend tailrec this throw ' +
      'try typealias val var vararg when where while',
  ),
  constants: words('true false null'),
  capitalTypes: true,
});

const shell = profile({
  lineComments: ['#'],
  keywords: words(
    'if then else elif fi for while until do done case esac function in select time return exit ' +
      'export local readonly declare unset shift break continue eval exec set source alias trap',
  ),
});

const sql = profile({
  lineComments: ['--'],
  blockComments: [['/*', '*/']],
  quotes: ['"', "'", '`'],
  caseInsensitive: true,
  keywords: words(
    'select from where insert into values update delete set create table alter drop index view as ' +
      'join inner left right full outer on group by order having limit offset union all distinct ' +
      'and or not is in like between exists case when then else end primary key foreign references ' +
      'default constraint unique check if begin commit rollback transaction with returning cascade',
  ),
  constants: words('null true false'),
});

const css = profile({
  blockComments: [['/*', '*/']],
  identExtra: '-@#',
  keywords: words(
    '@media @import @charset @namespace @supports @document @page @font-face @keyframes ' +
      '@counter-style @font-feature-values @layer @container @property @scope',
  ),
  constants: words('inherit initial unset revert auto none important'),
  colonProps: true,
});

const scss = profile({
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  identExtra: '-@#$',
  keywords: words('@media @import @use @forward @mixin @include @function @return @if @else @each @for @while @extend @keyframes @supports @layer @container @font-face @charset @debug @warn @error'),
  constants: words('inherit initial unset revert auto none important'),
  colonProps: true,
});

const html = profile({
  blockComments: [['<!--', '-->']],
  identExtra: '-',
  tags: true,
  eqProps: true,
});

const json = profile({
  lineComments: ['//'], // tolerate jsonc
  blockComments: [['/*', '*/']],
  stringKeys: true,
  constants: words('true false null'),
});

const yaml = profile({
  lineComments: ['#'],
  colonProps: true,
  constants: words('true false null yes no on off True False Null Yes No On Off'),
});

const toml = profile({
  lineComments: ['#'],
  multilineQuotes: ['"""', "'''"],
  eqProps: true,
  constants: words('true false'),
});

const ini = profile({
  lineComments: ['#', ';'],
  eqProps: true,
});

const dockerfile = profile({
  lineComments: ['#'],
  caseInsensitive: true,
  keywords: words(
    'from run cmd copy add env arg workdir expose entrypoint volume user label onbuild stopsignal healthcheck shell as',
  ),
});

const registry = new Map<string, LanguageProfile>();

/**
 * Register a profile under one or more fence info-string names (lower-cased).
 * Use this to add or override languages for the built-in highlighter.
 */
export function registerLanguage(names: string | readonly string[], p: LanguageProfile): void {
  for (const name of typeof names === 'string' ? [names] : names) {
    registry.set(name.toLowerCase(), p);
  }
}

registerLanguage(['javascript', 'js', 'jsx', 'mjs', 'cjs'], jsTs);
registerLanguage(['typescript', 'ts', 'tsx', 'mts', 'cts'], jsTs);
registerLanguage(['python', 'py', 'python3'], python);
registerLanguage(['rust', 'rs'], rust);
registerLanguage(['go', 'golang'], go);
registerLanguage(['java'], java);
registerLanguage(['c', 'h'], c);
registerLanguage(['cpp', 'c++', 'cc', 'cxx', 'hpp', 'hxx', 'objc', 'objective-c'], cpp);
registerLanguage(['csharp', 'cs', 'c#'], csharp);
registerLanguage(['php'], php);
registerLanguage(['ruby', 'rb'], ruby);
registerLanguage(['swift'], swift);
registerLanguage(['kotlin', 'kt', 'kts'], kotlin);
registerLanguage(['shell', 'bash', 'sh', 'zsh', 'fish', 'console', 'shellsession'], shell);
registerLanguage(['sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'plsql'], sql);
registerLanguage(['css'], css);
registerLanguage(['scss', 'sass', 'less'], scss);
registerLanguage(['html', 'xml', 'svg', 'xhtml', 'markup', 'vue', 'astro'], html);
registerLanguage(['json', 'jsonc', 'json5'], json);
registerLanguage(['yaml', 'yml'], yaml);
registerLanguage(['toml'], toml);
registerLanguage(['ini'], ini);
registerLanguage(['dockerfile', 'docker'], dockerfile);

/** The profile for a fence language, or `null` when the language is unknown. */
export function profileFor(lang: string | undefined): LanguageProfile | null {
  if (lang == null || lang.length === 0) return null;
  return registry.get(lang.trim().toLowerCase()) ?? null;
}
