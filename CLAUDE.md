# Siteline

Client project feeds for service businesses: renovation firms run projects, and recurring home services (tutors, gardeners) send a report after each visit. The spec is `docs/PRD.md`: read the relevant sections before any feature work.

## Where this lives

Siteline is built inside the `ngxns-workspace` monorepo, in `apps/siteline/`. The workspace also holds NativeScript apps, samples and the `@ngxns/*` plugin libraries. Leave those alone.

- **Angular project.** Register Siteline in the root `angular.json` as the project `siteline`, using the same pattern as `my-app`: the `@angular/build:application` builder, `@angular/build:dev-server`, `@angular/build:unit-test` (Vitest) and the root `eslint.config.mjs`. Add its tsconfig files to the `references` in the root `tsconfig.json`.
- **Don't use `npm run app:create`.** It generates NativeScript apps, and Siteline is web only for now.
- **Dependencies.** The root `package.json` uses npm workspaces.
  - Shared Angular packages are declared as `*` in member manifests and pinned through root `overrides` (`$package`).
  - App-only packages keep their own version ranges in the member's `package.json`: firebase, @ngx-translate, zod, rrule, @angular/aria, @fontsource, Lucide, firebase-tools and similar.
  - Always run `npm install` from the workspace root, so overrides and the `patch-package` postinstall apply.
- **Functions.** `functions/` must stay deployable on its own: the Firebase CLI uploads that folder and installs from its `package.json`. Bundle it with esbuild so the code in `shared/` is included, and keep its runtime dependencies in its own manifest.
- **Already in the workspace:** Angular 22.2, TypeScript 6, Vitest 4, ESLint with angular-eslint and Prettier (`printWidth` 100, single quotes). Angular Material is installed at the root, but Siteline doesn't use it (PRD section 7).
- **Root `AGENTS.md`.** Its Angular rules apply here too.

## Layout (inside apps/siteline)

```text
apps/siteline/
├─ CLAUDE.md
├─ docs/PRD.md
├─ package.json            # workspace member: app-only deps and scripts
├─ firebase.json
├─ .firebaserc             # staging and production aliases
├─ firestore.rules
├─ firestore.indexes.json
├─ storage.rules
├─ web/                    # Angular app (angular.json project "siteline")
│  └─ src/app/
│     ├─ core/             # Firebase services, auth, guards, i18n
│     ├─ shared/           # UI components, pipes
│     ├─ staff/            # /app routes
│     ├─ client/           # /c, /p and /r routes
│     └─ dev/              # /dev/outbox, emulator only
├─ functions/              # self-contained for deploy
│  └─ src/{callables,triggers,scheduled,adapters,lib}
├─ shared/                 # zod schemas, types, constants (path alias @siteline/shared)
├─ tests/{rules,e2e}/
└─ scripts/seed.ts
```

## Stack

- **Angular 22:** standalone components, signals, zoneless, OnPush, built-in control flow and Signal Forms.
- **Firebase:** Auth, Firestore, Storage, Functions (2nd gen, TypeScript), Hosting, App Check and Cloud Messaging, all in region europe-north1. Use the modular JS SDK through small injectable services that expose signals.
- **UI:** Angular CDK and Angular Aria with custom components, Lucide icons, and tokens in `web/src/styles/tokens.css`. Fonts are self-hosted with @fontsource.
- **Languages:** @ngx-translate/core with Swedish (`sv`) as the default and English (`en`) second. Never hard-code a user-facing string.
- **Validation:** zod schemas in `shared/`, used by both web and functions. Recurring schedules use rrule.

## Conventions

- **Naming:** no `.component` suffix in file names and no `Component` suffix on class names (for example `App` in `app.ts`, `Feed` in `feed.ts`).
- **Angular style:** signal-based inputs and outputs, `@if`/`@for`, and `inject()` everywhere. Use the `host` object instead of `@HostBinding`/`@HostListener`, and class/style bindings instead of `ngClass`/`ngStyle`.
- **Server-side checks:** logic that guards money, plan limits or access lives in callable functions, never only in the browser.
- **Rules tests:** every change to `firestore.rules` or `storage.rules` comes with rules tests.
- **Data formats:** money in öre (integers). Phone numbers in E.164. Times stored in UTC and shown in Europe/Stockholm.
- **Logging:** never log phone numbers, emails, message text or invite tokens.
- **Outside services:** call them only through `functions/src/adapters`.
- **Accessibility:** WCAG 2.2 AA, 44 px touch targets and visible focus.

## Commands

Run these from the workspace root with `--workspace apps/siteline`, or from `apps/siteline`:

- `npm run dev`: starts the emulators, the app and the seed data
- `npm test`, `npm run test:rules`, `npm run test:integration` (callables and triggers), `npm run e2e`
- `npm run deploy:staging`. Never deploy to production from a local machine.

The emulators need Java 21+ and firebase-tools. Test runs use `firebase.test.json` (other ports, project `demo-siteline-test`, app on port 4300), so they can run while `npm run dev` is up.

## Workflow

- Build one milestone at a time (PRD section 14). Plan first and list open questions, then build.
- Use the Firebase Emulator Suite only until told otherwise. Don't deploy anything.
- Finish each milestone with green tests and a short summary of what changed and what is left.
