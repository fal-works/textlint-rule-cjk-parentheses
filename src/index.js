/**
 * @import {
 *   TextlintFixableRuleModule,
 *   TextlintRuleContext,
 *   TextlintRuleContextFixCommand,
 *   TextlintRuleReportHandler,
 * } from "@textlint/types"
 * @import { TxtNode } from "@textlint/ast-node-types"
 */

/** @typedef {"content" | "context"} RuleMode */

/**
 * @typedef {object} RuleOptions
 * @property {RuleMode} [mode]
 */

/** @typedef {"full" | "half" | "either"} WidthDecision */

/**
 * @typedef {object} SourceRange
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef {object} SourceEdit
 * @property {number} start
 * @property {number} end
 * @property {string} text
 */

/**
 * @typedef {object} VirtualChar
 * @property {number} id
 * @property {string} char
 * @property {number} sourceStart
 * @property {number} sourceEnd
 * @property {readonly SourceRange[]} ancestors
 */

/** @typedef {VirtualChar[]} VirtualRun */

/**
 * @typedef {object} IndexedVirtualChar
 * @property {VirtualChar} token
 * @property {number} index
 */

/**
 * @typedef {object} ParenthesisPair
 * @property {VirtualRun} run
 * @property {number} openIndex
 * @property {number} closeIndex
 * @property {VirtualChar} open
 * @property {VirtualChar} close
 */

/**
 * @typedef {object} PendingReport
 * @property {VirtualChar} token
 * @property {string} message
 * @property {TextlintRuleContextFixCommand} fix
 */

/**
 * @typedef {Pick<
 *   TextlintRuleContext,
 *   "Syntax" | "RuleError" | "fixer" | "getSource" | "locator" | "report"
 * >} RuleContextSubset
 */

const BASE_CJK_PATTERN = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}！-｠￠-￦]/u;
const OPENING_SPACE_EXCEPTION_PATTERN = /[\p{gc=Ps}\p{gc=Pi}]/u;
const CLOSING_SPACE_EXCEPTION_PATTERN = /[\p{gc=Pe}\p{gc=Pf}]/u;

const OPAQUE_PLACEHOLDER = "\uFFFC";
const FULLWIDTH_OPEN = "（";
const FULLWIDTH_CLOSE = "）";
const HALFWIDTH_OPEN = "(";
const HALFWIDTH_CLOSE = ")";

const FULLWIDTH_MESSAGE = "Use full-width parentheses （） here.";
const HALFWIDTH_MESSAGE = "Use half-width parentheses () here.";
const EITHER_WIDTH_MESSAGE = "Unify the parenthesis width to either full-width （） or half-width ().";

/** @type {ReadonlySet<string>} */
const TRANSPARENT_CHARS = new Set([" ", "\u3000", "\t", "\u00A0"]);

/** @type {ReadonlySet<string>} */
const CLOSING_HALF_SPACE_EXCEPTION_CHARS = new Set([".", ",", ";", ":", "!", "?", "…"]);

/**
 * @param {RuleOptions | undefined} options
 * @returns {RuleMode}
 */
function normalizeMode(options) {
    const mode = options?.mode === undefined ? "content" : options.mode;
    if (mode === "content" || mode === "context") return mode;

    throw new Error(`Invalid mode option: ${String(mode)}. Expected "content" or "context".`);
}

/**
 * @param {TxtNode} node
 * @returns {readonly TxtNode[]}
 */
function childrenOf(node) {
    return /** @type {{ readonly children?: readonly TxtNode[] }} */ (node).children ?? [];
}

/**
 * @param {TxtNode} node
 * @returns {SourceRange}
 */
function rangeOf(node) {
    return { start: node.range[0], end: node.range[1] };
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isRunBoundary(char) {
    return char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029";
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isTransparent(char) {
    return TRANSPARENT_CHARS.has(char);
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isOpeningParenthesis(char) {
    return char === HALFWIDTH_OPEN || char === FULLWIDTH_OPEN;
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isClosingParenthesis(char) {
    return char === HALFWIDTH_CLOSE || char === FULLWIDTH_CLOSE;
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isInScopeParenthesis(char) {
    return isOpeningParenthesis(char) || isClosingParenthesis(char);
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isCjk(char) {
    return BASE_CJK_PATTERN.test(char) && !isInScopeParenthesis(char);
}

/**
 * @param {string} char
 * @returns {"full" | "half"}
 */
function parenthesisWidth(char) {
    return char === FULLWIDTH_OPEN || char === FULLWIDTH_CLOSE ? "full" : "half";
}

/**
 * @param {VirtualChar} token
 * @param {"full" | "half"} width
 * @returns {string}
 */
function targetParenthesis(token, width) {
    if (isOpeningParenthesis(token.char)) {
        return width === "full" ? FULLWIDTH_OPEN : HALFWIDTH_OPEN;
    }
    return width === "full" ? FULLWIDTH_CLOSE : HALFWIDTH_CLOSE;
}

/**
 * @param {string} char
 * @returns {boolean}
 */
function isStraightQuote(char) {
    return char === '"' || char === "'";
}

/**
 * @param {string} leftNeighbor
 * @returns {boolean}
 */
function shouldOmitSpaceBeforeHalfWidthOpening(leftNeighbor) {
    return isStraightQuote(leftNeighbor) || OPENING_SPACE_EXCEPTION_PATTERN.test(leftNeighbor);
}

/**
 * @param {string} rightNeighbor
 * @returns {boolean}
 */
function shouldOmitSpaceAfterHalfWidthClosing(rightNeighbor) {
    return (
        isStraightQuote(rightNeighbor) ||
        CLOSING_SPACE_EXCEPTION_PATTERN.test(rightNeighbor) ||
        CLOSING_HALF_SPACE_EXCEPTION_CHARS.has(rightNeighbor)
    );
}

/**
 * @param {TxtNode} block
 * @param {RuleContextSubset} context
 * @returns {VirtualRun[]}
 */
function buildRuns(block, context) {
    const { Syntax, getSource } = context;
    /** @type {VirtualRun[]} */
    const runs = [[]];
    let nextId = 0;

    /**
     * @returns {VirtualRun}
     */
    function currentRun() {
        const run = runs[runs.length - 1];
        if (run === undefined) {
            throw new Error("Expected at least one virtual run.");
        }
        return run;
    }

    function splitRun() {
        if (currentRun().length > 0) {
            runs.push([]);
        }
    }

    /**
     * @param {string} char
     * @param {number} sourceStart
     * @param {number} sourceEnd
     * @param {readonly SourceRange[]} ancestors
     */
    function appendToken(char, sourceStart, sourceEnd, ancestors) {
        currentRun().push({
            id: nextId,
            char,
            sourceStart,
            sourceEnd,
            ancestors,
        });
        nextId += 1;
    }

    /**
     * @param {TxtNode} node
     * @param {readonly SourceRange[]} ancestors
     */
    function visit(node, ancestors) {
        if (node.type === Syntax.Str) {
            const source = getSource(node);
            let sourceIndex = node.range[0];
            for (const char of source) {
                const sourceEnd = sourceIndex + char.length;
                if (isRunBoundary(char)) {
                    splitRun();
                } else {
                    appendToken(char, sourceIndex, sourceEnd, ancestors);
                }
                sourceIndex = sourceEnd;
            }
            return;
        }

        if (node.type === Syntax.Break) {
            splitRun();
            return;
        }

        const children = childrenOf(node);
        if (children.length > 0) {
            const nextAncestors = node === block ? ancestors : [...ancestors, rangeOf(node)];
            for (const child of children) {
                visit(child, nextAncestors);
            }
            return;
        }

        const { start, end } = rangeOf(node);
        appendToken(OPAQUE_PLACEHOLDER, start, end, ancestors);
    }

    visit(block, []);
    return runs.filter((run) => run.length > 0);
}

/**
 * @param {VirtualRun} run
 * @returns {ParenthesisPair[]}
 */
function findPairs(run) {
    /** @type {number[]} */
    const stack = [];
    /** @type {ParenthesisPair[]} */
    const pairs = [];

    for (let index = 0; index < run.length; index += 1) {
        const token = run[index];
        if (token === undefined) continue;

        if (isOpeningParenthesis(token.char)) {
            stack.push(index);
            continue;
        }

        if (!isClosingParenthesis(token.char)) continue;

        const openIndex = stack.pop();
        if (openIndex === undefined) continue;

        const open = run[openIndex];
        if (open === undefined) continue;

        pairs.push({
            run,
            openIndex,
            closeIndex: index,
            open,
            close: token,
        });
    }

    return pairs;
}

/**
 * @param {VirtualRun} run
 * @param {number} index
 * @returns {IndexedVirtualChar | undefined}
 */
function findLeftNeighbor(run, index) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const token = run[cursor];
        if (token !== undefined && !isTransparent(token.char)) {
            return { token, index: cursor };
        }
    }
    return undefined;
}

/**
 * @param {VirtualRun} run
 * @param {number} index
 * @returns {IndexedVirtualChar | undefined}
 */
function findRightNeighbor(run, index) {
    for (let cursor = index + 1; cursor < run.length; cursor += 1) {
        const token = run[cursor];
        if (token !== undefined && !isTransparent(token.char)) {
            return { token, index: cursor };
        }
    }
    return undefined;
}

/**
 * @param {VirtualRun} run
 * @param {number} start
 * @param {number} end
 * @returns {VirtualChar[]}
 */
function transparentTokensBetween(run, start, end) {
    const result = [];
    for (let index = start; index < end; index += 1) {
        const token = run[index];
        if (token !== undefined && isTransparent(token.char)) {
            result.push(token);
        }
    }
    return result;
}

/**
 * @param {readonly VirtualChar[]} tokens
 * @returns {SourceEdit[]}
 */
function createDeletionEdits(tokens) {
    return tokens.map((token) => ({ start: token.sourceStart, end: token.sourceEnd, text: "" }));
}

/**
 * @param {ParenthesisPair} pair
 * @returns {boolean}
 */
function hasInnerCjk(pair) {
    for (let index = pair.openIndex + 1; index < pair.closeIndex; index += 1) {
        const token = pair.run[index];
        if (token !== undefined && isCjk(token.char)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {ParenthesisPair} pair
 * @returns {"cjk" | "non-cjk" | "isolated"}
 */
function outerState(pair) {
    const left = findLeftNeighbor(pair.run, pair.openIndex);
    const right = findRightNeighbor(pair.run, pair.closeIndex);

    if (left !== undefined && isCjk(left.token.char)) return "cjk";
    if (right !== undefined && isCjk(right.token.char)) return "cjk";
    if (left !== undefined || right !== undefined) return "non-cjk";
    return "isolated";
}

/**
 * @param {RuleMode} mode
 * @param {boolean} innerCjk
 * @param {"cjk" | "non-cjk" | "isolated"} outer
 * @returns {WidthDecision}
 */
function decideWidth(mode, innerCjk, outer) {
    if (mode === "context") {
        if (outer === "cjk") return "full";
        if (outer === "non-cjk") return "half";
        return innerCjk ? "full" : "half";
    }

    if (innerCjk) return "full";
    if (outer === "cjk") return "either";
    return "half";
}

/**
 * @param {string} source
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @param {SourceEdit[]} edits
 * @returns {string | undefined}
 */
function applyEditsToSourceSlice(source, rangeStart, rangeEnd, edits) {
    let cursor = rangeStart;
    let result = "";
    const sortedEdits = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);

    for (const edit of sortedEdits) {
        if (
            edit.start < rangeStart ||
            edit.end > rangeEnd ||
            edit.start < cursor ||
            edit.end < edit.start
        ) {
            return undefined;
        }
        result += source.slice(cursor, edit.start);
        result += edit.text;
        cursor = edit.end;
    }

    result += source.slice(cursor, rangeEnd);
    return result;
}

/**
 * @param {VirtualChar} left
 * @param {VirtualChar} right
 * @returns {number}
 */
function insertionPointBetween(left, right) {
    let afterLeftSyntax = left.sourceEnd;
    for (const range of left.ancestors) {
        if (range.end > afterLeftSyntax && range.end <= right.sourceStart) {
            afterLeftSyntax = range.end;
        }
    }

    let beforeRightSyntax = right.sourceStart;
    for (const range of right.ancestors) {
        if (range.start >= left.sourceEnd && range.start < beforeRightSyntax) {
            beforeRightSyntax = range.start;
        }
    }

    if (afterLeftSyntax <= beforeRightSyntax) {
        return beforeRightSyntax;
    }
    return right.sourceStart;
}

/**
 * @param {VirtualRun} run
 * @param {number} closeIndex
 * @param {string} targetChar
 * @returns {boolean}
 */
function closingSideWillAdjust(run, closeIndex, targetChar) {
    const right = findRightNeighbor(run, closeIndex);
    if (right === undefined) return false;

    const transparent = transparentTokensBetween(run, closeIndex + 1, right.index);

    if (targetChar === FULLWIDTH_CLOSE) {
        return transparent.length > 0;
    }

    if (targetChar === HALFWIDTH_CLOSE) {
        return (
            transparent.length === 0 &&
            !shouldOmitSpaceAfterHalfWidthClosing(right.token.char)
        );
    }

    return false;
}

/**
 * The gap between a closing parenthesis and the next opening parenthesis is owned by the
 * closing side to avoid producing duplicate insertions or overlapping removals.
 *
 * @param {VirtualRun} run
 * @param {IndexedVirtualChar} left
 * @param {ReadonlyMap<number, string>} targetByTokenId
 * @returns {boolean}
 */
function shouldSkipOpeningSideAdjustment(run, left, targetByTokenId) {
    if (!isClosingParenthesis(left.token.char)) return false;

    const targetChar = targetByTokenId.get(left.token.id);
    if (targetChar === undefined || targetChar === left.token.char) return false;

    return closingSideWillAdjust(run, left.index, targetChar);
}

/**
 * @param {TxtNode} block
 * @param {readonly [number, number]} absoluteRange
 * @returns {readonly [number, number]}
 */
function relativeToBlock(block, absoluteRange) {
    const blockStart = block.range[0];
    return [absoluteRange[0] - blockStart, absoluteRange[1] - blockStart];
}

/**
 * @typedef {object} SideAdjustment
 * @property {number} rangeStart
 * @property {number} rangeEnd
 * @property {string} replacement
 */

/**
 * Computes the outer-side spacing adjustment for a single parenthesis whose width is being
 * changed to `targetChar`. The opening and closing sides are mirror images: the opening side
 * looks left and the closing side looks right, but the spacing policy is identical.
 *
 * @param {object} params
 * @param {VirtualRun} params.run
 * @param {number} params.tokenIndex
 * @param {VirtualChar} params.token
 * @param {IndexedVirtualChar} params.neighbor
 * @param {boolean} params.isOpening
 * @param {string} params.targetChar
 * @param {string} params.source
 * @returns {SideAdjustment | undefined}
 */
function outerSideAdjustment({ run, tokenIndex, token, neighbor, isOpening, targetChar, source }) {
    const transparent = isOpening
        ? transparentTokensBetween(run, neighbor.index + 1, tokenIndex)
        : transparentTokensBetween(run, tokenIndex + 1, neighbor.index);
    const parenEdit = { start: token.sourceStart, end: token.sourceEnd, text: targetChar };

    if (parenthesisWidth(targetChar) === "full") {
        if (transparent.length === 0) return undefined;
        const sliceStart = isOpening ? neighbor.token.sourceEnd : token.sourceStart;
        const sliceEnd = isOpening ? token.sourceEnd : neighbor.token.sourceStart;
        const replacement = applyEditsToSourceSlice(source, sliceStart, sliceEnd, [
            parenEdit,
            ...createDeletionEdits(transparent),
        ]);
        if (replacement === undefined) return undefined;
        return { rangeStart: sliceStart, rangeEnd: sliceEnd, replacement };
    }

    const omitSpace = isOpening
        ? shouldOmitSpaceBeforeHalfWidthOpening(neighbor.token.char)
        : shouldOmitSpaceAfterHalfWidthClosing(neighbor.token.char);
    if (transparent.length > 0 || omitSpace) return undefined;

    if (isOpening) {
        const insertionPoint = insertionPointBetween(neighbor.token, token);
        if (insertionPoint > token.sourceStart) return undefined;
        return {
            rangeStart: insertionPoint,
            rangeEnd: token.sourceEnd,
            replacement: ` ${source.slice(insertionPoint, token.sourceStart)}${targetChar}`,
        };
    }

    const insertionPoint = insertionPointBetween(token, neighbor.token);
    if (insertionPoint < token.sourceEnd) return undefined;
    return {
        rangeStart: token.sourceStart,
        rangeEnd: insertionPoint,
        replacement: `${targetChar}${source.slice(token.sourceEnd, insertionPoint)} `,
    };
}

/**
 * @param {object} params
 * @param {TxtNode} params.block
 * @param {VirtualRun} params.run
 * @param {number} params.tokenIndex
 * @param {VirtualChar} params.token
 * @param {string} params.targetChar
 * @param {string} params.source
 * @param {TextlintRuleContext["fixer"]} params.fixer
 * @param {ReadonlyMap<number, string>} params.targetByTokenId
 * @returns {TextlintRuleContextFixCommand}
 */
function createFix({ block, run, tokenIndex, token, targetChar, source, fixer, targetByTokenId }) {
    const isOpening = isOpeningParenthesis(token.char);
    const neighbor = isOpening
        ? findLeftNeighbor(run, tokenIndex)
        : findRightNeighbor(run, tokenIndex);

    const skipOuterSide =
        isOpening &&
        neighbor !== undefined &&
        shouldSkipOpeningSideAdjustment(run, neighbor, targetByTokenId);

    const adjustment =
        neighbor === undefined || skipOuterSide
            ? undefined
            : outerSideAdjustment({ run, tokenIndex, token, neighbor, isOpening, targetChar, source });

    const { rangeStart, rangeEnd, replacement } = adjustment ?? {
        rangeStart: token.sourceStart,
        rangeEnd: token.sourceEnd,
        replacement: targetChar,
    };

    return fixer.replaceTextRange(relativeToBlock(block, [rangeStart, rangeEnd]), replacement);
}

/**
 * @param {object} params
 * @param {ParenthesisPair} params.pair
 * @param {WidthDecision} params.decision
 * @param {ReadonlyMap<number, string>} params.targetByTokenId
 * @param {TxtNode} params.block
 * @param {RuleContextSubset} params.context
 * @param {string} params.source
 * @returns {PendingReport[]}
 */
function createReportsForPair({ pair, decision, targetByTokenId, block, context, source }) {
    const { fixer } = context;
    /** @type {PendingReport[]} */
    const reports = [];

    /**
     * @param {VirtualChar} token
     * @param {number} tokenIndex
     * @param {string} targetChar
     * @param {string} message
     */
    function addReport(token, tokenIndex, targetChar, message) {
        if (token.char === targetChar) return;
        reports.push({
            token,
            message,
            fix: createFix({
                block,
                run: pair.run,
                tokenIndex,
                token,
                targetChar,
                source,
                fixer,
                targetByTokenId,
            }),
        });
    }

    if (decision === "either") {
        if (parenthesisWidth(pair.open.char) === parenthesisWidth(pair.close.char)) {
            return reports;
        }
        addReport(pair.open, pair.openIndex, FULLWIDTH_OPEN, EITHER_WIDTH_MESSAGE);
        addReport(pair.close, pair.closeIndex, FULLWIDTH_CLOSE, EITHER_WIDTH_MESSAGE);
        return reports;
    }

    const targetWidth = decision;
    const message = targetWidth === "full" ? FULLWIDTH_MESSAGE : HALFWIDTH_MESSAGE;
    addReport(pair.open, pair.openIndex, targetParenthesis(pair.open, targetWidth), message);
    addReport(pair.close, pair.closeIndex, targetParenthesis(pair.close, targetWidth), message);
    return reports;
}

/**
 * @param {TxtNode} block
 * @param {RuleContextSubset} context
 * @param {RuleMode} mode
 */
function processBlock(block, context, mode) {
    const { RuleError, locator, report, getSource } = context;
    const source = getSource();
    const runs = buildRuns(block, context);
    const pairs = runs.flatMap((run) => findPairs(run));
    /** @type {Map<number, string>} */
    const targetByTokenId = new Map();
    /** @type {{ pair: ParenthesisPair, decision: WidthDecision }[]} */
    const decisions = [];

    for (const pair of pairs) {
        const decision = decideWidth(mode, hasInnerCjk(pair), outerState(pair));
        decisions.push({ pair, decision });

        if (decision === "either") {
            if (parenthesisWidth(pair.open.char) !== parenthesisWidth(pair.close.char)) {
                targetByTokenId.set(pair.open.id, FULLWIDTH_OPEN);
                targetByTokenId.set(pair.close.id, FULLWIDTH_CLOSE);
            }
            continue;
        }

        targetByTokenId.set(pair.open.id, targetParenthesis(pair.open, decision));
        targetByTokenId.set(pair.close.id, targetParenthesis(pair.close, decision));
    }

    const reports = decisions.flatMap(({ pair, decision }) =>
        createReportsForPair({ pair, decision, targetByTokenId, block, context, source })
    );

    reports.sort((a, b) => a.token.sourceStart - b.token.sourceStart);

    for (const pending of reports) {
        report(
            block,
            new RuleError(pending.message, {
                padding: locator.range(relativeToBlock(block, [pending.token.sourceStart, pending.token.sourceEnd])),
                fix: pending.fix,
            })
        );
    }
}

/**
 * @param {TextlintRuleContext} context
 * @param {RuleOptions} [options]
 * @returns {TextlintRuleReportHandler}
 */
const reporter = (context, options) => {
    const mode = normalizeMode(options);
    const { Syntax, report, RuleError, fixer, getSource, locator } = context;
    /** @type {RuleContextSubset} */
    const contextSubset = { Syntax, report, RuleError, fixer, getSource, locator };

    /** @param {TxtNode} node */
    const process = (node) => {
        processBlock(node, contextSubset, mode);
    };

    return {
        [Syntax.Paragraph]: process,
        [Syntax.Header]: process,
        [Syntax.TableCell]: process,
    };
};

/** @type {TextlintFixableRuleModule<RuleOptions>} */
export default { linter: reporter, fixer: reporter };
