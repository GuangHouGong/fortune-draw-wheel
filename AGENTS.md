# AGENTS.md

## Project

This repository contains the GitHub Pages frontend for `GuangHouGong/fortune-draw-wheel`.

- App name: 土城廣厚宮福德正神・玄壇財神抽獎輪盤
- Stack: Vite + React + TypeScript
- Runtime: static frontend only, no backend and no database
- Deployment base path: `/fortune-draw-wheel/`

## Development Commands

- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Build production assets: `npm run build`
- Preview production build: `npm run preview`
- Lint: `npm run lint`

## Implementation Rules

- Keep the app deployable as a pure GitHub Pages static site.
- Keep `vite.config.ts` base set to `/fortune-draw-wheel/`.
- Store draw settings and winner history in `localStorage`.
- Use `crypto.getRandomValues` for draw randomness.
- The recommended participant count is 120 or fewer; the hard UI limit is 500 participants.
- Participants can be numeric IDs or real names. Keep names with spaces intact by entering one participant per line or using comma separators.
- Preserve the Taiwanese temple event style: red, gold, readable Chinese typography, and projection-friendly sizing.
- Required public assets live in `public/assets/`.

## Verification

Before finalizing frontend changes, run:

```bash
npm run lint
npm run build
```

For UI changes, also start `npm run dev` and inspect the local page when possible.

## Git

Use Conventional Commits, for example:

```text
feat: initialize fortune draw wheel
```
