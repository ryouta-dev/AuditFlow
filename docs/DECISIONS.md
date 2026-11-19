# Decisions and trade-offs

| Decision | Rationale and implications |
| --- | --- |
| Next.js App Router with one static application shell | Real routes and browser history work with a single offline navigation fallback. Cloud data loads only through the signed-in client. |
| Navy and indigo interface using Inter, CSS, and Lucide | The overview gives direct access to checklist creation and ongoing inspections. Data tables, filters, and inspection controls share the same visual style. Local Inter assets support offline rendering and Cyrillic text. |
| Browser-local demo opens by default when cloud settings are absent | The college walkthrough needs no cloud setup or shared credentials. Demo data belongs to its browser profile and never enters the cloud queue. |
| One account-owned sync table with typed JSON payloads | One protocol supports revision ordering, receipts, and tombstones. Role policies, indexes, and the RPC enforce relational invariants. Promote frequently queried fields or kinds to dedicated tables as reporting volume grows. |
| Desktop and phone use the same inspection UI | Responsive layout, labeled choices, and move-up/down controls keep the builder keyboard-operable. |
| Outcome counts and immutable checklist snapshots | Manual and AI checklists record one of four outcomes per criterion. Completion requires an observation for a failure and a reason for either exception. Existing snapshots retain their scoring logic and response types. |
| Foreground sync with explicit variant selection | Users control which answer wins an overlap. The app keeps the queue durable while closed and resumes when opened. Unresolved conflicts pause later writes to preserve operation order. |
| Browser-local cache is tied to the last signed-in browser profile | Signing out hides records from the UI and retains queued work for the same account. A shared OS/browser profile can inspect browser storage. Use separate profiles for separate device users. |
| Native print PDF and styled Excel worksheets | The demo needs reports from saved records without a server renderer. Report results are stable while the audit remains finalized. Findings and CAPA reflect current state and can change on subsequent exports. Save the exports you need to retain. |
| Russian default, followed by Kazakh and English | The device keeps explicit language choices. The interface, AI output, PDF layout, and Excel labels use the selected language. New demo fixtures use the language at seeding. Existing records retain their original text. |
| Opt-in AI with in-memory keys and proposals | Signed-in workspaces use three fixed-provider adapters. The demo calls OpenAI-compatible endpoints directly when they allow browser requests and uses a loopback-only relay for River. PDF, DOCX, XLSX and text are parsed in the browser. Each request sends the approved text. Users review proposals in the regular editors before saving. |
| Evidence capture deferred | The storage policy is ready for a later authenticated upload queue. |

The product verification target is a small individual workspace. Mutation receipt retention, very large datasets, device backup and restore, and authentication expiry after extended offline use need operational testing before a broader deployment.
