import assert from "node:assert/strict";
import TextLintTesterModule from "textlint-tester";

import rule from "../src/index.ts";

const TextLintTester = TextLintTesterModule.default ?? TextLintTesterModule;

const FULLWIDTH_MESSAGE = "Use full-width parentheses （） here.";
const HALFWIDTH_MESSAGE = "Use half-width parentheses () here.";
const EITHER_WIDTH_MESSAGE = "Unify the parenthesis width to either full-width （） or half-width ().";
const SPACING_MESSAGE = "Adjust the spacing around this parenthesis.";

const NBSP = "\u00A0";

interface ErrorPosition {
    line?: number;
    column?: number;
    range?: [number, number];
}

/**
 * Builds an expected error entry. When `position` is provided, the listed fields are asserted
 * in addition to the message. `textlint-tester` only checks the fields present on the expected
 * error object, so omitting `position` keeps a message-only assertion.
 */
const e = (message: string, position?: ErrorPosition) => ({ message, ...position });

const tester = new TextLintTester();

tester.run("cjk-parentheses", rule, {
    valid: [
        "名称（めいしょう）",
        "これはソース(source)です",
        "これはソース（source）です",
        "The kanji（漢字）means",
        "version (2.0)",
        "（注）",
        "(123)",
        "（ＡＢＣ）",
        "（ｶﾀｶﾅ）",
        "（テスト (test) 結果）",
        "（**日本語**）",
        "(**english**)",
        "（[日本語](https://example.com/(path))）",
        "([english](https://example.com/日本語))",
        "(![日本語](image.png))",
        "(`日本語`)",
        "(日本語\n)",
        "名称\\(めいしょう\\)",
        // A backslash before a half-width parenthesis escapes it, so the pair is excluded.
        "名称\\(めいしょう\\) と \\(text\\)",
        // An escaped backslash before an already-correct pair leaves nothing to fix.
        "文字\\\\（漢字）",
        {
            text: "これはソース（source）です",
            options: { mode: "context" },
        },
        {
            text: "The kanji (漢字) means",
            options: { mode: "context" },
        },
        {
            text: "（注）",
            options: { mode: "context" },
        },
        {
            text: "(123)",
            options: { mode: "context" },
        },
    ],
    invalid: [
        {
            text: "名称(めいしょう)",
            output: "名称（めいしょう）",
            errors: [
                e(FULLWIDTH_MESSAGE, { line: 1, column: 3, range: [2, 3] }),
                e(FULLWIDTH_MESSAGE, { line: 1, column: 9, range: [8, 9] }),
            ],
        },
        {
            text: "(注)",
            output: "（注）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "（123）",
            output: "(123)",
            errors: [
                e(HALFWIDTH_MESSAGE, { line: 1, column: 1, range: [0, 1] }),
                e(HALFWIDTH_MESSAGE, { line: 1, column: 5, range: [4, 5] }),
            ],
        },
        {
            text: "これはソース（source)です",
            output: "これはソース（source）です",
            errors: [e(EITHER_WIDTH_MESSAGE, { line: 1, column: 14, range: [13, 14] })],
        },
        {
            text: "これはソース(source）です",
            output: "これはソース（source）です",
            errors: [e(EITHER_WIDTH_MESSAGE)],
        },
        {
            // The fix rewrites the surrounding spaces, but each error must still be
            // reported at the parenthesis itself, not at the wider fix range.
            text: "名称 (めいしょう) です",
            output: "名称（めいしょう）です",
            errors: [
                e(FULLWIDTH_MESSAGE, { line: 1, column: 4, range: [3, 4] }),
                e(FULLWIDTH_MESSAGE, { line: 1, column: 10, range: [9, 10] }),
            ],
        },
        {
            text: "名称　(めいしょう)\tです",
            output: "名称（めいしょう）です",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: `名称${NBSP}(めいしょう)${NBSP}です`,
            output: "名称（めいしょう）です",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "version（2.0）",
            output: "version (2.0)",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: '"（漢字）"',
            output: '"(漢字)"',
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "[（漢字）means",
            output: "[(漢字) means",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "“（漢字）”",
            output: "“(漢字)”",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "The kanji（漢字）…",
            output: "The kanji (漢字)…",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "The kanji（漢字）.",
            output: "The kanji (漢字).",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "これはソース(source)です",
            output: "これはソース（source）です",
            options: { mode: "context" },
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "The kanji（漢字）means",
            output: "The kanji (漢字) means",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "The kanji （漢字） means",
            output: "The kanji (漢字) means",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "（テスト (test) 結果）",
            output: "（テスト（test）結果）",
            options: { mode: "context" },
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "A（漢字）（注）B",
            output: "A (漢字) (注) B",
            options: { mode: "context" },
            errors: [
                e(HALFWIDTH_MESSAGE),
                e(HALFWIDTH_MESSAGE),
                e(HALFWIDTH_MESSAGE),
                e(HALFWIDTH_MESSAGE),
            ],
        },
        {
            text: "あ (x) (y) い",
            output: "あ（x）（y）い",
            options: { mode: "context" },
            errors: [
                e(FULLWIDTH_MESSAGE),
                e(FULLWIDTH_MESSAGE),
                e(FULLWIDTH_MESSAGE),
                e(FULLWIDTH_MESSAGE),
            ],
        },
        {
            text: "(**日本語**)",
            output: "（**日本語**）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "（**english**）",
            output: "(**english**)",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "([日本語](https://example.com/(path)))",
            output: "（[日本語](https://example.com/(path))）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "（[english](https://example.com/日本語)）",
            output: "([english](https://example.com/日本語))",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "（![日本語](image.png)）",
            output: "(![日本語](image.png))",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "（`日本語`）",
            output: "(`日本語`)",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "# 名称(めいしょう)",
            output: "# 名称（めいしょう）",
            errors: [
                e(FULLWIDTH_MESSAGE, { line: 1, column: 5, range: [4, 5] }),
                e(FULLWIDTH_MESSAGE, { line: 1, column: 11, range: [10, 11] }),
            ],
        },
        {
            text: "| 名称(めいしょう) |\n| --- |",
            output: "| 名称（めいしょう） |\n| --- |",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            // The parentheses follow an emphasis node, so their reported source
            // positions must account for the `**` markup that the virtual run drops.
            text: "The **kanji**（漢字）means",
            output: "The **kanji** (漢字) means",
            options: { mode: "context" },
            errors: [
                e(HALFWIDTH_MESSAGE, { line: 1, column: 14, range: [13, 14] }),
                e(HALFWIDTH_MESSAGE, { line: 1, column: 17, range: [16, 17] }),
            ],
        },
        {
            // Reports in a later block must carry the absolute line and range.
            text: "1行目\n\n名称(めいしょう)",
            output: "1行目\n\n名称（めいしょう）",
            errors: [
                e(FULLWIDTH_MESSAGE, { line: 3, column: 3, range: [7, 8] }),
                e(FULLWIDTH_MESSAGE, { line: 3, column: 9, range: [13, 14] }),
            ],
        },
        {
            text: "名称\\(めいしょう\\) と 名称(めいしょう)",
            output: "名称\\(めいしょう\\) と 名称（めいしょう）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            // `\\` is an escaped backslash, so the following `(` is a real parenthesis,
            // not an escaped one: the pair is normalized rather than excluded.
            text: "名称\\\\(めいしょう\\\\)",
            output: "名称\\\\（めいしょう\\\\）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            // A backslash never escapes a full-width parenthesis (it is not ASCII), so `（）`
            // are real parentheses and are normalized.
            text: "version\\（2.0\\）",
            output: "version\\ (2.0\\\\)",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            // The literal backslash before the closing parenthesis must survive the fix: writing
            // a bare `\)` would escape the parenthesis (opting it out) and erase the backslash.
            text: "version（2.0\\）",
            output: "version (2.0\\\\)",
            errors: [
                e(HALFWIDTH_MESSAGE, { line: 1, column: 8, range: [7, 8] }),
                e(HALFWIDTH_MESSAGE, { line: 1, column: 13, range: [12, 13] }),
            ],
        },
        {
            // Whole-pair normalization: only `（` has the wrong width, but the fix also adds the
            // missing space after the already-half `)` so the pair ends up consistently spaced.
            text: "version（2.0)text",
            output: "version (2.0) text",
            errors: [
                e(HALFWIDTH_MESSAGE, { line: 1, column: 8, range: [7, 8] }),
                e(SPACING_MESSAGE, { line: 1, column: 12, range: [11, 12] }),
            ],
        },
        {
            text: "The kanji（漢字)means",
            output: "The kanji (漢字) means",
            options: { mode: "context" },
            errors: [e(HALFWIDTH_MESSAGE), e(SPACING_MESSAGE)],
        },
        {
            // Adjacent pairs: the space between `)` and `（` is inserted once, owned by the
            // closing side, even though that closing parenthesis only needs a spacing fix.
            text: "A（漢字)（注)B",
            output: "A (漢字) (注) B",
            options: { mode: "context" },
            errors: [
                e(HALFWIDTH_MESSAGE),
                e(SPACING_MESSAGE),
                e(HALFWIDTH_MESSAGE),
                e(SPACING_MESSAGE),
            ],
        },
    ],
});

describe("options", () => {
    it("throws for an invalid mode", () => {
        const context = {} as never;
        const options = { mode: "cotnext" } as never;

        assert.throws(
            () => rule.linter(context, options),
            /Invalid mode option: cotnext\. Expected "content" or "context"\./
        );
    });

    it("throws for a null mode", () => {
        const context = {} as never;
        const options = { mode: null } as never;

        assert.throws(
            () => rule.linter(context, options),
            /Invalid mode option: null\. Expected "content" or "context"\./
        );
    });
});
