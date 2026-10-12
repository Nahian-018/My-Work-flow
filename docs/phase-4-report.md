# SmartFlow Duo — Phase 4 বাস্তবায়ন প্রতিবেদন

- **তারিখ:** ১১ অক্টোবর ২০২৬
- **প্রকল্প:** SmartFlow Duo (`Nahian-018/My-Work-flow`)
- **কাজের শাখা:** `arena/7d617a02-my-work-flow`
- **এই workspace-এ দেখা HEAD:** `04c0ed9` — আগে উল্লেখ করা `bb1ab7d`-এর সঙ্গে অমিলটি reset/switch করে সমাধান করা হয়নি।
- **সামগ্রিক অবস্থা:** **PARTIALLY IMPLEMENTED** — Phase 4-এর database migration, live-mode page/provider এবং local test আছে; hosted Supabase deployment/দুই account/real device প্রমাণ নেই।

> এই রিপোর্ট code review ও স্থানীয় automated test-এর evidence। এটি hosted deployment, Gmail provisioning, OAuth, Supabase Realtime delivery, cloud backup বা production security certification নয়। Supabase owner-এর migration/setup না হওয়া পর্যন্ত hosted Live feature **BLOCKED**। Phase 5, commit বা push করা হয়নি।

## ১. Feature status

| Feature | Status | Local implementation ও যাচাই | সীমা / blocked gate |
|---|---|---|---|
| নিরাপদ one-to-one Live chat | **PARTIALLY IMPLEMENTED** | `chat_messages` ও per-user read receipt schema, stable operation ID-সহ idempotent send/read/unread RPC, workspace membership/RLS, database history, unread count; UI history/send/retry/read state; provider simulation ও PGlite/Auth/RLS simulation। | দুই approved account দিয়ে hosted send/read পরীক্ষা **BLOCKED**। Realtime subscription/publication migration-এ আছে, কিন্তু hosted Realtime, reconnect ও cross-device instant update **NOT TESTED**। Chat backup export করা হয় না। |
| Quick notes: shared/private, CRUD/search/category/pin | **PARTIALLY IMPLEMENTED** | DB-backed shared/owner-only private notes, owner policy/RPC, optimistic version, safe soft-delete; UI search/category/visibility/pin/sort/timestamps; provider/UI test ও PGlite member/private isolation tests। | Hosted দুই-account authorization, conflict ও RLS validation **BLOCKED**। Offline copy encrypted নয়; browser-origin/site-data boundary-র বাইরে নিরাপদ cloud storage নয়। |
| Dashboard | **PARTIALLY IMPLEMENTED** | `get_dashboard_summary()` server RPC পুরো table থেকে uncapped আজকের total/completed/pending/in-progress, overdue, completion rate ও সর্বোচ্চ ৮ upcoming row ফেরায়; Asia/Dhaka date; loading/empty/error/offline cache অবস্থার UI; SQL ও component test। | Hosted Supabase RPC deployment/বাস্তব timezone/data যাচাই **BLOCKED**। Offline সংখ্যা IndexedDB cache-নির্ভর, তাই অসম্পূর্ণ হতে পারে এবং স্পষ্টভাবে local বলে চিহ্নিত। |
| Reports ও CSV | **PARTIALLY IMPLEMENTED** | দৈনিক/শনিবার-শুরু সাপ্তাহিক/মাসিক/custom Dhaka range, category/authorized creator grouping, daily trend, task/report CSV; Bengali UTF-8 BOM ও formula neutralization; utility এবং ৫০১-row pagination UI/query tests। | সর্বোচ্চ ৫,০০০ row; exact count তার বেশি হলে partial report/CSV বন্ধ করে range সংকুচিত করতে বলে। Hosted RLS/real CSV consumer test **NOT TESTED**। Offline report cache-only ও অসম্পূর্ণ হতে পারে। |
| Offline cache/sync/conflict | **PARTIALLY IMPLEMENTED** | IndexedDB user-partitioned task/chat/note cache ও pending queue, স্থায়ী unique operation ID, online ফিরলে/provider সক্রিয় হলে sync, duplicate-safe RPC, explicit note conflict retry/discard; fake IndexedDB ও provider simulations। | Browser background/বন্ধ অবস্থায় guaranteed sync নেই। IndexedDB unencrypted; quota, eviction, crash, user/site-data clear বা device loss-এ pending data হারাতে পারে। Membership revoke offline অবস্থায় server-এ পুনরায় যাচাই করা যায় না। |
| Backup/restore | **PARTIALLY IMPLEMENTED** | Versioned JSON export: work list, template, task, RLS-visible own/shared notes, নিজের notification preference, timer/activity/history archive; ১০ MiB/schema/workspace/row checks; paged exact-count export, confirmation, safe merge, duplicate/retry receipt; foreign private note server-side filter ও mocked ৫০১-row pagination test। | Download হলো local file—**cloud backup নয়**। Collection row caps ছাড়ালে export fail করে; chat export নেই; soft-deleted item undelete হয় না; imported history authoritative audit নয়। Hosted restore/real file-loss drill **BLOCKED/NOT TESTED**। |
| Security / private-data isolation | **PARTIALLY IMPLEMENTED** | Authenticated membership, owner/private note policy, chat/workspace RLS, limited `security definer` RPC grants, foreign-private-note restore filtering এবং PGlite RLS/Auth simulation-এ outsider denial cases। | PGlite বাস্তব Supabase Auth/JWT/RLS/Realtime hosting-এর সম্পূর্ণ প্রতিরূপ নয়। Hosted production audit, anon/auth roles, দুই real identity, revocation, browser cache/account switch test **BLOCKED**। |
| Phase 1–3 regression | **PASS (local automated suite)** | পুরনো demo/UI, timer/timezone, Phase 3 migration/Auth/offline/notification/task-view test চালানো হয়েছে; নিচে full suite evidence। | পুরনো demo test বাস্তব cloud persistence প্রমাণ করে না; Phase 3 hosted validation এখনো **BLOCKED**। |

## ২. Database ও authorization পরিবর্তন

নতুন migration: `supabase/migrations/202610100004_phase4_chat_notes_backup.sql`। এটি আগের তিনটি migration-এর পরে apply করার জন্য। প্রধান server-side কাজ:

- `chat_messages`, `chat_read_receipts`, `workspace_notes`, operation/restore receipt এবং imported history archive—workspace/member/owner যাচাইসহ।
- Chat send operation ID-তে unique/idempotent; read receipt/unread RPC কেবল অনুমোদিত member-এর জন্য। Chat/private content public/anon API-তে উন্মুক্ত নয়।
- Shared note দুই workspace member-কে; private note কেবল owner-কে RLS ও RPC-তে দেওয়া হয়। Note write/delete expected version যাচাই করে; conflict হলে overwrite না করে explicit resolution।
- `restore_workspace_backup(jsonb, uuid)` workspace/membership/schema/field/row count যাচাই করে, foreign user-এর private note বাদ দেয়, existing ID overwrite না করে merge করে এবং operation retry receipt ব্যবহার করে।
- `get_dashboard_summary()` আজকের দিন `Asia/Dhaka` অনুযায়ী database-এ গণনা করে; browser task cache-এর ৫০০-row সীমার ওপর নির্ভর করে না।
- Hosted project-এ `supabase_realtime` publication থাকলে chat, read receipt ও notes table idempotently যোগ করার migration আছে। Publication বাস্তবে সক্রিয়—এমন দাবি করা হচ্ছে না।

Owner-side চার migration, Auth provider/allowlist, environment configuration ও hosted validation-এর ধাপ `supabase/README.md`-তে আছে। পূর্বে অনুমোদিত দুই Gmail পুনরায় চাওয়া হয়নি; ঠিকানা migration/source/frontend-এ hardcode করা হয়নি। কোনো secret নেওয়া, তৈরি, সংরক্ষণ বা commit করা হয়নি।

## ৩. পরীক্ষার ফল

সর্বশেষ পূর্ণ `npm test`: **১৭ test file, ৮৯/৮৯ PASS**। Phase 4 migration-এর চারটি PGlite test—chat idempotency/access, private/shared notes/version, backup restore/private-note filter এবং dashboard membership aggregate—সহ সব suite সফল। Reports pagination/৫,০০০-row overflow guard-এর ২টি component/query test, backup page confirmation/wrong-workspace-এ ২টি test এবং backup pagination/privacy query test-ও pass। আগের Phase 3 report-এ ৫৩টি test লেখা ছিল; বর্তমান repository-তে পূর্ণ suite ৮৯টি test-এ পৌঁছেছে। Offline-store suite-ও ৬ থেকে ১০ test-এ বেড়েছে; পুরনো report-এর সংখ্যা আর current total নয়।

- `npm run build`: **PASS** — `tsc -b` ও Vite production build সফল; CSS 13.98 kB (gzip 3.32 kB), JavaScript 338.60 kB (gzip 101.03 kB)।
- `npm audit --audit-level=moderate`: **PASS** — ০ known vulnerability।
- Unit, component/provider simulation, PGlite/Auth/RLS simulation ও boundary স্পষ্ট করে বিস্তারিত `docs/test-report.md`-তে।

## ৪. এখনো BLOCKED / NOT TESTED

1. Supabase project-এ migration `001→002→003→004` apply, grants/RLS/function/Realtime publication verify ও rollback rehearsal — **BLOCKED**।
2. আগের দুই approved account-এ Google OAuth, third unauthorized identity, cross-account private note denial, chat history/read receipt/unread এবং realtime reconnect — **BLOCKED**।
3. দুইটি real browser/device-এ concurrency, offline reconnect, browser/site-data removal, IndexedDB eviction, task/note conflict recovery — **BLOCKED**।
4. Real Android Chrome/PWA install/sleep/force-stop, desktop browser matrix, keyboard/screen-reader/accessibility এবং notification permission/delivery — **NOT TESTED/BLOCKED**।
5. Production backup download/restore, export completeness beyond limits, off-device copy ও real data-loss recovery rehearsal — **BLOCKED**।

Browser foreground notification ছাড়া reliable closed-tab background delivery, native Android alarm, PC always-on-top floating window, server scheduler, Service Worker/Web Push worker এই Phase-এ যোগ করা হয়নি। Browser permission/sleep/OS policy delivery আটকে দিতে পারে।

## ৫. খরচ, data handling ও থামার সীমা

- কোনো paid API/service/upgrade স্বয়ংক্রিয়ভাবে চালু হয়নি। Supabase/Google OAuth-এর বর্তমান free quota, storage/Realtime/Auth সীমা ও pause policy owner-কে dashboard-এ যাচাই করতে হবে; কোনো cost/free-quota guarantee দেওয়া হচ্ছে না।
- IndexedDB cache/queue ও ডাউনলোড করা JSON—দুটিই local; কোনোটিই cloud backup নয়। Browser storage encryption/backup/retention নিশ্চিত নয়।
- Offline chat/note অন্য account-এ পৌঁছায় না যতক্ষণ না server-এ sync হয়। Task create/edit/delete/timer/settings-এ এখনও internet দরকার; Phase 3 task-status queue আলাদা।
- কাজ ও রিপোর্ট Phase 4-এ থেমেছে। Phase 5, commit বা push করা হয়নি; পরবর্তী পদক্ষেপে user-এর অনুমতি প্রয়োজন।
