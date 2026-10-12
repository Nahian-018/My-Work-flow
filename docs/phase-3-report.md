# SmartFlow Duo — Phase 3 বাস্তবায়ন ও যাচাই রিপোর্ট

- **তারিখ:** ১০ অক্টোবর ২০২৬
- **সামগ্রিক অবস্থা:** **PARTIAL IMPLEMENTATION · HOSTED VALIDATION BLOCKED · Phase 3 সম্পূর্ণ নয়**
- **Phase 4:** **শুরু করা হয়নি।** এই রিপোর্টের পর পরবর্তী অনুমতির জন্য অপেক্ষা করা হবে।

## ১. সারসংক্ষেপ

বর্তমান SmartFlow Duo project থেকেই Phase 3-এর app, database migration, authentication ও offline foundation যোগ করা হয়েছে; Phase 1/2 demo path মুছে বা নতুন করে বানানো হয়নি। Live Supabase mode এবং sample/demo mode-কে আলাদা রাখা হয়েছে।

এই workspace-এ Supabase project URL/publishable key, hosted project access বা Google OAuth owner configuration নেই। Migration hosted project-এ চালানো হয়নি; তাই **real login, hosted RLS, two-account/device sync, Realtime বা notification delivery PASS বলা যাবে না**। `.env` না থাকলে `App.tsx` আগের স্পষ্ট DEMO workspace দেখায়; সেটির sample/session-only data প্রকৃত user data বা cloud backup নয়। বাস্তব কাজের তথ্য demo mode-এ দেবেন না।

সম্পূর্ণ স্থানীয় suite: **৮টি test file, ৫৩/৫৩ automated PASS**। Production TypeScript/Vite build সফল; `npm audit --audit-level=moderate`-এ ০ known dependency vulnerability। Automated test, build ও dependency audit hosted/device validation-এর বিকল্প নয়।

## ২. কী বাস্তবায়িত হয়েছে

| ক্ষেত্র | Implemented / প্রমাণ | সীমা ও বর্তমান অবস্থা |
|---|---|---|
| **Auth ও protected workspace** | Supabase browser client; Google OAuth sign-in; persistent/auto-refresh session; logout; loading/error/denied/ready gate; profile load; `ensure_current_user_workspace_member()` RPC-এ verified Google provider ও private allowlist recheck। নতুন user-এর Auth trigger ও আগে থেকে থাকা Auth user recovery path আলাদা। | Supabase/Google owner setup নেই, কোনো live login চালানো হয়নি। `Admin`/`Member` role private membership-এ আছে; দুজনই shared task workspace ব্যবহার করেন—আলাদা granular task-role policy বাস্তবে validate করা হয়নি। Session expiry Supabase SDK সামলায়; real token expiry/revoke test blocked। |
| **Offline membership recovery** | শুধু আগে backend-এ সফলভাবে যাচাইকৃত user-এর membership/profile IndexedDB-তে user ID অনুযায়ী cache হয়। Network failure-এ cached session স্পষ্ট offline warning-সহ চালু হতে পারে; online/visible হলে recheck হয়। Backend `42501` revocation-এ membership, task cache ও queued status purge করার চেষ্টা হয়। | Offline cache server authorization নয়, unencrypted local data; offline অবস্থায় revocation তাৎক্ষণিক জানা যায় না। Purge best-effort—IndexedDB নিজেই unavailable হলে মুছতে নাও পারে। Test Auth/RPC stub ব্যবহার করে; live session নয়। |
| **Database, ownership ও authorization** | `supabase/migrations/202610100001_phase3_task_system.sql`, `...100002_phase3_live_task_operations.sql`, `...100003_phase3_auth_recovery_and_recurring_templates.sql` — workspace/member/profile, lists, templates/instances, schedule, timer fields/events, activity history, notification preferences ও private outbox; constraints, version/operation IDs, unique daily occurrence, soft delete, private exact-email allowlist, verified Google-account enforcement, RLS/grants ও controlled RPC। Frontend-এ secret/service-role key নেই। | Migrations hosted project-এ apply/inspect/rollback করা হয়নি। PGlite simulation Supabase role, extension, Auth trigger, publication, hosted RLS/runtime-এর proof নয়। Allowlist-এ আগের দুই account owner-কে private dashboard/SQL Editor-এ provision করতে হবে; addresses code/public migration/chat-এ রাখা হয়নি। |
| **Task CRUD ও history** | Live task create/edit/soft-delete/status; title/description/category/priority, Dhaka date/time, duration, derived planned end, optional reminder; per-user preferences; optimistic version/operation ID; task/event history। Soft-delete hard delete নয়; activity history থাকে। | Live CRUD hosted project-এ test হয়নি। Offline অবস্থায় task create/edit/delete/settings/timer queue করা যায় না। History view-তে সর্বশেষ ১০০ activity দেখানো হয়। |
| **Recurring daily task** | Daily template ও daily instance; `Asia/Dhaka` date; unique `(template_id, planned_date)` এবং retry-safe generation। Client workspace খুললে আজ থেকে পরবর্তী ১৪ দিনের occurrence ensure করে। Template edit note স্পষ্ট করে যে edit বর্তমান occurrence-এ; future template বদলায় না। Recurrence stop future pending occurrence soft-delete/history-সহ রাখে। | Server scheduler নেই। Browser বন্ধ থাকলে ঠিক মধ্যরাতে occurrence তৈরির দাবি করা যাবে না; পরের client open/generation call-এ catch-up হয়। Concurrent/hosted generation blocked, যদিও PGlite idempotency test PASS। |
| **Timer, elapsed/remaining ও overdue** | DB timestamp-ভিত্তিক start/pause/resume/complete/reopen; accumulated seconds ও running segment সংরক্ষণ; browser card কেবল timestamp থেকে display tick করে। Refresh/reopen/sleep-এর পর persisted timestamps থেকে হিসাব পুনরুদ্ধার হয়। Database lock/version ও unique partial index workspace-এ একসঙ্গে সর্বোচ্চ একটি running timer প্রতিরোধ করে। `refresh_overdue_tasks()` ও clock view overdue/remaining/overtime দেখায়। | PGlite-এ timer lifecycle/constraint পরীক্ষা হয়েছে; hosted concurrency, device sleep, clock drift ও দুই-device timing test blocked। Offline timer mutation হয় না; server timestamp/backend connection দরকার। |
| **Reminder ও browser notification** | Per-user notification preference, permission button, quiet hours, upcoming/start/pre-start/overdue foreground checks, notification dedup receipt ও click-through-to-task logic। Schedule/status change হলে private outbox bookkeeping create/cancel হয়। | Page খোলা থাকলে প্রায় ১৫ সেকেন্ডে foreground check চলে। `setInterval` reliable alarm নয়। Outbox delivery worker/cron/Edge Function, service worker message handler, subscription/VAPID, Web Push বা native Android alarm নেই; daily-summary preference/outbox-ও নিজে delivery করে না। Browser/PC/Android OS notification বাস্তবে test হয়নি। |
| **Offline cache ও sync** | IndexedDB user-partitioned task snapshot, verified membership, notification receipt ও unique operation ID-সহ **status-only** queue; reconnect/visible refresh-এ RPC sync চেষ্টা; queued status cache-এ overlay; server version conflict হলে explicit retry-on-latest/discard UI। Realtime subscription চেষ্টা ও manual refresh fallback আছে। | IndexedDB cloud backup নয়, encrypted নয়, browser/OS quota/eviction/clear হলে unsynced change হারাতে পারে। Logout cache মুছে না; shared device-এ logout-এর পর site data clear করতে হবে। Offline cross-device sync নেই। Network/permission/conflict handling hosted দুই-user flow-এ test হয়নি। |
| **Phase 1/2 regression** | Existing demo/sample route, bilingual UI, navigation ও interactions অক্ষত রাখা হয়েছে; demo label/no-cloud notice আছে। Original regression coverage রাখা হয়েছে; suite বাড়িয়ে এখন ৫৩ tests। | Phase 2 DEMO data এখনও live backend data নয়। Real browser visual/device regression চালানো হয়নি। |

## ৩. Migration ও owner setup

Migration apply করার আগে owner-কে SQL, target project এবং migration history পর্যালোচনা করতে হবে; সরাসরি অজানা production project-এ চালানো উচিত নয়। `003`-এর one-running-timer unique index আগে থেকে এক workspace-এ একাধিক active timer থাকলে migration fail করতে পারে—constraint বাদ না দিয়ে duplicate active timer resolve করতে হবে।

Owner-side setup-এর পূর্ণ নির্দেশনা ও checklist: [`supabase/README.md`](../supabase/README.md)। সংক্ষেপে:

1. Owner-এর existing/অনুমোদিত Supabase project, region, Free quota ও backup/export যাচাই করে তিনটি migration ক্রমানুসারে প্রয়োগ করুন। এই repository থেকে hosted migration চালানো হয়নি।
2. আগের অনুমোদিত Admin ও Member Gmail **শুধু** `private.authorized_emails` private table-এ provision করুন; ঠিক একটি active Admin ও একটি active Member। কোনো বাস্তব email public source/migration/frontend/chat-এ বসাবেন না।
3. Supabase Auth-এ Google provider চালু করে অন্য sign-in provider/self-service signup বন্ধ রাখুন; dashboard-এ callback URL ও production origin configure করুন। Google OAuth client secret শুধু owner dashboard-এ থাকবে।
4. Local ignored `.env.local`-এ শুধু browser-safe `VITE_SUPABASE_URL` ও `VITE_SUPABASE_PUBLISHABLE_KEY` দিন। `.env.example` নির্দেশনা। Service-role/DB/OAuth/VAPID secret, token বা অন্য secret frontend/Git/chat-এ দেবেন না।
5. Live configuration-এর পর দুই অনুমোদিত account এবং পৃথক unauthorized Google account দিয়ে account recovery, RLS, CRUD, history, timer race/conflict, logout/revocation, Realtime ও PC↔Android synchronization validate করুন। Real sensitive data ব্যবহারের আগে সব security check সম্পন্ন করুন।

## ৪. Test/verification ফল

### Automated local test

`npm test` — **৮ test file, ৫৩/৫৩ PASS** (১০ অক্টোবর ২০২৬)। আগের Phase 1/2 regression test বাদ দেওয়া হয়নি। বর্তমান breakdown:

| Suite | ফল |
|---|---:|
| `src/App.test.tsx` — Phase 2 demo UI regression | ১৬/১৬ |
| `src/domain/task-time.test.ts` — Asia/Dhaka ও timer unit tests | ১০/১০ |
| `src/db/phase3-migration.test.ts` — PGlite + Auth stubs | ৬/৬ |
| `src/auth/AuthGate.test.tsx` | ৫/৫ |
| `src/auth/AuthProvider.test.tsx` | ২/২ |
| `src/lib/offline-task-store.test.ts` — fake IndexedDB | ৬/৬ |
| `src/phase3/LiveWorkspace.test.tsx` | ৪/৪ |
| `src/phase3/live-notifications.test.ts` | ৪/৪ |
| **মোট** | **৫৩/৫৩ PASS** |

### Build ও dependency audit

- `npm run build` — **PASS**; `tsc -b` + Vite production bundle। CSS 88.45 kB (gzip 17.33 kB), JS 337.16 kB (gzip 100.78 kB)। Build success hosted deployment নয়।
- `npm audit --audit-level=moderate` — **PASS; ০ known vulnerability** audit সময়ে। এটি dependency advisory scan—পূর্ণ application/RLS/security audit নয়।
- `npm ci` — lockfile install সফল; একটি transitive `whatwg-encoding` deprecation notice ছিল, npm audit-এ vulnerability নয়।
- Automated test বনাম manual/device test-এর file-by-file status: [`docs/test-report.md`](test-report.md)।

## ৫. Blocked / not-tested matrix

| যাচাই | অবস্থা | কারণ/সীমা |
|---|---|---|
| Hosted migration apply/rollback, grants, RLS, Auth trigger, Realtime publication | **BLOCKED** | Supabase project credentials/owner access নেই; SQL hosted-এ run হয়নি। |
| Google OAuth, exact two real accounts, unauthorized-account denial, token expiry/revocation | **BLOCKED** | Owner provider config ও live account নেই। |
| PC ও Android-এর মধ্যে real-time sync, concurrent update/conflict, screen sleep/reopen | **BLOCKED** | Hosted backend ও দুই real device/browser নেই। |
| Real-browser foreground notification, permission denial/change, click-through | **NOT TESTED** | Automated logic test আছে; notification-capable browser manual run হয়নি। |
| Browser বন্ধ/Android force-stop/background Web Push/native alarm | **BLOCKED** | Delivery implementation/service worker/native alarm নেই। |
| PC/tablet/Android visual, browser matrix, keyboard/screen reader/contrast | **NOT TESTED** | Browser/device/accessibility manual test চালানো হয়নি। |
| Production HTTPS hosting, PWA install, quota/backup dashboard review | **BLOCKED** | Deployment/owner dashboard validation হয়নি। |

**PGlite/Auth-stub PASS ≠ hosted Supabase PASS।** কোনো hosted/device test-কে PASS হিসেবে রিপোর্ট করা হয়নি।

## ৬. PC/Android ও background/always-on-top সীমা

- Web manifest আছে; native Android application বা desktop wrapper তৈরি হয়নি। PC browser window নিজে always-on-top floating panel হতে পারে না; native wrapper ছাড়া এই feature নেই।
- Browser `Notification` শুধু permission ও foreground page check-সহ best-effort। Service Worker/Web Push subscription/server dispatcher নেই—tab বন্ধ, OS sleep, Android force-stop, battery optimization বা permission restriction-এ notification নিশ্চিত নয়। `setTimeout`/`setInterval` দিয়ে reliable background alarm দাবি করা হয়নি।
- Native Android alarm/always-on-top এবং desktop always-on-top-এর বাস্তব device behavior পরীক্ষা করা হয়নি। PC/Android test status **NOT TESTED/BLOCKED**, PASS নয়।
- Offline mode-এ একই device-এ আগে synced cache দেখা ও status-only change queue করা যায়; no network-এ অপর device sync হয় না। Browser site data মুছলে unsynced status হারাতে পারে; logout-এ cache থেকে যায়।

## ৭. Data loss, security ও paid-service ঝুঁকি

- এই কাজের সময় কোনো hosted Supabase project-এ migration/data change করা হয়নি; কোনো বাস্তব user task data touch করা হয়নি। Live data/OAuth secret repository-তে নেই।
- Task hard-delete RPC নেই; task soft-delete ও activity history রাখা হয়। Recurrence stop ভবিষ্যতের pending occurrence soft-delete করে; পুরোনো/completed history রেখে দেয়।
- Offline status queue শুধু সেই browser-এর IndexedDB-তে। Browser data clear/eviction, storage failure, device loss বা account revocation-এ queued change sync না-হয়ে হারাতে পারে। Revocation-এ local task/queue purge best-effort; এই removal queued unsynced status হারাতে পারে। Logout একা local task cache মুছে না।
- Free plan-এ automatic backup/PITR নাও থাকতে পারে; owner-কে project-এ বাস্তব backup/export ও restore strategy আলাদা যাচাই করতে হবে। IndexedDB/local export-কে Cloud backup বলা যাবে না।
- কোনো paid API, notification service বা paid upgrade চালু করা হয়নি। Phase 1 vendor research-এ Supabase Free reference হিসেবে 50,000 MAU, 500 MB database, 5 GB egress, 1 GB file storage, সর্বোচ্চ 2 active Free project, Realtime 2 million messages/month/200 peak connections এবং Edge Functions 500,000 invocation/month উল্লেখ ছিল। এগুলো **dashboard-এ আজ পুনরায় যাচাই করা হয়নি এবং পরিবর্তনশীল quota—guarantee নয়**। একই research-এ Free project inactivity-তে pause এবং automatic backup/PITR না থাকার ঝুঁকি নথিভুক্ত আছে। বর্তমান quota/region/backup owner-এর Supabase dashboard-এ যাচাই করুন: [`docs/phase-1-plan.md`](phase-1-plan.md)। Auto-upgrade/billing অনুমোদিত নয়; quota সীমায় গেলে paid-এ ওঠার বদলে আগে usage থামিয়ে/review করুন।

## ৮. Phase 3-এর পরবর্তী prerequisite ও gate

Phase 3-এর final hosted sign-off দেওয়ার আগে owner-side Supabase setup, তিনটি migration-এর পর্যালোচনা/apply, private two-member allowlist, Google-only OAuth, local safe config, দুই বাস্তব account-এর RLS/sync test, production browser/Android/PC test এবং notification feasibility/status পুনরায় যাচাই দরকার। Checklist: [`supabase/README.md`](../supabase/README.md)।

**Phase 3 এখনো সম্পূর্ণ নয়; Phase 4 শুরু করা হয়নি।** এই report-এর পর Phase 4-এর অনুমতি না পাওয়া পর্যন্ত নতুন Phase 4 implementation শুরু হবে না।