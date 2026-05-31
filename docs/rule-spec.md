# Rule Specification

Status: under review.

## 1. Purpose

Normalize round parentheses to full-width `（）` or half-width `()`.
The decision for each pair — `full`, `half`, or `either` — is determined by its inner content and outer context.

## 2. Scope

- Applies to inline content in `Paragraph`, `Header`, and `TableCell` blocks.
- Targets round parentheses only: `( )` and `（ ）`.
- Backslash-escaped target parentheses in `Str` source are excluded from pairing and fixing.
- Every diagnostic carries an autofix.

## 3. Definitions

### 3.1 Virtual string and runs

From each block container, the inline subtree is flattened into a sequence of virtual characters, the **virtual string**.
A virtual character is either a source character or an **opaque placeholder** for a protected source span.
Opaque placeholders are non-transparent (§3.5), non-CJK (§3.3), and not parentheses.
Line breaks split the virtual string into **runs**.
Pairing (§3.2), inner-content classification (§3.4), and neighbor lookup (§3.5) never cross a run boundary.

Flattening rules:

- **Container node** (has `children`): recurse into children. Non-child data (URLs, delimiters) is excluded.
- **`Str`**: contributes the rendered inline text by Unicode code point, resolving CommonMark backslash escapes against the raw source.
  A backslash escapes the following character only when that character is ASCII punctuation (the escapable set); the backslash is then consumed and cannot be re-read as the start of another escape.
  - An escaped **in-scope parenthesis** (`\(` or `\)`) is the author's opt-out: the two-character span contributes one opaque placeholder.
  - Any other escape contributes the single literal character it denotes (e.g. `\\` contributes one `\`).
  - A backslash not followed by an escapable character is an ordinary backslash character. In particular, full-width `（）` are not ASCII and are never escaped, so `\（` contributes a literal backslash followed by a real full-width parenthesis.
- **`Break`**, and line terminators (U+000A, U+000D, U+2028, U+2029): run boundaries.
- **All other leaf nodes** (`Code`, `Image`, `Html`, …): **opaque**, each contributing one opaque placeholder. Source text, alt text, and URLs are not inspected.

### 3.2 Pairing

`(` and `（` are both opening parentheses; `)` and `）` are both closing.
Within a run, parentheses are matched with a stack regardless of width; nesting is supported and each pair is evaluated independently.
Unmatched parentheses are ignored.

### 3.3 CJK character class

A character matches the **base CJK class** if it is used in Japanese or Chinese text and does not normally appear in English.
Korean (Hangul) and Bopomofo are out of scope.

The class is defined by:

```js
/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}！-｠￠-￦]/u
```

`Script_Extensions` covers Han, Hiragana, and Katakana, including half-width katakana (U+FF66–FF9F) and shared CJK punctuation (`ー` `・` `々` `、` `。` etc.).
The literal ranges add full-width `Common` characters: U+FF01–FF60 (punctuation and alphanumerics) and U+FFE0–FFE6 (signs).
ASCII characters, `…` `–` `—`, and opaque placeholders (§3.1) are not in the base class.

A character counts as **CJK** iff it is in the base class and is not an in-scope parenthesis:

```js
const isCjk = (ch) => BASE_CJK.test(ch) && !"()（）".includes(ch);
```

This prevents full-width parentheses (within the `！-｠` range) from counting as CJK neighbors.

### 3.4 Inner content

A pair **has inner CJK** if any character between its opening and closing parenthesis satisfies `isCjk`; otherwise it **has no inner CJK**.

### 3.5 Outer neighbors

**Transparent characters**: U+0020, U+3000, U+0009, and U+00A0.
No other characters are transparent.

The **left neighbor** is the nearest non-transparent character before the opening parenthesis within the same run; the **right neighbor** is the nearest non-transparent character after the closing parenthesis.

The **outer state** of a pair:

- **outer CJK**: at least one neighbor is CJK.
- **outer non-CJK**: at least one neighbor exists, and none is CJK.
- **isolated**: neither side has a neighbor.

## 4. Decision

The `mode` option selects the policy.
`full` = `（）`, `half` = `()`, `either` = both widths accepted (§5.2).

### Mode `content` (default)

Inner content determines the target; the outer state is relevant only for pairs with no inner CJK.

| outer \ inner | inner CJK | no inner CJK |
| --- | --- | --- |
| outer CJK | full | either |
| outer non-CJK | full | half |
| isolated | full | half |

### Mode `context`

The outer state determines the target; inner content is relevant only for isolated pairs.

| outer \ inner | inner CJK | no inner CJK |
| --- | --- | --- |
| outer CJK | full | full |
| outer non-CJK | half | half |
| isolated | full | half |

## 5. Reporting and autofix

For `full` and `half`, each parenthesis in a pair is evaluated independently: a parenthesis whose width does not match is reported and fixed.
For `either`, the pair is evaluated as a unit (§5.2).
Spacing is adjusted only as part of a width fix and is never reported on its own.

### 5.1 Outer-side spacing

When a fix changes a parenthesis's width, the spacing on its **outer side** (left of an opening parenthesis, right of a closing parenthesis) is also adjusted, provided that side has a neighbor (§3.5).
A side with no neighbor is left unchanged.
Inner-side spacing is never modified.

- **To half-width**: if the fix would place the parenthesis directly adjacent to its neighbor, a single U+0020 space is inserted.
  Existing transparent characters between the parenthesis and its neighbor are preserved.
- **To full-width**: all transparent characters (§3.5) between the parenthesis and its neighbor are removed.

Exceptions to space insertion (to-half-width only):

- Before `(`: left neighbor has Unicode `General_Category` `Ps` (open punctuation) or `Pi` (initial quote).
- After `)`: right neighbor has `General_Category` `Pe` (close punctuation) or `Pf` (final quote), or is one of `. , ; : ! ?` or `…` (U+2026).
- Straight quotes `" '`: either side.

### 5.1.1 Escape preservation

A fix never turns a literal backslash into an escape.
When a parenthesis is set to half-width `(` or `)` and the source places an odd-length run of backslashes immediately before it, one backslash is prepended to the replacement.
This keeps the run even, so the literal backslash is preserved and the parenthesis remains a real (non-escaped) parenthesis rather than being silently opted out (§3.1).
For example, `version（2.0\）` is fixed to `version (2.0\\)`, not `version (2.0\)`.

### 5.2 The `either` cell

The `either` cell (mode `content`, outer CJK, no inner CJK) accepts any same-width pair: `(source)` or `（source）`.
A mixed-width pair is resolved to full-width: only the differing parenthesis is reported and fixed.

## 6. Examples

| Input | outer | inner | Mode `content` | Mode `context` |
| --- | --- | --- | --- | --- |
| `名称(めいしょう)` | CJK | CJK | `名称（めいしょう）` | `名称（めいしょう）` |
| `これはソース(source)です` | CJK | none | `これはソース(source)です` | `これはソース（source）です` |
| `これはソース（source)です` | CJK | none | `これはソース（source）です` | `これはソース（source）です` |
| `The kanji（漢字）means` | non-CJK | CJK | `The kanji（漢字）means` | `The kanji (漢字) means` |
| `version (2.0)` | non-CJK | none | `version (2.0)` | `version (2.0)` |
| `(注)` (alone) | isolated | CJK | `（注）` | `（注）` |
| `(123)` (alone) | isolated | none | `(123)` | `(123)` |
| `名称\(めいしょう\)` | excluded | excluded | accepted as is | accepted as is |
