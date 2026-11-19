# Delivery plan

| Phase | Status | Features and acceptance |
| --- | --- | --- |
| 0 · Foundation | Implemented | Next.js shell, Supabase account flows and profiles, account-owned SQL schema, local synthetic demo, English, Russian, and Kazakh interface and report labels, lint, and typecheck. Embedded Postgres tests verify role and record isolation. Hosted auth requires a configured project. |
| 1 · Vertical slice | Implemented | Draft, duplicate, reorder, publish, and archive checklists. Run inspections with seven response types, answer notes, weighted scoring, required completion, and reopen history. Durable offline queue, conflict resolution, dashboard, findings and one corrective action per finding, print-to-PDF and Excel. |
| 2 · Evidence and analysis | Partial | Version-filtered compliance trends, overdue actions, and basic verification history are available. Photo/PDF upload, attachment metadata, retry recovery, and deeper comparisons are planned. |
| 3 · Report builder | Planned | Branding, reusable layouts, configurable blocks, stored report snapshots, charts, and signature collection. |
| 4 · AI | Implemented for individual workflows | Local demo with a key and compatible endpoint, with no account requirement. TXT, Markdown, DOCX, and text-based PDF assignment import. Reviewed context and validated proposals for checklists, inspection discussion, guided findings, CAPA, and report conclusions. Cloud accounts have a separate authenticated gateway. |
| 5 · Hardening | Partial | Unit, database, and browser checks run locally. Hosted multi-device checks, queue recovery tooling, deployment review, backup/restore, and broader accessibility testing are planned. |

### Implemented routes

- Account flow and settings at `/login`, `/register`, `/recover`, `/settings/profile`, `/settings/sync`, and `/settings/ai`.
- Authenticated AI requests at `POST /api/ai`.
- Workspace and analytics at `/dashboard` and `/analytics`.
- Checklists at `/templates`, `/templates/new`, and `/templates/:id/edit`.
- Inspections at `/audits`, `/audits/new`, and `/audits/:id`.
- Findings and CAPA at `/findings`, `/findings/new`, `/findings/:id`, and `/capa`.
- Reports at `/reports` and `/reports/:auditId`.
- Cloud sync through `apply_auditflow_mutation` and owner-filtered reads of `auditflow_records`.
