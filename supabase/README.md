# SmartFlow Duo — Phase 3/4 Supabase owner setup

এই repository-তে Phase 3 ও Phase 4-এর চারটি migration এবং live browser integration আছে; **এগুলো hosted Supabase project-এ apply বা live account দিয়ে যাচাই করা হয়নি**। PGlite tests PostgreSQL-compatible local/Auth/RLS simulation মাত্র। Owner-side migration, Google OAuth, Realtime ও দুই-account/device validation না হওয়া পর্যন্ত hosted Live mode **BLOCKED**; Supabase config না থাকলে app পুরোনো, স্পষ্টভাবে চিহ্নিত demo path-এ থাকে।

## যোগ করা migration

ক্রম অনুযায়ী পর্যালোচনা ও apply করুন:

1. `migrations/202610100001_phase3_task_system.sql`
   - Asia/Dhaka workspace, `task_templates`/`task_instances`, schedules, timer/history, notification preferences/outbox;
   - private exact-email allowlist, verified-account provisioning trigger, workspace membership, RLS, limited RPCs;
   - duplicate daily occurrence prevention, optimistic version checks, timer/start/pause/resume/complete/reopen/schedule RPC.
2. `migrations/202610100002_phase3_live_task_operations.sql`
   - task soft-delete/edit RPC, notification cancellation/rescheduling, active timer deletion stop, Realtime publication registration.
3. `migrations/202610100003_phase3_auth_recovery_and_recurring_templates.sql`
   - previously-created Auth user-এর secure membership restore RPC;
   - retry-safe daily template create/stop এবং pending future occurrence-এর soft delete/history;
   - allowlist revalidation, authenticated direct template-write restriction, এবং workspace-এ একবারে একটি running timer-এর database unique index.

4. `migrations/202610100004_phase4_chat_notes_backup.sql`
   - private chat, read receipts ও idempotent send/read/unread RPC; shared এবং owner-only private notes, optimistic version/conflict RPC;
   - validated backup restore, retry receipts, duplicate-safe merge, অনুমোদিত notes/settings/history ও imported archive;
   - Asia/Dhaka দিনের exact dashboard aggregate RPC (browser-এর 500-row cache limit-এর বাইরে);
   - publication থাকলে chat, receipts ও notes-কে `supabase_realtime`-এ idempotently যোগ করার চেষ্টা।

**Migrations সরাসরি production-এ না চালিয়ে আগে disposable project-এ পরীক্ষা করুন।** তৃতীয় migration-এর partial unique timer index যদি আগে থেকেই একই workspace-এ একাধিক running timer পায়, migration fail করবে—সেক্ষেত্রে rows পর্যালোচনা/resolve না করে constraint বাদ দেবেন না। Hosted project-এ apply করার আগে Supabase CLI/dashboard থেকে target project ও migration history নিশ্চিত করুন।

## Owner-এর credential-safe ধাপ

1. শুধু আগে থেকে নির্বাচিত Supabase project ব্যবহার করুন; owner dashboard-এ বর্তমান Free-tier quota, region, inactivity pause, backup/export, Auth ও Realtime limits যাচাই করুন। কোনো paid upgrade/API স্বয়ংক্রিয়ভাবে চালু হবে না।
2. চারটি migration পর্যালোচনা করে একই project-এ ক্রমানুসারে apply করুন (001→002→003→004)। Auth provider configure/প্রথম login-এর **আগে** `private.authorized_emails`-এ ব্যবহারকারীর আগের দেওয়া দুইটি Gmail owner-side SQL Editor-এ provision করুন:
   - আগের Admin ঠিকানা → `admin`
   - আগের Member ঠিকানা → `member`
   - workspace id → `00000000-0000-4000-8000-000000000001`

   বাস্তব email এই repository, frontend, screenshot, public SQL migration বা chat-এ লিখবেন না। Email-গুলো শুধু private table-এ থাকবে। Active allowlist-এ ঠিক একটি Admin এবং একটি Member থাকতে হবে। `private.authorized_emails` ও `private.notification_outbox`-এ authenticated/anon client grant নেই।
3. Supabase Auth-এ Google provider configure করুন এবং অন্য sign-in provider/self-service signup বন্ধ রাখুন, যাতে অনুমোদিত identity কেবল Google OAuth হয়। Google OAuth client secret কেবল Supabase dashboard/provider secret field-এ রাখুন. Dashboard-এর redirect/callback URL ব্যবহার করুন এবং production site origin allowlist-এ দিন। Migration-এর Auth trigger verified এবং allowlisted user ছাড়া নতুন membership তৈরি করতে দেবে না। Existing verified Auth account-কে login-এ `ensure_current_user_workspace_member()` RPC reconcile করে।
4. Repository-র `.env.example` দেখে শুধু project URL ও **publishable key** local ignored `.env.local`-এ দিন। `.env.local` commit করবেন না। OAuth client secret, service-role key, database password, access token বা VAPID private key কখনো frontend, chat বা Git-এ দেবেন না। `VITE_` variable browser bundle-এ প্রকাশ্য—secret সেখানে নিরাপদ নয়।
5. `npm ci`, `npm test`, `npm run build` চালান। Owner-configured project-এ production build serve করে দুই অনুমোদিত account দিয়ে আলাদা browser/device-এ test করুন। Config না থাকলে demo দেখানো হবে; demo data-কে live data বলবেন না।
6. প্রথম real data দেওয়ার আগে তিনটি identity path যাচাই করুন: আগের Admin, আগের Member, এবং আলাদা unauthorized Google account। RLS, audit log, role, logout, session restore, revocation ও দুই-device conflict আচরণ যাচাই না হওয়া পর্যন্ত প্রকৃত sensitive task তথ্য দেবেন না।

## Phase 4 implementation status (১১ অক্টোবর ২০২৬)

| Feature | Status | Hosted validation |
|---|---|---|
| Chat / read receipt / unread | **PARTIALLY IMPLEMENTED** | **BLOCKED** — migration/RLS simulation আছে; hosted Realtime ও দুই account পরীক্ষা হয়নি। |
| Shared/private quick notes | **PARTIALLY IMPLEMENTED** | **BLOCKED** — owner RLS/RPC simulation আছে; hosted cross-account test হয়নি। |
| DB dashboard | **PARTIALLY IMPLEMENTED** | **BLOCKED** — uncapped Dhaka summary RPC/PGlite test আছে; hosted result যাচাই হয়নি। |
| Reports / Bengali-safe CSV | **PARTIALLY IMPLEMENTED** | **NOT TESTED** — hosted query/RLS/export হয়নি; app query limit ৫,০০০ row। |
| Offline cache/sync/conflict | **PARTIALLY IMPLEMENTED** | **NOT TESTED** — fake IndexedDB/provider simulation আছে; real device quota/background/reconnect নয়। |
| Backup / restore / privacy | **PARTIALLY IMPLEMENTED** | **BLOCKED** — local validation ও restore RPC simulation আছে; hosted restore/recovery drill হয়নি। |
| Security / private-data boundary | **PARTIALLY IMPLEMENTED** | **BLOCKED** — PGlite Auth/RLS simulation PASS; hosted roles, two real users ও revocation audit বাকি। |

## Live app-এ বর্তমান data path ও সীমা

- Supabase browser client `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_PUBLISHABLE_KEY` ব্যবহার করে; সব task query/RPC backend membership/RLS-এ যাচাই হয়। Browser-এ service-role secret নেই।
- Client আজকের Dhaka date থেকে ১৪ দিনের daily occurrence generation retry করে এবং overdue refresh করে। Daily recurring template/occurrence unique constraint দ্বারা idempotent; browser বন্ধ থাকা অবস্থায় নতুন occurrence-এর জন্য **কোনো server scheduler configure করা নেই**—একজন client workspace খুললে generation হবে।
- Task create/edit/soft-delete/status/timer operation-এ stable operation ID/version আছে। Database row lock ও unique running-timer index duplicate/conflicting writes আটকায়।
- Realtime task/activity এবং Phase 4 chat/read receipt/note update subscribe করার চেষ্টা করে; disconnect হলে online refresh/retry fallback। Migration publication-এ table যোগ করার চেষ্টা করলেও hosted Supabase-এ publication, WAL policy, authorization filter ও usage আলাদাভাবে validate করতে হবে।
- Phase 4 chat-এ database message history, per-reader read receipt/unread count ও stable operation ID আছে; retry একই operation দিয়ে idempotent। দুই-member workspace membership ও RLS server-side access আটকায়। Realtime service সক্রিয়/প্রকাশিত না হলে database path থাকে, কিন্তু instant update নিশ্চয়তা নেই।
- Quick notes-এ shared ও owner-only private visibility, category/search/pin/update timestamp, optimistic version ও delete conflict আছে। UI filter authorization নয়; workspace_notes RLS ও write RPC owner/visibility/version যাচাই করে।
- Dashboard count `get_dashboard_summary()` server RPC-তে পুরো database থেকে Asia/Dhaka তারিখে গণনা হয়; Upcoming সর্বোচ্চ ৮ row। Offline fallback task cache-এর আংশিক সংখ্যা—UI-তে local-only বলে চিহ্নিত।
- Reports custom/daily/শনিবার-শুরু weekly/monthly Asia/Dhaka range, category/authorized creator group, daily trend ও task/report CSV দেয়। ৫০০-row page ও exact count ব্যবহার করে; ৫,০০০-এর বেশি হলে partial CSV বন্ধ করে range ছোট করতে বলে। Offline cache report অসম্পূর্ণ হতে পারে। CSV UTF-8 BOM ও spreadsheet formula prefix neutralize করে।
- IndexedDB-তে user-partitioned task/chat/note cache, last verified membership snapshot, task-status ও chat/note offline operation queue এবং notification receipt থাকে। Automatic sync network ফিরে এলে/provider active হলে চলে; unique operation ID duplicate request সামলায়, note version conflict explicit retry-on-latest/discard চায়। Create/edit/delete/timer/settings task-এ connection দরকার; Phase4 note/chat offline queue করা গেলেও অপর সদস্য cloud sync-এর আগে পাবে না।
- Storage unencrypted browser-local data, cloud backup নয়; logout-এ task/cache/queue স্বয়ংক্রিয়ভাবে মুছে না—shared/public device-এ logout-এর পর browser site data clear করুন। একই user offline থাকলে membership revocation পুনরায় যাচাই করা যায় না। Network ফিরলে backend permission আবার যাচাই হয়। Browser storage clear/evict/crash হলে unsynced queue হারাতে পারে; IndexedDB কখনো cloud backup হিসেবে গণ্য নয়.
- Authenticated task view history-তে soft-deleted record-এর task/audit history রাখা হয়। Hard-delete task RPC নেই।

## Phase 4 Backup/Restore — সীমা ও নিরাপত্তা

- Backup authenticated online JSON download; এটি hosted Supabase backup, cloud storage বা IndexedDB-এর বিকল্প নয়। Shared task/templates/lists, RLS-এ ফেরত পাওয়া shared ও বর্তমান user-এর private notes, নিজের notification preferences, task timer/activity history ও আগের imported history অন্তর্ভুক্ত; chat content export করা হয় না।
- File version/schema, workspace id, collection type/row count ও ১০ MiB size client-এ validate হয়; restore RPC আবার server-side schema/field/row limit, same-workspace membership ও authorization যাচাই করে। Foreign user-এর private note বাদ যায়। Existing IDs duplicate-safe merge-এ overwrite হয় না; retry operation receipt-এ idempotent। Restore-এর আগে browser confirmation আছে; error হলে RPC failure দেখায়।
- Restore soft-deleted rows undelete করে না; history archive-কে imported snapshot হিসেবে আলাদা রাখে—এটি authoritative audit log নয়। Export deterministic ৫০০-row page ও exact count ব্যবহার করে; collection cap ছাড়ালে বা ১০ MiB size পেরোলে error দিয়ে পুরো export বাতিল করে, partial backup download করে না। Downloaded file-এর নিরাপদ external copy owner-কে রাখতে হবে। Chat backup নেই।

## Notification/Android/PC অবস্থা

- Foreground Web Notification handler ও per-user preference/quiet-hours database save আছে। Browser permission user-initiated। Notification schedule open page-এ প্রায় ১৫ সেকেন্ড অন্তর persisted Dhaka timestamps থেকে পরীক্ষা হয়; IndexedDB receipt একই device/account-এ duplicate কমায় এবং click task list-এ নিয়ে যায়। `setInterval` এখানে **শুধু foreground UI polling**, reliable alarm নয়।
- Migration-এর `private.notification_outbox` শুধু idempotent pending record; **কোনো delivery worker/cron/Edge Function/VAPID/Web Push subscription/Service Worker message handler/native Android alarm নেই**। Daily-summary preference সংরক্ষণ হয়, summary delivery হয় না। Tab বন্ধ, browser sleep, Android force-stop, OS permission বা network policy-তে alert মিস হতে পারে।
- PWA/browser-এ OS-supported web notification সম্ভব, কিন্তু Android-এর নির্ভরযোগ্য native alarm বা PC always-on-top floating window নয়। Native Android wrapper এবং desktop always-on-top wrapper এই Phase-এর বাইরে; Phase 4 local migration/feature work আছে, কিন্তু hosted Supabase/Realtime এবং real Android/PC validation এখনো **BLOCKED/NOT TESTED**।

## Hosted validation checklist — এখনো BLOCKED

- [ ] Migration 001→002→003→004 clean project-এ apply; partial failure, grants/RLS/functions/constraints এবং `pg_publication` behaviour যাচাই।
- [ ] Production Auth trigger: exact two verified Gmail, unauthorized identity denial; existing account recovery; allowlist revoke হলে RLS/RPC denial.
- [ ] `anon` ও authenticated direct writes/reads, private schema denial; all public tables/views/RPC grants ও RLS.
- [ ] দুই browser-এ concurrent task edit/status/timer; version conflict, one-running-timer constraint, retry after lost response; history preserved.
- [ ] Supabase Realtime publication, subscription filter, reconnect; cross-device updates.
- [ ] Daily generator concurrent/retry, Dhaka midnight, daily template stop, historical data, generated future deletion; browser closed অবস্থায় scheduler আছে কি না—এখন **নেই**।
- [ ] Live browser notification permission, foreground only, quiet hours, schedule edit/delete/completion reconciliation, notification click-through; PC/Android বাস্তবে পরীক্ষা.
- [ ] Network offline/reopen, IndexedDB recovery/clear/eviction, status queue retry, two-user conflict এবং account revocation while offline.
- [ ] Manual PC, Android Chrome/installed PWA, screen lock/sleep, accessibility/touch/keyboard test.

- [ ] Phase 4: chat history/idempotent resend/read receipt/unread count দুই account-এ যাচাই; unauthorized third identity reject; realtime insert/read receipt ও reconnect.
- [ ] Phase 4: shared note দুই account-এ, private note owner-only read/write, direct table/RPC authorization, version conflict/retry/discard এবং offline queue.
- [ ] Phase 4: `get_dashboard_summary()` real Supabase aggregate বনাম SQL fixtures/আজকের Asia/Dhaka দিন; online/offline/error/empty state এবং বড় row volume.
- [ ] Phase 4: daily/weekly/monthly/custom report, category/user grouping, CSV Bengali/formula injection এবং ৫,০০০-row limit.
- [ ] Phase 4: JSON export filter, modified/corrupt/oversized/wrong-workspace file rejection, duplicate merge, confirmation, private-note isolation, restore idempotent retry ও backup-এর external copy.
- [ ] Phase 4: IndexedDB quota/eviction, offline chat/note queue, repeated/reconnect sync, conflict and account switching; device/site data clear-এ unsynced loss messaging.

## Free quota ও খরচ

এই কোড কোনো paid API বা paid notification service ব্যবহার করে না। Supabase project, Google OAuth provider setup, quotas/limits এবং free-tier inactivity/backup limitation owner-এর existing project policy-র অধীন; current values পরিবর্তিত হতে পারে। Billing/payment auto-enable বা paid upgrade এই কাজের অংশ নয়। Free quota অতিক্রমের আগে feature/retention/usage কমিয়ে pause করুন; বিল স্বয়ংক্রিয়ভাবে অনুমোদিত নয়। Free-tier reference/history দেখুন [`docs/phase-1-plan.md`](../docs/phase-1-plan.md); deploy-এর দিন dashboard/pricing পুনরায় যাচাই আবশ্যক।
