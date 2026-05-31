# Introduction

## Project structure

- `src/`: The textlint rule itself (TypeScript).
- `test/`: Tests using `textlint-tester` (Mocha-based).
- `dist/`: Compiled JavaScript shipped as the npm package (gitignored).

## Work status and other development management

- See the `dev/` directory.
- Before reading from or writing to any subdirectory of `dev/`, first check `dev/AGENTS.md`.

## Tech stack

- Node.js (dev: v24+, support: v22+)
- TypeScript (v6+)
- `textlint` (v15+)
- Test runner: Mocha (because `textlint-tester` is Mocha-based)
- Package manager: pnpm

## TypeScript configuration

- `tsconfig.json`: project-wide type-checking, no emit.
- `tsconfig.build.json`: emits `dist/` from `src/` only.

## npm scripts

- `pnpm test`: Type-check (`tsc`) -> run Mocha tests.
- `pnpm run build`: Emit `dist/` for publishing.
- `pnpm run verify`: audit -> test -> build. Also run in CI.
- `pnpm run pack:dry-run`: Build, then show the contents of `npm pack`.

## Handling of temporary files

- Save temporary files created during work under the `tmp/` directory at the project root (gitignored).
  They do not need to be deleted afterward, but only place files there that may be deleted at any time.

## For Codex

- If any npm script fails inside the sandbox, ask the user for permission and re-run the same command outside the sandbox.
