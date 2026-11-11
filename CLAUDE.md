# Working rules

- Requirements live in `docs/URS.md`; design in `docs/ARCHITECTURE.md`.
- Before any code change: identify affected URS IDs. After: fill the Impact Assessment (URS §5) in the commit body, update the Traceability Matrix and requirement Status.
- New behaviour without a URS ID → add the requirement first.
- `packages/core` stays pure: no DOM, no Node built-ins.
- Type-specific logic lives only in `packages/core/src/types/<type>/`. Layout, render, API and web never branch on diagram type.
- Prefer small single-purpose modules over large files. Keep code succinct.
- Every module has tests; layout/render changes update golden SVGs deliberately, never blindly.
