# Repository Guidelines

## Project Structure & Module Organization
TypeScript sources live in `src/`, with `src/index.ts` bootstrapping Slack Bolt, services in `src/services/`, Google API wrappers in `src/google/`, Slack views in `src/slack/`, and helpers in `src/utils/`. Compiled output lands in `dist/`. Infrastructure lives in `infra/`, and setup/debug references are under `docs/`. Place new modules beside related code and export them explicitly for clarity.

## Build, Test, and Development Commands
- `npm install` — install Node.js dependencies (Node 18+ required).
- `npm run dev` — run the Socket Mode bot via `ts-node-dev`, enabling hot reloads against your Slack workspace.
- `npm run build` — compile TypeScript with strict settings into `dist/`.
- `npm start` — execute the compiled bundle; use this to mirror production behavior.
If you add scripts, document them and confirm Terraform startup (see `infra/`) still succeeds.

## Coding Style & Naming Conventions
We write strict TypeScript (see `tsconfig.json`). Prefer two-space indentation, single quotes, and trailing semicolons. Use PascalCase for classes (`ExpenseService`), camelCase for functions and variables, and SCREAMING_SNAKE_CASE for invariants. Re-export shared utilities through index files when a module exposes multiple helpers. Run `npm run build` before submitting to catch type regressions; introduce linting or formatting tools only when configured and documented.

## Testing Guidelines
Automated tests are not yet in place; validate flows with `npm run dev`, exercising shortcuts, receipt uploads, and `/expense-complete` in a staging workspace. When introducing complex logic, add matching unit or integration tests (Vitest or Jest are acceptable once configured) and document execution steps. Capture manual verification tips in `docs/debug-commands.md`.

## Commit & Pull Request Guidelines
Follow the conventional-commit pattern in history (`fix(slack): …`, `docs: …`). Keep subjects under 80 characters and explain behavior changes in the body when non-trivial. Pull requests should summarize the problem, link issues, and include screenshots or Slack transcript snippets when workflows shift. Confirm `.env` secrets stay local, flag Terraform updates (`infra/`), and note Slack or Google configuration impacts.

### Additional Rule (日本語コミットメッセージ)
コミットメッセージは **日本語で記述** してください。  
英語の conventional-commit prefix（例：`feat:`, `fix:`, `docs:` など）はそのまま使用し、  
サブジェクトと本文の内容のみ日本語にします。

## Security & Configuration Tips
Secrets belong in `.env` or Secret Manager per `docs/setup.md`; never hard-code tokens. When modifying Drive or Sheets scopes, mirror changes in `infra/terraform.tf` and outline migrations. Log only high-level identifiers—avoid raw PII—and rely on `src/logger.ts` for structured logging.
