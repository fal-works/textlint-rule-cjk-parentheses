import type { TxtNode } from "@textlint/ast-node-types";
import type {
    TextlintFixableRuleModule,
    TextlintRuleContext,
    TextlintRuleContextFixCommand,
    TextlintRuleReportHandler,
} from "@textlint/types";

type RuleMode = "content" | "context";

interface RuleOptions {
    mode?: RuleMode;
}

type ParenthesisWidth = "full" | "half";

type WidthDecision = ParenthesisWidth | "either";

type OuterState = "cjk" | "non-cjk" | "isolated";

interface SourceRange {
    start: number;
    end: number;
}

interface SourceEdit {
    start: number;
    end: number;
    text: string;
}

interface VirtualChar {
    id: number;
    char: string;
    sourceStart: number;
    sourceEnd: number;
    ancestors: readonly SourceRange[];
}

type VirtualRun = VirtualChar[];

interface IndexedVirtualChar {
    token: VirtualChar;
    index: number;
}

interface ParenthesisPair {
    run: VirtualRun;
    openIndex: number;
    closeIndex: number;
    open: VirtualChar;
    close: VirtualChar;
}

interface PendingReport {
    token: VirtualChar;
    message: string;
    fix: TextlintRuleContextFixCommand;
}

type RuleContextSubset = Pick<
    TextlintRuleContext,
    "Syntax" | "RuleError" | "fixer" | "getSource" | "locator" | "report"
>;

const BASE_CJK_PATTERN = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}！-｠￠-￦]/u;
const OPENING_SPACE_EXCEPTION_PATTERN = /[\p{gc=Ps}\p{gc=Pi}]/u;
const CLOSING_SPACE_EXCEPTION_PATTERN = /[\p{gc=Pe}\p{gc=Pf}]/u;

/** Characters a CommonMark backslash escape may target: the ASCII punctuation set. */
const ESCAPABLE_PATTERN = /[!-\/:-@[-`{-~]/;

const OPAQUE_PLACEHOLDER = "\uFFFC";
const FULLWIDTH_OPEN = "（";
const FULLWIDTH_CLOSE = "）";
const HALFWIDTH_OPEN = "(";
const HALFWIDTH_CLOSE = ")";

const FULLWIDTH_MESSAGE = "Use full-width parentheses （） here.";
const HALFWIDTH_MESSAGE = "Use half-width parentheses () here.";
const EITHER_WIDTH_MESSAGE = "Unify the parenthesis width to either full-width （） or half-width ().";
const SPACING_MESSAGE = "Adjust the spacing around this parenthesis.";

const TRANSPARENT_CHARS: ReadonlySet<string> = new Set([" ", "\u3000", "\t", "\u00A0"]);

const CLOSING_HALF_SPACE_EXCEPTION_CHARS: ReadonlySet<string> = new Set([
    ".",
    ",",
    ";",
    ":",
    "!",
    "?",
    "…",
]);

function normalizeMode(options: RuleOptions | undefined): RuleMode {
    const mode = options?.mode === undefined ? "content" : options.mode;
    if (mode === "content" || mode === "context") return mode;

    throw new Error(`Invalid mode option: ${String(mode)}. Expected "content" or "context".`);
}

function childrenOf(node: TxtNode): readonly TxtNode[] {
    return (node as { readonly children?: readonly TxtNode[] }).children ?? [];
}

function rangeOf(node: TxtNode): SourceRange {
    return { start: node.range[0], end: node.range[1] };
}

function isRunBoundary(char: string): boolean {
    return char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029";
}

function nextCodePoint(source: string, index: number): string | undefined {
    if (index >= source.length) return undefined;
    const codePoint = source.codePointAt(index);
    return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function isTransparent(char: string): boolean {
    return TRANSPARENT_CHARS.has(char);
}

function isOpeningParenthesis(char: string): boolean {
    return char === HALFWIDTH_OPEN || char === FULLWIDTH_OPEN;
}

function isClosingParenthesis(char: string): boolean {
    return char === HALFWIDTH_CLOSE || char === FULLWIDTH_CLOSE;
}

function isInScopeParenthesis(char: string): boolean {
    return isOpeningParenthesis(char) || isClosingParenthesis(char);
}

function isCjk(char: string): boolean {
    return BASE_CJK_PATTERN.test(char) && !isInScopeParenthesis(char);
}

function parenthesisWidth(char: string): ParenthesisWidth {
    return char === FULLWIDTH_OPEN || char === FULLWIDTH_CLOSE ? "full" : "half";
}

function targetParenthesis(token: VirtualChar, width: ParenthesisWidth): string {
    if (isOpeningParenthesis(token.char)) {
        return width === "full" ? FULLWIDTH_OPEN : HALFWIDTH_OPEN;
    }
    return width === "full" ? FULLWIDTH_CLOSE : HALFWIDTH_CLOSE;
}

function isStraightQuote(char: string): boolean {
    return char === '"' || char === "'";
}

function shouldOmitSpaceBeforeHalfWidthOpening(leftNeighbor: string): boolean {
    return isStraightQuote(leftNeighbor) || OPENING_SPACE_EXCEPTION_PATTERN.test(leftNeighbor);
}

function shouldOmitSpaceAfterHalfWidthClosing(rightNeighbor: string): boolean {
    return (
        isStraightQuote(rightNeighbor) ||
        CLOSING_SPACE_EXCEPTION_PATTERN.test(rightNeighbor) ||
        CLOSING_HALF_SPACE_EXCEPTION_CHARS.has(rightNeighbor)
    );
}

function buildRuns(block: TxtNode, context: RuleContextSubset): VirtualRun[] {
    const { Syntax, getSource } = context;
    const runs: VirtualRun[] = [[]];
    let nextId = 0;

    function currentRun(): VirtualRun {
        const run = runs[runs.length - 1];
        if (run === undefined) {
            throw new Error("Expected at least one virtual run.");
        }
        return run;
    }

    function splitRun(): void {
        if (currentRun().length > 0) {
            runs.push([]);
        }
    }

    function appendToken(
        char: string,
        sourceStart: number,
        sourceEnd: number,
        ancestors: readonly SourceRange[]
    ): void {
        currentRun().push({
            id: nextId,
            char,
            sourceStart,
            sourceEnd,
            ancestors,
        });
        nextId += 1;
    }

    function visit(node: TxtNode, ancestors: readonly SourceRange[]): void {
        if (node.type === Syntax.Str) {
            const source = getSource(node);
            let localIndex = 0;
            while (localIndex < source.length) {
                const char = nextCodePoint(source, localIndex);
                if (char === undefined) break;

                const sourceStart = node.range[0] + localIndex;
                const sourceEnd = sourceStart + char.length;

                if (char === "\\") {
                    const escaped = nextCodePoint(source, localIndex + char.length);
                    if (escaped !== undefined && ESCAPABLE_PATTERN.test(escaped)) {
                        const escapedEnd = sourceEnd + escaped.length;
                        if (isInScopeParenthesis(escaped)) {
                            // An escaped target parenthesis is the author's opt-out:
                            // the two-character span is protected from pairing and fixing.
                            appendToken(OPAQUE_PLACEHOLDER, sourceStart, escapedEnd, ancestors);
                        } else {
                            // Any other escape (including `\\`) consumes the backslash and
                            // contributes the single literal character it denotes, so the
                            // escaped character cannot itself begin a new escape.
                            appendToken(escaped, sourceStart, escapedEnd, ancestors);
                        }
                        localIndex += char.length + escaped.length;
                        continue;
                    }
                    // A backslash that escapes nothing is an ordinary character.
                    appendToken("\\", sourceStart, sourceEnd, ancestors);
                    localIndex += char.length;
                    continue;
                }

                if (isRunBoundary(char)) {
                    splitRun();
                } else {
                    appendToken(char, sourceStart, sourceEnd, ancestors);
                }
                localIndex += char.length;
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

function findPairs(run: VirtualRun): ParenthesisPair[] {
    const stack: number[] = [];
    const pairs: ParenthesisPair[] = [];

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

function findLeftNeighbor(run: VirtualRun, index: number): IndexedVirtualChar | undefined {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const token = run[cursor];
        if (token !== undefined && !isTransparent(token.char)) {
            return { token, index: cursor };
        }
    }
    return undefined;
}

function findRightNeighbor(run: VirtualRun, index: number): IndexedVirtualChar | undefined {
    for (let cursor = index + 1; cursor < run.length; cursor += 1) {
        const token = run[cursor];
        if (token !== undefined && !isTransparent(token.char)) {
            return { token, index: cursor };
        }
    }
    return undefined;
}

function transparentTokensBetween(run: VirtualRun, start: number, end: number): VirtualChar[] {
    const result: VirtualChar[] = [];
    for (let index = start; index < end; index += 1) {
        const token = run[index];
        if (token !== undefined && isTransparent(token.char)) {
            result.push(token);
        }
    }
    return result;
}

function createDeletionEdits(tokens: readonly VirtualChar[]): SourceEdit[] {
    return tokens.map((token) => ({ start: token.sourceStart, end: token.sourceEnd, text: "" }));
}

function hasInnerCjk(pair: ParenthesisPair): boolean {
    for (let index = pair.openIndex + 1; index < pair.closeIndex; index += 1) {
        const token = pair.run[index];
        if (token !== undefined && isCjk(token.char)) {
            return true;
        }
    }
    return false;
}

function outerState(pair: ParenthesisPair): OuterState {
    const left = findLeftNeighbor(pair.run, pair.openIndex);
    const right = findRightNeighbor(pair.run, pair.closeIndex);

    if (left !== undefined && isCjk(left.token.char)) return "cjk";
    if (right !== undefined && isCjk(right.token.char)) return "cjk";
    if (left !== undefined || right !== undefined) return "non-cjk";
    return "isolated";
}

function decideWidth(mode: RuleMode, innerCjk: boolean, outer: OuterState): WidthDecision {
    if (mode === "context") {
        if (outer === "cjk") return "full";
        if (outer === "non-cjk") return "half";
        return innerCjk ? "full" : "half";
    }

    if (innerCjk) return "full";
    if (outer === "cjk") return "either";
    return "half";
}

function applyEditsToSourceSlice(
    source: string,
    rangeStart: number,
    rangeEnd: number,
    edits: SourceEdit[]
): string | undefined {
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

function insertionPointBetween(left: VirtualChar, right: VirtualChar): number {
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

function closingSideWillAdjust(run: VirtualRun, closeIndex: number, targetChar: string): boolean {
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
 * `targetByTokenId` holds an entry only for parentheses belonging to a rewritten pair, so a
 * missing entry means the closing neighbor's pair is left untouched and will not adjust the gap.
 */
function shouldSkipOpeningSideAdjustment(
    run: VirtualRun,
    left: IndexedVirtualChar,
    targetByTokenId: ReadonlyMap<number, string>
): boolean {
    if (!isClosingParenthesis(left.token.char)) return false;

    const targetChar = targetByTokenId.get(left.token.id);
    if (targetChar === undefined) return false;

    return closingSideWillAdjust(run, left.index, targetChar);
}

function relativeToBlock(
    block: TxtNode,
    absoluteRange: readonly [number, number]
): readonly [number, number] {
    const blockStart = block.range[0];
    return [absoluteRange[0] - blockStart, absoluteRange[1] - blockStart];
}

interface SideAdjustment {
    rangeStart: number;
    rangeEnd: number;
    replacement: string;
}

interface OuterSideAdjustmentParams {
    run: VirtualRun;
    tokenIndex: number;
    token: VirtualChar;
    neighbor: IndexedVirtualChar;
    isOpening: boolean;
    targetChar: string;
    source: string;
}

/**
 * Computes the outer-side spacing adjustment for a single parenthesis whose canonical width is
 * `targetChar` (which may equal its current width when only the spacing needs to change). The
 * opening and closing sides are mirror images: the opening side looks left and the closing side
 * looks right, but the spacing policy is identical.
 */
function outerSideAdjustment({
    run,
    tokenIndex,
    token,
    neighbor,
    isOpening,
    targetChar,
    source,
}: OuterSideAdjustmentParams): SideAdjustment | undefined {
    const transparent = isOpening
        ? transparentTokensBetween(run, neighbor.index + 1, tokenIndex)
        : transparentTokensBetween(run, tokenIndex + 1, neighbor.index);
    const parenEdit: SourceEdit = { start: token.sourceStart, end: token.sourceEnd, text: targetChar };

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

interface CreateFixParams {
    block: TxtNode;
    run: VirtualRun;
    tokenIndex: number;
    token: VirtualChar;
    targetChar: string;
    source: string;
    fixer: TextlintRuleContext["fixer"];
    targetByTokenId: ReadonlyMap<number, string>;
}

interface CreatedFix {
    command: TextlintRuleContextFixCommand;
    /** Whether the fix changes outer-side spacing in addition to (or instead of) the width. */
    adjustsSpacing: boolean;
}

/** Whether the source holds an odd-length run of backslashes ending immediately before `index`. */
function precededByOddBackslashRun(source: string, index: number): boolean {
    let count = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
        count += 1;
    }
    return count % 2 === 1;
}

/**
 * Guards a fix against accidentally escaping the parenthesis it writes. When the replacement
 * starts with a half-width `(`/`)` placed directly after an odd backslash run, one more backslash
 * is prepended so the run stays even: the literal backslash is preserved and the parenthesis
 * remains a real, non-escaped one.
 */
function guardAgainstEscape(replacement: string, source: string, rangeStart: number): string {
    const firstChar = replacement[0];
    if (firstChar !== HALFWIDTH_OPEN && firstChar !== HALFWIDTH_CLOSE) return replacement;
    if (!precededByOddBackslashRun(source, rangeStart)) return replacement;
    return `\\${replacement}`;
}

function createFix({
    block,
    run,
    tokenIndex,
    token,
    targetChar,
    source,
    fixer,
    targetByTokenId,
}: CreateFixParams): CreatedFix {
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

    const guardedReplacement = guardAgainstEscape(replacement, source, rangeStart);

    return {
        command: fixer.replaceTextRange(relativeToBlock(block, [rangeStart, rangeEnd]), guardedReplacement),
        adjustsSpacing: adjustment !== undefined,
    };
}

interface PairTargets {
    openTarget: string;
    closeTarget: string;
    /** The diagnostic message used when a parenthesis must change width. */
    widthMessage: string;
}

/**
 * Resolves the canonical characters both parentheses of a pair should take under `decision`,
 * or `undefined` when the pair is already acceptable as written (the `either` cell with a pair
 * that is already uniform in width).
 */
function resolveTargets(pair: ParenthesisPair, decision: WidthDecision): PairTargets | undefined {
    if (decision === "either") {
        if (parenthesisWidth(pair.open.char) === parenthesisWidth(pair.close.char)) {
            return undefined;
        }
        return {
            openTarget: FULLWIDTH_OPEN,
            closeTarget: FULLWIDTH_CLOSE,
            widthMessage: EITHER_WIDTH_MESSAGE,
        };
    }

    return {
        openTarget: targetParenthesis(pair.open, decision),
        closeTarget: targetParenthesis(pair.close, decision),
        widthMessage: decision === "full" ? FULLWIDTH_MESSAGE : HALFWIDTH_MESSAGE,
    };
}

function isPairRewritten(pair: ParenthesisPair, targets: PairTargets): boolean {
    return pair.open.char !== targets.openTarget || pair.close.char !== targets.closeTarget;
}

interface CreateReportsForPairParams {
    pair: ParenthesisPair;
    decision: WidthDecision;
    targetByTokenId: ReadonlyMap<number, string>;
    block: TxtNode;
    context: RuleContextSubset;
    source: string;
}

/**
 * A pair is normalized as a unit: when any of its parentheses changes width, the whole pair is
 * brought to its canonical form, including outer-side spacing on both sides. A parenthesis is
 * reported either because its width is wrong (width message) or, when the pair is being rewritten
 * anyway, because only its outer spacing needs adjusting (spacing message). A pair whose widths
 * are already correct is never touched, so spacing is never reported on its own.
 */
function createReportsForPair({
    pair,
    decision,
    targetByTokenId,
    block,
    context,
    source,
}: CreateReportsForPairParams): PendingReport[] {
    const { fixer } = context;

    const targets = resolveTargets(pair, decision);
    if (targets === undefined || !isPairRewritten(pair, targets)) return [];

    const members = [
        { token: pair.open, tokenIndex: pair.openIndex, targetChar: targets.openTarget },
        { token: pair.close, tokenIndex: pair.closeIndex, targetChar: targets.closeTarget },
    ];

    const reports: PendingReport[] = [];
    for (const { token, tokenIndex, targetChar } of members) {
        const { command, adjustsSpacing } = createFix({
            block,
            run: pair.run,
            tokenIndex,
            token,
            targetChar,
            source,
            fixer,
            targetByTokenId,
        });

        if (token.char !== targetChar) {
            reports.push({ token, message: targets.widthMessage, fix: command });
        } else if (adjustsSpacing) {
            reports.push({ token, message: SPACING_MESSAGE, fix: command });
        }
    }
    return reports;
}

function processBlock(block: TxtNode, context: RuleContextSubset, mode: RuleMode): void {
    const { RuleError, locator, report, getSource } = context;
    const source = getSource();
    const runs = buildRuns(block, context);
    const pairs = runs.flatMap((run) => findPairs(run));
    const targetByTokenId = new Map<number, string>();
    const decisions: { pair: ParenthesisPair; decision: WidthDecision }[] = [];

    for (const pair of pairs) {
        const decision = decideWidth(mode, hasInnerCjk(pair), outerState(pair));
        decisions.push({ pair, decision });

        const targets = resolveTargets(pair, decision);
        if (targets === undefined || !isPairRewritten(pair, targets)) continue;

        targetByTokenId.set(pair.open.id, targets.openTarget);
        targetByTokenId.set(pair.close.id, targets.closeTarget);
    }

    const reports = decisions.flatMap(({ pair, decision }) =>
        createReportsForPair({ pair, decision, targetByTokenId, block, context, source })
    );

    reports.sort((a, b) => a.token.sourceStart - b.token.sourceStart);

    for (const pending of reports) {
        report(
            block,
            new RuleError(pending.message, {
                padding: locator.range(
                    relativeToBlock(block, [pending.token.sourceStart, pending.token.sourceEnd])
                ),
                fix: pending.fix,
            })
        );
    }
}

const reporter = (
    context: TextlintRuleContext,
    options?: RuleOptions
): TextlintRuleReportHandler => {
    const mode = normalizeMode(options);
    const { Syntax, report, RuleError, fixer, getSource, locator } = context;
    const contextSubset: RuleContextSubset = { Syntax, report, RuleError, fixer, getSource, locator };

    const process = (node: TxtNode): void => {
        processBlock(node, contextSubset, mode);
    };

    return {
        [Syntax.Paragraph]: process,
        [Syntax.Header]: process,
        [Syntax.TableCell]: process,
    };
};

const rule: TextlintFixableRuleModule<RuleOptions> = { linter: reporter, fixer: reporter };

export default rule;
