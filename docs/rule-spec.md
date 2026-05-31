# Rule Specification

The rule normalizes round parentheses to a consistent width — full-width `（）` or half-width `()`.
For each pair, the target follows from the parenthesized content and the surrounding context under the selected `mode`, and every diagnostic is autofixable.

This specification has two parts.
**Part I** defines the normalization policy: which parentheses are in scope, how each pair's width is decided, and what a fix produces.
**Part II** defines the processing model: how a block's Markdown is reduced to the character sequence the policy operates on, and how fixes are applied to the source.

The policy in Part I operates on a per-**segment** **virtual character sequence** derived from each block.
The terms *segment* and *opaque placeholder* are used throughout Part I and defined precisely in Part II.

## Part I — Normalization policy

### Scope

The rule examines the inline content of `Paragraph`, `Header`, and `TableCell` blocks.
Only round parentheses are in scope: `(` `)` and `（` `）`.

An author opts a pair out by backslash-escaping either parenthesis (`\(`, `\)`);
an escaped parenthesis is never paired or fixed (escape handling is detailed in Part II).

### Pairing

`(` and `（` open; `)` and `）` close.
Within a segment, parentheses are matched with a stack regardless of width; nesting is supported and each pair is evaluated independently.
Unmatched parentheses are ignored, and pairing never crosses a segment boundary.

### CJK characters

A character is **CJK** if it is used in Japanese or Chinese text and does not normally appear in English.
Korean (Hangul) and Bopomofo are out of scope.
ASCII, `…` `–` `—`, and opaque placeholders are never CJK.

The precise class is:

```js
/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}！-｠￠-￦]/u
```

`Script_Extensions` covers Han, Hiragana, and Katakana — including half-width katakana (U+FF66–FF9F) and shared CJK punctuation (`ー` `・` `々` `、` `。`).
The literal ranges add full-width `Common` characters: U+FF01–FF60 and U+FFE0–FFE6.
An in-scope parenthesis is excluded even when it falls in these ranges, so a full-width `（` `）` never counts as a CJK neighbor.

### Inner content

A pair **has inner CJK** if any character strictly between its parentheses is CJK.

### Outer context

**Transparent** characters are U+0020, U+3000, U+0009, and U+00A0; no others.

A pair's **left neighbor** is the nearest non-transparent character before the opening parenthesis within the segment;
its **right neighbor** is the nearest non-transparent character after the closing parenthesis.
The **outer state** is:

- **outer CJK**: at least one neighbor is CJK.
- **outer non-CJK**: at least one neighbor exists, and none is CJK.
- **isolated**: neither side has a neighbor.

### Decision

For each pair, `mode` together with the pair's inner content and outer state selects a target of **full**, **half**, or **either**.
`mode` is `content` (default) or `context`.

#### Mode `content`

Inner content leads; the outer state matters only when there is no inner CJK.

| outer \ inner | inner CJK | no inner CJK |
| --- | --- | --- |
| outer CJK | full | either |
| outer non-CJK | full | half |
| isolated | full | half |

#### Mode `context`

The outer state leads; inner content matters only when isolated.

| outer \ inner | inner CJK | no inner CJK |
| --- | --- | --- |
| outer CJK | full | full |
| outer non-CJK | half | half |
| isolated | full | half |

### Normalization outcome

A pair is the unit of normalization: the decision's target determines both parentheses' width and the spacing on their outer sides.

A pair is rewritten when it is not already at its target: for a **full** or **half** target, when either parenthesis has the wrong width; for an **either** target, when the two parentheses differ in width (a mixed pair is brought to full width).
When a pair is rewritten, both parentheses are set to the resolved width (full width for an **either** target), and the spacing on the **outer side** of each parenthesis — left of the opening, right of the closing — is adjusted if that side has a neighbor:

- **To full-width**: no transparent characters remain between the parenthesis and its neighbor.
- **To half-width**: a single U+0020 space separates the parenthesis from its neighbor when they would otherwise abut; existing transparent characters are preserved.
  No space is added when:
  - before `(`, the left neighbor is open punctuation (`General_Category` `Ps`) or an initial quote (`Pi`);
  - after `)`, the right neighbor is close punctuation (`Pe`), a final quote (`Pf`), one of `. , ; : ! ?`, or `…`;
  - the neighbor is a straight quote `"` or `'`, on either side.

A side without a neighbor, and the inner side of every parenthesis, are left unchanged.
A pair already at its target is left untouched, so spacing is never changed on its own.

### Examples

| Input | outer | inner | Mode `content` | Mode `context` |
| --- | --- | --- | --- | --- |
| `名称(めいしょう)` | CJK | CJK | `名称（めいしょう）` | `名称（めいしょう）` |
| `これはソース(source)です` | CJK | none | `これはソース(source)です` | `これはソース（source）です` |
| `これはソース（source)です` | CJK | none | `これはソース（source）です` | `これはソース（source）です` |
| `The kanji（漢字）means` | non-CJK | CJK | `The kanji（漢字）means` | `The kanji (漢字) means` |
| `version (2.0)` | non-CJK | none | `version (2.0)` | `version (2.0)` |
| `version（2.0)text` | non-CJK | none | `version (2.0) text` | `version (2.0) text` |
| `(注)` (alone) | isolated | CJK | `（注）` | `（注）` |
| `(123)` (alone) | isolated | none | `(123)` | `(123)` |
| `名称\(めいしょう\)` | excluded | excluded | accepted as is | accepted as is |

## Part II — Processing model

### The virtual character sequence

Each block's inline content is reduced to a **virtual character sequence** that the policy in Part I analyzes.
The inline subtree is traversed in order, and each node contributes as follows:

- **Text** (`Str`): its characters, one per Unicode code point, with CommonMark backslash escapes resolved (see Backslash escapes).
- **Hard line break** (a `Break` node, or a line-terminator character U+000A, U+000D, U+2028, U+2029): a **segment boundary**.
- **Container node** (any node with children, such as `Strong`, `Emphasis`, or `Link`): its children are traversed in order; non-child data such as URLs and delimiters is excluded.
- **Any other leaf node** (`Code`, `Image`, `Html`, …): a single **opaque placeholder**.
  Its text, alt text, and URLs are not examined.
  A placeholder is never CJK, never transparent, and never a parenthesis.

A **segment** is a maximal subsequence containing no boundary.
Pairing and all classification operate within a single segment and never cross a boundary.

### Backslash escapes

Within text, a backslash escapes the following character only when that character is ASCII punctuation;
the backslash is then consumed, and the escaped character cannot begin a further escape.

- `\(` and `\)` each contribute one opaque placeholder: the author's opt-out, excluded from pairing and fixing.
- Any other escape contributes the single literal character it denotes (`\\` → `\`, `\.` → `.`).
- A backslash not followed by ASCII punctuation is a literal backslash.
  Full-width `（` `）` are not ASCII, so `\（` is a literal backslash followed by a real full-width parenthesis.

### Applying fixes

The outcome of a fix — the resolved widths and the outer-side spacing — is defined in Part I (Normalization outcome).
Each parenthesis the fix touches is reported at its own position:
one whose width changes carries the width message (or the unify message for an **either** target);
one already at the target width but whose spacing changes carries the spacing message.

#### Escape preservation

A fix never turns a literal backslash into an escape.
When a parenthesis is rewritten to half-width `(` or `)` and an odd-length run of backslashes immediately precedes it in the source, one backslash is prepended to the replacement so the run stays even.
For example, `version（2.0\）` is fixed to `version (2.0\\)`, not `version (2.0\)`.
