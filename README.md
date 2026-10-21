# Siteline (handoff)

This folder holds the spec for Siteline, before any code exists. Claude Code builds the app here, milestone by milestone.

- `docs/PRD.md`: the full product spec (MVP, web).
- `CLAUDE.md`: stack, conventions and how Siteline fits into this workspace.

## Kickoff prompt for M0

Start Claude Code in the workspace root (`ngxns-workspace`) and paste this prompt:

```text
Read apps/siteline/CLAUDE.md and apps/siteline/docs/PRD.md. We're starting milestone M0.
1. Propose the setup inside apps/siteline (how it registers in the root angular.json,
   tsconfig and npm workspaces) and a step-by-step plan for M0, and list any decisions
   you need from me.
2. Wait for my go-ahead, then build M0.
3. Use the Firebase Emulator Suite only. Don't deploy anything.
```

For later milestones, use: "Build milestone M1 from the PRD. Start with the data model and rules tests, then the functions, then the UI. Run all tests before you finish."

## Before you start

- **Design reference.** Save screenshots of the two landing pages (renovation and Visits) to `docs/design/`. Claude Code can't open the private artifact links.
- **Accounts.** The things you set up yourself are listed in PRD section 15 under "Accounts and keys to set up yourself". M0 needs only the emulators.
- **Product name.** Settle it before buying domains (PRD section 16).
