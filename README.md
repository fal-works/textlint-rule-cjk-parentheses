# textlint-rule-cjk-parentheses

括弧内に CJK 文字（ひらがな・カタカナ・漢字）が含まれる場合は全角括弧 `（）` を、それ以外の場合は半角括弧 `()` を使用することを要求する [textlint](https://textlint.github.io/) ルールです。

`--fix` に対応しています。

## インストール

```sh
npm install --save-dev textlint @fal-works/textlint-rule-cjk-parentheses
```

## 使い方

`.textlintrc.json`:

```json
{
  "rules": {
    "@fal-works/cjk-parentheses": true
  }
}
```

## ルール

| 入力 | 結果 | 理由 |
|------|------|------|
| `診断情報 (diagnostics) を出す` | OK | 半角・CJK なし |
| `そうです（ただし例外あり）。` | OK | 全角・CJK あり |
| `そうです(ただし例外あり)。` | Error | CJK あり → 全角 `（）` が必要 |
| `診断情報 （diagnostics） を出す` | Error | CJK なし → 半角 `()` が必要 |

### CJK 判定

括弧内テキストに `/[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u` がマッチするかで判定します。

- ひらがな・カタカナ・漢字を含む → 全角 `（）`
- それ以外（ASCII、数字、ギリシャ文字など）→ 半角 `()`

**インラインコードは内容に関わらず非 CJK として扱います。** `` `日本語` `` のように CJK 文字を含むコードスニペットであっても、括弧の種類の判定には影響しません。

```
（`日本語`）  →  Error → (`日本語`)  （インラインコードは非 CJK 扱い → 半角）
(`日本語`)    →  OK
```

**リンクはリンクテキストを判定対象に含めます。** URL 部分は判定に使いません。

```
([日本語](url))    →  Error → （[日本語](url)）
（[english](url)）  →  Error → ([english](url))
```

**画像は alt text を含めて判定対象にしません。** 画像は内容に関わらず非CJKとして扱います。

```
（![日本語](url)）  →  Error → (![日本語](url))
(![日本語](url))    →  OK
```

### 入れ子括弧

入れ子括弧はそれぞれ独立して判定されます。Markdown の強調（`**`）などの inline 要素をまたぐ括弧も検出・修正の対象です。

```
（テスト (test) 結果）  →  OK（外：CJK あり → 全角、内：CJK なし → 半角）
(テスト (inner) 結果)  →  外だけ Error → （テスト (inner) 結果）

（**abc**）    →  Error → (**abc**)   （括弧内に CJK なし → 半角）
(**日本語**)  →  Error → （**日本語**）（括弧内に CJK あり → 全角）
```

## 対象括弧

`(` (U+0028) / `)` (U+0029) および `（` (U+FF08) / `）` (U+FF09) のみが対象です。`[`、`【`、`「` などは対象外です。
