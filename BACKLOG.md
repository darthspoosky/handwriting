# Project Backlog

This document lists major tasks remaining to fully implement the **UPSC Handwriting Evaluation** project based on the provided `project plan`.

## Frontend & User Interface (Phase 4)
- [ ] Build Next.js pages and React components for the evaluation flow as outlined in **Step 4.1**. Files like `src/app/handwriting-evaluation/page.tsx` and related UI components are still missing.
- [ ] Implement client-side image capture/upload widgets, progress indicators, and results display components.
- [ ] Integrate authentication handling on the frontend (redirect to sign‑in page when unauthenticated).

## Security, Testing & Deployment (Phase 5)
- [ ] Add production-ready configuration for authentication providers in `auth-options.ts` and environment variables in `.env.example`.
- [ ] Implement comprehensive automated tests (unit and integration) beyond the basic rate-limit test.
- [ ] Configure end-to-end tests (e.g., Cypress) as suggested in the plan.
- [ ] Create deployment scripts and infrastructure configuration (database setup, Prisma migrations, environment setup).

## Documentation
- [ ] Expand `README.md` with setup instructions, environment variable descriptions, and deployment notes.
- [ ] Provide an example `.env.example` file listing required configuration keys.

These backlog items should be completed to align the repository fully with the project plan.
