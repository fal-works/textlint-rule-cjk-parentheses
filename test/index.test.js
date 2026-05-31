import assert from "node:assert/strict";
import TextLintTesterModule from "textlint-tester";
const TextLintTester = TextLintTesterModule.default ?? TextLintTesterModule;

import rule from "../src/index.js";

const FULLWIDTH_MESSAGE = "Use full-width parentheses （） here.";
const HALFWIDTH_MESSAGE = "Use half-width parentheses () here.";
const EITHER_WIDTH_MESSAGE = "Unify the parenthesis width to either full-width （） or half-width ().";

const NBSP = "\u00A0";

/** @param {string} message */
const e = (message) => ({ message });

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
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "(注)",
            output: "（注）",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "（123）",
            output: "(123)",
            errors: [e(HALFWIDTH_MESSAGE), e(HALFWIDTH_MESSAGE)],
        },
        {
            text: "これはソース（source)です",
            output: "これはソース（source）です",
            errors: [e(EITHER_WIDTH_MESSAGE)],
        },
        {
            text: "これはソース(source）です",
            output: "これはソース（source）です",
            errors: [e(EITHER_WIDTH_MESSAGE)],
        },
        {
            text: "名称 (めいしょう) です",
            output: "名称（めいしょう）です",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
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
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
        {
            text: "| 名称(めいしょう) |\n| --- |",
            output: "| 名称（めいしょう） |\n| --- |",
            errors: [e(FULLWIDTH_MESSAGE), e(FULLWIDTH_MESSAGE)],
        },
    ],
});

describe("options", () => {
    it("throws for an invalid mode", () => {
        const context = /** @type {any} */ ({});
        const options = /** @type {any} */ ({ mode: "cotnext" });

        assert.throws(
            () => rule.linter(context, options),
            /Invalid mode option: cotnext\. Expected "content" or "context"\./
        );
    });

    it("throws for a null mode", () => {
        const context = /** @type {any} */ ({});
        const options = /** @type {any} */ ({ mode: null });

        assert.throws(
            () => rule.linter(context, options),
            /Invalid mode option: null\. Expected "content" or "context"\./
        );
    });
});
