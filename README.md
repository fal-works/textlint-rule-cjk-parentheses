# textlint-rule-cjk-parentheses

A [textlint](https://textlint.github.io/) rule that normalizes round parentheses to full-width `（）` or half-width `()` based on the parenthesized content and the surrounding context.
Supports `--fix`.

## Examples

The default `content` mode prioritizes whether the parenthesized content contains CJK characters.

| Input | Result |
| --- | --- |
| `名称(めいしょう)` | `名称（めいしょう）` |
| `(注)` | `（注）` |
| `version（2.0）` | `version (2.0)` |
| `これはソース(source)です` | accepted as is |

The `context` mode prioritizes the immediate neighbors outside the parentheses.

| Input | Result |
| --- | --- |
| `これはソース(source)です` | `これはソース（source）です` |
| `The kanji（漢字）means` | `The kanji (漢字) means` |

## Installation

```sh
pnpm add -D textlint @fal-works/textlint-rule-cjk-parentheses
```

Requires textlint v15 or later.

## Usage

`.textlintrc.json`:

```json
{
  "rules": {
    "@fal-works/cjk-parentheses": true
  }
}
```

The `mode` option accepts `content` (default) or `context`.

```json
{
  "rules": {
    "@fal-works/cjk-parentheses": {
      "mode": "context"
    }
  }
}
```

## Specification

For the decision policy, the definition of CJK characters, the target scope, and the autofix details, see [`docs/rule-spec.md`](docs/rule-spec.md).
