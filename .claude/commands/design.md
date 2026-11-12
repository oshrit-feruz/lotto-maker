---
description: Redesign or restyle the customer website (packages/web) with the frontend-design skill and this project's constraints
argument-hint: [page, component or design goal — optional]
---

Use the **frontend-design** skill (`.claude/skills/frontend-design/SKILL.md`). Read it first and follow its process: write a short design plan (palette as named hex values, typefaces and roles, layout with ASCII wireframes, principles), review the plan against the brief, then build, then critique with screenshots.

Target: `packages/web` (Next.js 14 App Router, TypeScript, plain CSS in `src/app/globals.css` with CSS custom properties). Focus for this run: $ARGUMENTS
If no focus is given, review the whole customer site.

## Brief

A licensed agency that sends Israeli lottery forms on behalf of customers. Energetic but trustworthy — it handles people's money, so it must never look like a casino or a gambling-ad banner.

## Hard constraints

- **Hebrew, RTL, mobile first.** `<html lang="he" dir="rtl">`. Use logical CSS properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Design at 390px first, then widen. Numbers, phone numbers and prices stay readable LTR inside RTL text.
- **Brand name comes from `NEXT_PUBLIC_BRAND_NAME`** (via `src/lib/config.ts`). Never hard-code a brand name.
- **No Mifal HaPais (מפעל הפיס) branding.** Do not use its name, logo, colours or slogans as our branding. Factual mentions in legal text and fee pages stay as they are.
- **Legal text stays prominent and unchanged:** the footer disclaimer, the 118 gambling-help line, the 18+ notice and every `PlaceholderBanner` (lawyer-review placeholders). Do not shrink them into fine print, hide them behind toggles or rewrite their wording.
- **Accessible contrast:** WCAG 2.1 AA (4.5:1 body text, 3:1 large text and UI parts), visible keyboard focus, touch targets of at least 44px, and honour `prefers-reduced-motion`.
- **Fonts** only via `next/font/google`, with Hebrew subset support checked. Prefer no new runtime dependencies.
- **Don't change behaviour:** API calls, routes, the proxy (`src/app/api/proxy`), the auth/cookie logic (`src/middleware.ts`, `src/lib/session.ts`), `src/lib/**` logic or anything tests depend on. Styling, markup structure and class names are fair game.

## Verify

- `npm run build -w packages/web`
- `cd packages/web && npx vitest run`
- Screenshots of home, `/ticket` and `/checkout` at 390px and 1280px (Playwright, `next start` against a small mock API for `/draws/upcoming` and `/results/lotto/latest`). Keep screenshots out of the repo.
