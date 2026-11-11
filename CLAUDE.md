# Working rules

- Requirements live in `docs/URS.md`; design in `docs/ARCHITECTURE.md`.
- Before any code change: identify affected URS IDs. After: fill the Impact Assessment (URS §5) in the commit body, update the Traceability Matrix and requirement Status.
- New behaviour without a URS ID → add the requirement first.
- `packages/core` stays pure: no DOM, no Node built-ins.
- Type-specific logic lives only in `packages/core/src/diagrams/<type>/`. Layout, render, API and web never branch on diagram type.
- Prefer small single-purpose modules over large files. Keep code succinct.
- AI code lives only in `packages/ai`. Tests use the mock Claude client; never call the live API in CI.
- README images are generated (`pnpm docs:build`), never hand-made. Re-run after any render or type change.
- Every module has tests; layout/render changes update golden SVGs deliberately, never blindly.
