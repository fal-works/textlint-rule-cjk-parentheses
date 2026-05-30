import TextLintTesterModule from "textlint-tester";
const TextLintTester = TextLintTesterModule.default ?? TextLintTesterModule;

import rule from "../src/index.js";

const CJK_FULL = "CJK文字を含む括弧は全角（）を使用してください";
const ASCII_HALF = "CJK文字を含まない括弧は半角()を使用してください";

// エラーオブジェクトのヘルパー
/** @param {string} msg */
const e = (msg) => ({ message: msg });

const tester = new TextLintTester();

tester.run("cjk-parentheses", rule, {
    // ================================================================
    // VALID: 正しい括弧（エラーなし）
    // ================================================================
    valid: [
        // ── プレーンテキスト ─────────────────────────────────────────
        // 半角・CJK なし
        "診断情報 (diagnostics) を出す",
        "エラーコード (123) を確認",
        "(β)",          // Greek は非 CJK → 半角 ✓
        "()",            // 空括弧 ✓
        // 全角・CJK あり
        "そうです（ただし例外あり）。",
        "課題多数（issue が3件）あり",  // 漢字1文字でも CJK あり

        // ── 構造パターン ─────────────────────────────────────────────
        "（テスト (test) 結果）",        // 入れ子・各ペア独立で正しい
        "(abc)(def)",                    // 連続・同型（半角）
        "（あ）（い）",                    // 連続・同型（全角）
        // 対象外の括弧・括弧なし
        "テキストのみ",
        "[abc]",
        "【あ】",
        "「い」",

        // ── Markdown inline 要素 ─────────────────────────────────────
        //
        // 判定ルール:
        //   Str children あり（Strong / Emphasis / Delete / Link）
        //     → 仮想テキストに含まれ CJK 判定の対象
        //   Str children なし（Code / Image）
        //     → 仮想テキストに含まれず、内容問わず非 CJK 扱い
        //
        // Strong（**）─ Str children あり
        "（**日本語**）",      // CJK あり → 全角 ✓
        "(**english**)",       // CJK なし → 半角 ✓
        // Emphasis（*）─ 同上
        "（*日本語*）",
        "(*english*)",
        // Delete（~~）─ 同上
        "（~~日本語~~）",
        "(~~english~~)",
        // Code（`）─ Str children なし → 内容問わず非 CJK 扱い → 半角のみ OK
        "(`日本語`)",          // CJK コードも非 CJK 扱い → 半角 ✓
        "(`abc`)",
        // Link（[text](url)）─ リンクテキストの Str で判定 / URL は対象外
        "（[日本語](url)）",   // リンクテキストに CJK → 全角 ✓
        "([english](url))",    // リンクテキストに CJK なし → 半角 ✓
        // Image（![alt](url)）─ alt は Str children なし → 非 CJK 扱い → 半角のみ OK
        "(![日本語](url))",    // alt は非 CJK 扱い → 半角 ✓
        "(![abc](url))",
        // 複合（複数の inline 要素が混在）
        "（**日本語** and `code`）",  // CJK あり（Strong）→ 全角 ✓
        "(**english** and `code`)",   // CJK なし → 半角 ✓

        // ── BMP外文字（サロゲートペア）───────────────────────────────
        "（😀日本語）",   // 😀 + CJK → 全角 ✓
        "(😀abc)",         // 😀 + 非 CJK → 半角 ✓
    ],

    // ================================================================
    // INVALID: 誤った括弧（エラーあり）
    // ================================================================
    //
    // 各ケースで両括弧とも誤りの場合: エラー2件（open + close、position 昇順）
    // 片方のみ誤りの場合: エラー1件
    //
    invalid: [
        // ── プレーンテキスト ─────────────────────────────────────────
        // 半角 → 全角（CJK あり）
        {
            text: "そうです(ただし例外あり)。",
            output: "そうです（ただし例外あり）。",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        {
            text: "(issue が3件)",
            output: "（issue が3件）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // 全角 → 半角（CJK なし）
        {
            text: "診断情報 （diagnostics） を出す",
            output: "診断情報 (diagnostics) を出す",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        {
            text: "（123）",
            output: "(123)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        {
            text: "（）",       // 空括弧は CJK なし
            output: "()",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        {
            text: "（β）",     // Greek は非 CJK
            output: "(β)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // 混在括弧（開閉で種類が違う）
        {
            text: "(日本語）",
            output: "（日本語）",
            errors: [e(CJK_FULL)],        // open のみ誤り
        },
        {
            text: "（ascii)",
            output: "(ascii)",
            errors: [e(ASCII_HALF)],      // open のみ誤り
        },

        // ── 構造パターン ─────────────────────────────────────────────
        // 入れ子（外側のみ誤り）
        {
            text: "(テスト (inner) 結果)",
            output: "（テスト (inner) 結果）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // 入れ子（外側・内側ともに誤り）
        // position 昇順: outer-open(0) → inner-open(4) → inner-close(10) → outer-close(14)
        {
            text: "(日本語（inner）テスト)",
            output: "（日本語(inner)テスト）",
            errors: [
                e(CJK_FULL),    // outer open  at 0
                e(ASCII_HALF),  // inner open  at 4
                e(ASCII_HALF),  // inner close at 10
                e(CJK_FULL),    // outer close at 14
            ],
        },
        // 連続（片方のみ誤り）
        {
            text: "(あ)(def)",
            output: "（あ）(def)",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // 連続（両方誤り）
        // position 昇順: 1st-open(0) → 1st-close(4) → 2nd-open(5) → 2nd-close(9)
        {
            text: "（abc）（def）",
            output: "(abc)(def)",
            errors: [e(ASCII_HALF), e(ASCII_HALF), e(ASCII_HALF), e(ASCII_HALF)],
        },

        // ── Markdown inline 要素 ─────────────────────────────────────
        // Strong（**）─ 半角 → 全角
        {
            text: "(**日本語**)",
            output: "（**日本語**）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // Strong（**）─ 全角 → 半角
        {
            text: "（**english**）",
            output: "(**english**)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // Emphasis（*）─ 半角 → 全角
        {
            text: "(*日本語*)",
            output: "（*日本語*）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // Emphasis（*）─ 全角 → 半角
        {
            text: "（*english*）",
            output: "(*english*)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // Delete（~~）─ 半角 → 全角
        {
            text: "(~~日本語~~)",
            output: "（~~日本語~~）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // Delete（~~）─ 全角 → 半角
        {
            text: "（~~english~~）",
            output: "(~~english~~)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // Code（`）─ 内容問わず非 CJK 扱い → 全角は常に誤り
        {
            text: "（`日本語`）",
            output: "(`日本語`)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        {
            text: "（`abc`）",
            output: "(`abc`)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // Link（[text](url)）─ リンクテキストで判定
        {
            text: "([日本語](url))",
            output: "（[日本語](url)）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        {
            text: "（[english](url)）",
            output: "([english](url))",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // Image（![alt](url)）─ alt は非 CJK 扱い → 全角は常に誤り
        {
            text: "（![日本語](url)）",
            output: "(![日本語](url))",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        {
            text: "（![abc](url)）",
            output: "(![abc](url))",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },
        // 複合 inline（Strong に CJK + Code）─ CJK あり → 全角が正しい
        {
            text: "(*日本語* and `code`)",
            output: "（*日本語* and `code`）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // 複合 inline（Strong に CJK なし + Code）─ CJK なし → 半角が正しい
        {
            text: "（**english** and `code`）",
            output: "(**english** and `code`)",
            errors: [e(ASCII_HALF), e(ASCII_HALF)],
        },

        // ── BMP外文字（サロゲートペア）───────────────────────────────
        // 😀 は U+1F600、UTF-16 で 2 code units
        {
            text: "(😀日本語)",
            output: "（😀日本語）",
            errors: [e(CJK_FULL), e(CJK_FULL)],
        },
        // 入れ子あり: position 昇順 outer-open(0)→inner-open(3)→inner-close(7)→outer-close(8)
        {
            text: "（😀（abc））",
            output: "(😀(abc))",
            errors: [e(ASCII_HALF), e(ASCII_HALF), e(ASCII_HALF), e(ASCII_HALF)],
        },
    ],
});
