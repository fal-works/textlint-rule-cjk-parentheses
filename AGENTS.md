# Introduction

## プロジェクト概要

- 丸括弧の全角・半角を内容に応じて統一する textlint ルール
- 括弧内に CJK 文字（ひらがな・カタカナ・漢字）を含む場合は全角 `（）`、含まない場合は半角 `()` を要求する

## プロジェクト構成

- `src/`: textlint rule 本体。npm パッケージに含まれる実装コードは `src/` のみ
- `test/`: `textlint-tester`（Mocha ベース）によるテスト

## 作業状況やその他の開発管理

- `dev/` ディレクトリを参照
- `dev/` のサブディレクトリの読み書きを行う際は、まず `dev/AGENTS.md` を確認すること

## 技術スタック

- Node.js (dev: v24+, support: v22+)
- TypeScript (v6+)（JSDoc + `checkJs` による JS の型チェック）
- `textlint` (v15+)
- テストランナー: Mocha（`textlint-tester` が Mocha ベースのため）
- パッケージマネージャー: pnpm

## npm scripts

- `pnpm test`: 型チェック（`tsc`）-> Mocha テスト実行
- `pnpm run verify`: `pnpm audit` -> `pnpm test`。CI および公開前の決定的な品質確認用
- `pnpm run pack:dry-run`: npm pack の内容を表示する公開前の手動確認用コマンド

## 一時ファイルの運用

- 作業過程で一時的に作成するファイルはプロジェクトルート下の `tmp/` ディレクトリ（gitignore対象）に保存する。
  作業後の削除は不要だが、いつ削除されてもよいものを配置すること。

## For Codex

- `pnpm run verify`、`pnpm run prepublishOnly`、`pnpm run pack:dry-run` がsandbox内で失敗した場合は、ユーザーに許可を求めて同じコマンドをsandbox外で再実行すること。
