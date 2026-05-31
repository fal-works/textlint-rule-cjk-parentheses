# textlint-rule-cjk-parentheses

丸括弧の全角 `（）`・半角 `()` を、括弧の内容と周辺の文脈に応じて統一する [textlint](https://textlint.github.io/) ルールです。
`--fix` に対応しています。

## 例

既定の `content` モードは、括弧内の CJK 文字の有無を優先します。

| 入力 | 結果 |
| --- | --- |
| `名称(めいしょう)` | `名称（めいしょう）` |
| `(注)` | `（注）` |
| `version（2.0）` | `version (2.0)` |
| `これはソース(source)です` | そのまま許容 |

`context` モードは、括弧の外側の近傍を優先します。

| 入力 | 結果 |
| --- | --- |
| `これはソース(source)です` | `これはソース（source）です` |
| `The kanji（漢字）means` | `The kanji (漢字) means` |

## インストール

```sh
pnpm add -D textlint @fal-works/textlint-rule-cjk-parentheses
```

textlint v15 以上に対応しています。

## 使い方

`.textlintrc.json`:

```json
{
  "rules": {
    "@fal-works/cjk-parentheses": true
  }
}
```

`mode` には `content`（既定）または `context` を指定できます。

```json
{
  "rules": {
    "@fal-works/cjk-parentheses": {
      "mode": "context"
    }
  }
}
```

## 仕様

判定方針・CJK 文字の定義・対象範囲・自動修正の詳細は [`docs/rule-spec.md`](docs/rule-spec.md) を参照してください。
