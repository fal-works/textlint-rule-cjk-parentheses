/**
 * @import { TextlintRuleContext, TextlintFixableRuleModule, TextlintRuleReportHandler } from "@textlint/types"
 * @import { TxtNode } from "@textlint/ast-node-types"
 */

const CJK_PATTERN = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

const OPEN_BRACKETS = new Set(["(", "（"]);
const CLOSE_BRACKETS = new Set([")", "）"]);

/**
 * @typedef {object} BracketPair
 * @property {number} openIndex - 開き括弧の仮想テキスト上の位置
 * @property {number} closeIndex - 閉じ括弧の仮想テキスト上の位置
 * @property {string} openChar - 実際の開き括弧文字
 * @property {string} closeChar - 実際の閉じ括弧文字
 * @property {string} inner - 括弧内のテキスト
 */

/**
 * 仮想テキスト中の括弧をスタックで対応付け、入れ子も含めて全ペアを返す。
 *
 * @param {string} text
 * @returns {BracketPair[]}
 */
function findBracketPairs(text) {
    /** @type {{ char: string, index: number }[]} */
    const stack = [];
    /** @type {BracketPair[]} */
    const pairs = [];

    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (OPEN_BRACKETS.has(ch)) {
            stack.push({ char: ch, index: i });
        } else if (CLOSE_BRACKETS.has(ch)) {
            const open = stack.pop();
            if (open === undefined) continue;
            pairs.push({
                openIndex: open.index,
                closeIndex: i,
                openChar: open.char,
                closeChar: ch,
                inner: text.slice(open.index + 1, i),
            });
        }
    }

    return pairs;
}

/**
 * ノードの子要素を返す。子を持たないノード（インラインコードなど）では空配列を返す。
 *
 * @param {TxtNode} node
 * @returns {readonly TxtNode[]}
 */
function childrenOf(node) {
    return /** @type {{ readonly children?: readonly TxtNode[] }} */ (node).children ?? [];
}

/**
 * DFS で子孫の Str ノードをすべて収集する。
 * Code（インラインコード）は children を持たないため自動的に除外される。
 *
 * @param {TxtNode} node
 * @param {TextlintRuleContext["Syntax"]} Syntax
 * @returns {TxtNode[]}
 */
function collectStrNodes(node, Syntax) {
    /** @type {TxtNode[]} */
    const results = [];
    /** @param {TxtNode} n */
    function dfs(n) {
        if (n.type === Syntax.Str) {
            results.push(n);
            return;
        }
        for (const child of childrenOf(n)) {
            dfs(child);
        }
    }
    dfs(node);
    return results;
}

/**
 * @typedef {object} VirtualPosition
 * @property {number} nodeIdx - 対応する Str ノードの strNodes 内インデックス
 * @property {number} indexInNode - そのノードのソース内 UTF-16 位置
 */

/**
 * Str ノードのテキストを連結して仮想テキストを構築し、
 * 各 UTF-16 code unit の位置からノード・ノード内位置へのマップを作る。
 *
 * getSource(node) を使うことで、fixer.replaceTextRange の相対 index と
 * 一致する（node.value はエスケープ文字等で raw ソースと乖離しうる）。
 *
 * @param {TxtNode[]} strNodes
 * @param {(node: TxtNode) => string} getSource
 * @returns {{ text: string, posMap: VirtualPosition[] }}
 */
function buildVirtualText(strNodes, getSource) {
    let text = "";
    /** @type {VirtualPosition[]} */
    const posMap = [];

    strNodes.forEach((node, nodeIdx) => {
        const src = getSource(node);
        for (let i = 0; i < src.length; i++) {
            posMap.push({ nodeIdx, indexInNode: i });
        }
        text += src;
    });

    return { text, posMap };
}

/**
 * @typedef {Pick<TextlintRuleContext, "report" | "RuleError" | "fixer" | "getSource" | "locator" | "Syntax">} RuleContextSubset
 */

/**
 * @param {TxtNode} node - Paragraph / Header / TableCell ノード
 * @param {RuleContextSubset} ctx
 */
function processInlineContainer(node, ctx) {
    const { report, RuleError, fixer, getSource, locator, Syntax } = ctx;

    const strNodes = collectStrNodes(node, Syntax);
    if (strNodes.length === 0) return;

    const { text, posMap } = buildVirtualText(strNodes, getSource);
    const pairs = findBracketPairs(text);

    /**
     * 仮想テキスト位置 `index` の括弧が `correctChar` でなければ報告・修正する。
     *
     * @param {number} index
     * @param {string} actualChar
     * @param {string} correctChar
     * @param {string} message
     */
    const reportBracket = (index, actualChar, correctChar, message) => {
        if (actualChar === correctChar) return;
        const pos = posMap[index];
        if (pos === undefined) return;
        const target = strNodes[pos.nodeIdx];
        if (target === undefined) return;
        report(
            target,
            new RuleError(message, {
                padding: locator.range([pos.indexInNode, pos.indexInNode + 1]),
                fix: fixer.replaceTextRange([pos.indexInNode, pos.indexInNode + 1], correctChar),
            })
        );
    };

    for (const { openIndex, closeIndex, openChar, closeChar, inner } of pairs) {
        const needsFullwidth = CJK_PATTERN.test(inner);
        const message = needsFullwidth
            ? "CJK文字を含む括弧は全角（）を使用してください"
            : "CJK文字を含まない括弧は半角()を使用してください";
        reportBracket(openIndex, openChar, needsFullwidth ? "（" : "(", message);
        reportBracket(closeIndex, closeChar, needsFullwidth ? "）" : ")", message);
    }
}

/**
 * @param {TextlintRuleContext} context
 * @returns {TextlintRuleReportHandler}
 */
const reporter = (context) => {
    const { Syntax, report, RuleError, fixer, getSource, locator } = context;
    /** @param {TxtNode} node */
    const process = (node) =>
        processInlineContainer(node, { report, RuleError, fixer, getSource, locator, Syntax });
    return {
        [Syntax.Paragraph]: process,
        [Syntax.Header]: process,
        [Syntax.TableCell]: process,
    };
};

/** @type {TextlintFixableRuleModule} */
export default { linter: reporter, fixer: reporter };
