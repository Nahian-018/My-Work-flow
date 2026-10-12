# SmartFlow Duo

দুজনের কাজ সাজানোর বাংলা-প্রথম responsive web app। বিদ্যমান Phase 1/2 structure অক্ষত রেখে Phase 3-এর Supabase task workspace, timer, foreground reminders ও IndexedDB status queue এবং Phase 4-এর DB-backed chat/notes/dashboard/reports/CSV/backup ও offline-sync path যোগ করা হয়েছে। Demo UI আলাদা fallback হিসেবে অক্ষত আছে।

## অবস্থা

- Supabase project/OAuth credentials এই workspace-এ নেই এবং migration hosted project-এ apply করা হয়নি। তাই Live backend deployment **BLOCKED**; env configure না থাকলে app স্পষ্ট demo data দেখায়। Demo-কে live data ধরা যাবে না।
- চারটি Supabase migration আছে; PGlite/Auth-stub test চলেছে, বাস্তব Supabase/Postgres/RLS/Google OAuth proof নয়। Phase 4 hosted validation এখনো BLOCKED। Owner setup ও checklist: [`supabase/README.md`](supabase/README.md)।
- Live mode-এ Google OAuth/session restore/protected membership, task CRUD/soft-delete/history, daily template, schedule, timestamp-backed timer, one-running-timer guard, per-user preferences, Realtime attempt ও IndexedDB cache/status queue আছে। Phase 4-এ RLS-backed chat/notes, server dashboard aggregate, Dhaka reports/CSV এবং validated local-file backup/restore code আছে; hosted deployment পরীক্ষা হয়নি।
- Browser notification শুধু permission-সহ page-open foreground check; Web Push/Service Worker/Android native alarm server dispatcher configure করা নেই। App/browser বন্ধ থাকলে alert নিশ্চিত নয়। Offline-এ task-এর শুধু status change এবং Phase 4 chat/note operation queue হয়; IndexedDB cloud backup নয়, unencrypted local storage, এবং logout-এ স্বয়ংক্রিয়ভাবে মুছে না। Shared device-এ logout-এর পর site data clear করুন।
- Phase 4-এর local implementation ও automated tests আছে; hosted Supabase/Realtime ও real-device validation BLOCKED/NOT TESTED।

## চালানো ও পরীক্ষা

```bash
npm ci
npm test
npm run build
npm audit --audit-level=moderate
npm run dev
```

Backend owner-side setup-এর পরে `.env.example` দেখে `.env.local`-এ শুধু `VITE_SUPABASE_URL` ও publishable key দিন। `.env.local` ignored। OAuth secret, service-role key, DB password বা VAPID private key browser/Git/chat-এ দেবেন না।

পরীক্ষার ফল ও hosted/device test-এর সীমা: [`docs/phase-3-report.md`](docs/phase-3-report.md), [`docs/test-report.md`](docs/test-report.md)।

## নথি

- [`docs/phase-1-plan.md`](docs/phase-1-plan.md) — architecture, security ও free-tier assumptions
- [`docs/phase-2-report.md`](docs/phase-2-report.md) — অক্ষত demo UI-র historical report
- [`docs/phase-3-report.md`](docs/phase-3-report.md) — Phase 3 implementation, PASS/PARTIAL/BLOCKED, verification ও test gate
- [`docs/test-report.md`](docs/test-report.md) — automated বনাম manual test evidence
- [`docs/hosted-validation-report.md`](docs/hosted-validation-report.md) — hosted Supabase validation ও blocked prerequisites
- [`docs/phase-4-report.md`](docs/phase-4-report.md) — Phase 4 feature status, test evidence ও hosted/device gate
- [`supabase/README.md`](supabase/README.md) — secret-safe owner setup, migration order, hosted validation checklist

**Phase 4 hosted validation এখনো BLOCKED। Phase 5 শুরু করা হয়নি; hosted project setup ও device validation বাকি।**