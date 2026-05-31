# Introduction

## Project structure

- `src/`: The textlint rule itself, also included in the npm package.
- `test/`: Tests using `textlint-tester` (Mocha-based).

## Work status and other development management

- See the `dev/` directory.
- Before reading from or writing to any subdirectory of `dev/`, first check `dev/AGENTS.md`.

## Tech stack

- Node.js (dev: v24+, support: v22+)
- TypeScript (v6+) (type-checking JS via JSDoc + `checkJs`)
- `textlint` (v15+)
- Test runner: Mocha (because `textlint-tester` is Mocha-based)
- Package manager: pnpm

## npm scripts

- `pnpm test`: Type-check (`tsc`) -> run Mocha tests.
- `pnpm run verify`: `pnpm audit` -> `pnpm test`.
- `pnpm run pack:dry-run`: A manual pre-publish command that shows the contents of `npm pack`.

## Handling of temporary files

- Save temporary files created during work under the `tmp/` directory at the project root (gitignored).
  They do not need to be deleted afterward, but only place files there that may be deleted at any time.

## For Codex

- If any npm script fails inside the sandbox, ask the user for permission and re-run the same command outside the sandbox.
