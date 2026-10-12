# SmartFlow Duo — Test Report (Phase 1–4)

- **তারিখ:** ১১ অক্টোবর ২০২৬
- **সর্বশেষ পূর্ণ test run:** `npm test`
- **Result:** **১৭ test file, ৮৯/৮৯ PASS, ০ FAIL**।
- **Build:** `npm run build` **PASS**। **Audit:** `npm audit --audit-level=moderate` **PASS — ০ known vulnerability**।
- **এই turn-এর Hosted Supabase validation:** **BLOCKED** — `.env.local` নেই; `VITE_SUPABASE_URL` ও `VITE_SUPABASE_PUBLISHABLE_KEY` configured নয়, ফলে কোনো hosted API/SQL/Auth/Realtime request করা হয়নি।

> Unit/component/PGlite test-এর PASS মানে hosted Supabase, OAuth, production RLS/Realtime, two-device sync, backup durability, browser/OS notification delivery বা Android behavior PASS নয়। প্রতিটি test boundary নিচে আলাদা করা হয়েছে।

## Status সংজ্ঞা

- **PASS:** নির্দিষ্ট local automated test চালানো হয়েছে এবং প্রত্যাশিত ফল মিলেছে।
- **FAIL:** চালানো test প্রত্যাশিত ফল মেলেনি। Final full run-এ কোনো FAIL নেই।
- **PARTIALLY IMPLEMENTED:** code ও local evidence আছে, কিন্তু acceptance-এর hosted/device অংশ অসম্পূর্ণ বা কোনো কার্যকর limit আছে।
- **NOT TESTED:** ওই environment/behavior-এ test চালানো হয়নি।
- **BLOCKED:** hosted project, account, permission বা real device ছাড়া যাচাই সম্ভব হয়নি।

## A. সর্বশেষ full-suite test ফল

| File / scope | Tests | Result | Test-এর ধরন ও সীমা |
|---|---:|---|---|
| `src/App.test.tsx` | 16 | **PASS** | Phase 2 sample/demo UI route ও local interactions; production cloud path নয়। |
| `src/domain/task-time.test.ts` | 10 | **PASS** | Dhaka timezone, schedule ও timer pure unit tests। |
| `src/db/phase3-migration.test.ts` | 6 | **PASS** | Phase 3 migration, Auth stub, membership/RLS, task/timer/recurrence checks—PGlite simulation। |
| `src/auth/AuthGate.test.tsx` | 5 | **PASS** | Auth-gate component; Supabase/Google session mocked। |
| `src/auth/AuthProvider.test.tsx` | 2 | **PASS** | Cached membership, network loss/revocation path; Auth response mock। |
| `src/lib/offline-task-store.test.ts` | 10 | **PASS** | `fake-indexeddb`: user partition, membership/status/workspace cache/queue, conflicts/cleanup; real browser quota/eviction নয়। |
| `src/phase3/LiveWorkspace.test.tsx` | 4 | **PASS** | Live task UI/provider mock; production cloud write নয়। |
| `src/phase3/live-notifications.test.ts` | 4 | **PASS** | Notification timing/preference/dedup unit test; OS delivery নয়। |
| `src/db/phase4-migration.test.ts` | 4 | **PASS** | Chat idempotency/RLS, private/shared notes, restore isolation, Dhaka server dashboard aggregate—PGlite/Auth/RLS simulation। |
| `src/phase4/LiveCollaborationPages.test.tsx` | 3 | **PASS** | Chat history/read/send/profile UI; note search/category/visibility filter/create/edit/pin/delete callback component simulation। |
| `src/phase4/WorkspaceCollaborationProvider.test.tsx` | 2 | **PASS** | Offline chat queue → same operation ID দিয়ে auto-sync; note version conflict → explicit latest-version retry; fake IndexedDB/provider simulation। |
| `src/phase4/LiveDashboardPage.test.ts` | 5 | **PASS** | Dhaka metrics, empty/upcoming, server aggregate source, offline local-only label, backend error UI। |
| `src/phase4/report-utils.test.ts` | 3 | **PASS** | Daily/weekly/monthly Dhaka range, grouping/status/summary unit test। |
| `src/lib/workspace-backup.test.ts` | 4 | **PASS** | Backup schema/workspace/size/collection validation, foreign private-note exclusion ও complete paged export/privacy query simulation। |
| `src/lib/csv-export.test.ts` | 7 | **PASS** | Bengali/escaping, BOM/CSV, formula-injection neutralization unit test। |
| `src/phase4/LiveReportsPage.test.tsx` | 2 | **PASS** | ৫০১-row pagination, Bengali task CSV ও ৫,০০০-row limit অতিক্রম করলে partial export বন্ধ—component/query simulation। |
| `src/phase4/LiveBackupPage.test.tsx` | 2 | **PASS** | Backup file preview, confirmation cancel/accept, restore RPC/refresh ও wrong-workspace file rejection—component simulation। |
| **মোট** | **৮৯** | **১৭ file PASS** | **Local automated tests only।** |

আগের Phase 3 report-এ সর্বশেষ total ৫৩ লেখা ছিল। বর্তমান full run-এ ৮৯টি test আছে; offline store suite-ও ৬ থেকে ১০ test-এ বেড়েছে। Test কমানো হয়নি।

## B. Test class অনুযায়ী evidence

### Unit test — **PASS**

- Dhaka task-time: ১০/১০।
- Report date/group/summary utility: ৩/৩।
- CSV serializer/formula safety: ৭/৭।
- Backup schema/privacy validation ও paged export query simulation: ৪/৪।
- Phase 3 notification scheduling/dedup logic: ৪/৪।
- Dashboard calculations, empty/upcoming behavior: Dashboard suite-এর unit অংশে PASS।

**Boundary:** Pure unit test Supabase/OS/browser storage durability-কে পরীক্ষা করে না।

### Component ও provider simulation — **PASS**

- Phase 4 chat/notes page action tests: ৩/৩।
- Reports page ৫০১-row pagination, CSV export ও ৫,০০০-row overflow protection: ২/২।
- Backup page-এ confirmation cancel/accept, restore success refresh, wrong-workspace ফাইল rejection: ২/২।
- Dashboard page loading/error/offline/server snapshot tests: ৫/৫।
- Offline chat/notes operation queue, stable ID, retry/conflict provider tests: ২/২।
- Phase 3 live workspace: ৪/৪; Auth components: ৭/৭।

**Boundary:** Supabase query/RPC ও authenticated identity mock করা; real account/network নয়।

### Database / Auth / RLS simulation — **PASS**

- Phase 3 PGlite/Auth stub: ৬/৬।
- Phase 4 PGlite/Auth/RLS simulation: ৪/৪:
  1. One-to-one chat message idempotency, outsider access/read/write restriction ও read receipt/RPC permission;
  2. Shared/private note access, owner-only private isolation, version conflict ও write RPC authorization;
  3. Same-workspace backup validation, foreign private note server-side filtering, duplicate-safe merge/restore retry;
  4. Uncapped Dhaka-day dashboard aggregate ও nonmember RPC denial।

**Boundary:** PGlite PostgreSQL-compatible local simulation; Supabase Auth/JWT, grants, production RLS, Realtime publication/WAL/hosted configuration-এর সম্পূর্ণ replica নয়। এগুলো hosted integration proof নয়।

### Hosted integration / real device — **BLOCKED / NOT TESTED**

| Validation | Status | কারণ / সীমা |
|---|---|---|
| Supabase project, URL ও publishable key configuration | **BLOCKED** | `.env.local` নেই; `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_PUBLISHABLE_KEY` set নয়; কোনো project অনুমান করা হয়নি। |
| Hosted migration 001→004, schema, grants/RLS/functions/Realtime publication | **BLOCKED** | migration files local-এ আছে, কিন্তু hosted project/dashboard access নেই; কোনো migration apply বা `db reset` করা হয়নি। |
| Google OAuth, real session refresh/logout ও আগের দুই অনুমোদিত Gmail | **BLOCKED** | কোনো hosted Auth provider/browser session-এ sign-in হয়নি; আগের approved pair আবার চাওয়া হয়নি। |
| Real hosted database CRUD/error handling | **BLOCKED** | কোনো remote read/write/delete বা production data পরিবর্তন করা হয়নি; disposable staging test scope দরকার। |
| দুই-account isolation, shared/private notes ও private-note denial | **BLOCKED** | live account/JWT/RLS query হয়নি। PGlite RLS/Auth simulation আলাদা local evidence। |
| Live chat history/send/read receipt/unread এবং Realtime reconnect | **BLOCKED** | hosted RPC/channel বা cross-device message যাচাই হয়নি। |
| Supabase Realtime cross-device update | **BLOCKED** | Hosted URL/config অনুপস্থিত; PGlite বা component mock Realtime wire protocol পরীক্ষা করে না। |
| Offline → reconnect, IndexedDB eviction/crash/site-data clear ও account switching | **NOT TESTED** | fake IndexedDB simulation only; বাস্তব browser/device run হয়নি। |
| Android Chrome/PWA login/sync/chat/notification/offline-online | **NOT TESTED** | বাস্তব Android device/browser-এ পরীক্ষা চালানো হয়নি। |
| PC browser/PWA login/sync/chat/notification/offline-online | **NOT TESTED** | বাস্তব PC/browser-এ পরীক্ষা চালানো হয়নি। |
| OS background notification, screen sleep/force-stop ও native notification | **NOT TESTED** | real OS/device test হয়নি; browser foreground test-ও OS delivery প্রমাণ করে না। |
| Production backup export/restore, file tamper/large database/off-device recovery | **BLOCKED** | hosted data বা file-loss rehearsal নেই। |
| Frontend service-role key reference scan | **PASS (সীমিত source check)** | `src/lib/supabase.ts` publishable key ব্যবহার করে; `src`-এ `SUPABASE_SERVICE_ROLE_KEY` reference পাওয়া যায়নি। এটি dashboard/deployment secrets audit নয়। |
| Keyboard/screen-reader/browser compatibility/visual accessibility matrix | **NOT TESTED** | manual accessibility/device audit চালানো হয়নি। |

এই hosted-validation run-এ কোনো remote Supabase request, account login, CRUD, migration বা destructive operation হয়নি। বিস্তারিত কারণ ও owner-side next steps: [`docs/hosted-validation-report.md`](./hosted-validation-report.md)।

## C. Build ও dependency audit

| Command | Result | Evidence |
|---|---|---|
| `npm test` | **PASS — ১৭ file, ৮৯/৮৯** | সর্বশেষ full Vitest run; ০ failed। |
| `npm run build` | **PASS** | `tsc -b` + Vite 8.3.4 production build; CSS 13.98 kB (gzip 3.32 kB), JS 338.60 kB (gzip 101.03 kB)। |
| `npm audit --audit-level=moderate` | **PASS — ০ vulnerability** | npm audit run-এর সময়কার registry advisory result; application/RLS/secret/config audit নয়। |

## D. Known limit ও corrected test note

- পূর্ণ suite-এর আগে targeted run-এ dashboard test error-object formatting এবং offline chat optimistic row sync-order assertion ধরা পড়েছিল। Dashboard-এ Supabase error message extraction ঠিক করা হয়েছে; queue sync-এর পর server history refresh বাধ্যতামূলক করা হয়েছে; সংশোধনের পর targeted test ও full suite **PASS**।
- Dashboard cloud total browser-এর paged task cache থেকে নয়—server RPC থেকে। Offline fallback cache-only এবং অসম্পূর্ণ হতে পারে; UI এই সীমা জানায়।
- Reports ৫০০-row page-এ exact count করে; ৫,০০০-এর বেশি হলে partial report/CSV বন্ধ করে range ছোট করতে বলে। Backup-ও deterministic pagination/count করে; collection cap বা count ১০ MiB file cap ছাড়ালে export ব্যর্থ বলে জানায়। বড় dataset-এর hosted result real project-এ যাচাই করতে হবে।
- IndexedDB local, unencrypted browser data; cloud backup/guaranteed durable storage নয়। Network বা browser background-এ বন্ধ থাকলে auto-sync guaranteed নয়।
- Hosted Supabase/Auth/RLS/Realtime/two-device validation **BLOCKED**, browser/device/OS delivery **NOT TESTED**।
