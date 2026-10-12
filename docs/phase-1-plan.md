# SmartFlow Duo — Phase 1: Requirements, Feasibility ও Architecture

**পর্যালোচনার তারিখ:** ১০ অক্টোবর ২০২৬

**পর্যায়:** Phase 1 পরিকল্পনা ও Phase 2 UI foundation সম্পন্ন। Phase 3 code ও local test foundation আংশিক যুক্ত; hosted Supabase/OAuth/device verification এখনো blocked ([Phase 3 report](phase-3-report.md))

**গুরুত্বপূর্ণ:** নিচের চেকলিস্টে কোনো আইটেম চিহ্নিত থাকলেই সেটি বাস্তবে তৈরি বা পরীক্ষা হয়েছে—এমন নয়। প্রতিটি বাস্তবায়ন ও পরীক্ষা সংশ্লিষ্ট Phase-এ আলাদাভাবে রিপোর্ট করা হবে।

## ১. সংক্ষিপ্ত সিদ্ধান্ত

দুইজন ব্যবহারকারীর SmartFlow Duo-কে **React + TypeScript + PWA + Supabase + IndexedDB** দিয়ে বাস্তবায়ন করা সম্ভব; স্বাভাবিক ব্যবহারে এটি বিনা মূল্যে চালানোর জন্য উপযুক্ত। প্রস্তাবিত স্থাপত্যে Cloudflare Pages শুধু স্থির (static) ওয়েব ফাইল পরিবেশন করবে; Login, Database, Realtime Chat, নিরাপত্তা বিধি এবং ঐচ্ছিক Push dispatch হবে Supabase-এ। কোনো Paid API, বাধ্যতামূলক subscription বা billing account ধরে পরিকল্পনা করা হয়নি।

**যে সীমাবদ্ধতাগুলো গোপন করা হবে না:**

1. Supabase Free project এক সপ্তাহ ব্যবহার না হলে pause হতে পারে; Free plan-এ automatic backup/PITR নেই। ফলে সার্ভার সচল থাকার নিশ্চয়তা বা স্বয়ংক্রিয় disaster recovery বলা যাবে না।
2. Web Push-এ অনুমতি, HTTPS, Browser/OS এবং Internet দরকার। Service worker বন্ধ থাকা অবস্থাতেও Push কাজ করতে পারে, কিন্তু ব্যাটারি সাশ্রয়, OS-এর notification permission, browser implementation, project pause বা network-এর কারণে প্রতিটি alert পৌঁছানোর নিশ্চয়তা নেই।
3. Browser/PWA-তে সত্যিকারের **always-on-top** floating window নেই। PWA-তে compact/quick-access screen দেওয়া যাবে; সব window-এর উপরে ভাসমান desktop window চাইলে পরে Tauri/Electron-এর মতো desktop wrapper লাগবে।
4. Offline পরিবর্তন আগে সেই Device-এর IndexedDB-তে queue হবে; Internet ছাড়া অন্য Device-এ Sync হবে না। Sync-এর আগে Browser data মুছে গেলে unsynced পরিবর্তন হারাতে পারে। IndexedDB cloud backup নয়।
5. Supabase quota পরিবর্তন হতে পারে। Free quota অতিক্রম করলে service সীমিত/বাধাগ্রস্ত হতে পারে; তাই Paid plan-এ স্বয়ংক্রিয় upgrade করা হবে না।

## ২. Requirements Checklist

এই checklist পুরো App-এর acceptance scope। Phase 2-তে শুধু UI/navigation shell বাস্তবায়িত; সেগুলোর অবস্থা `docs/phase-2-report.md`-এ আছে। বাকি Database-backed feature এখনো বাস্তবায়িত/পরীক্ষিত নয়।

### ২.১ বিনামূল্যের প্রযুক্তি ও প্ল্যাটফর্ম
- [ ] React + TypeScript responsive PWA; PC, tablet ও Android browser-এ ব্যবহারযোগ্য।
- [ ] Supabase Auth, Postgres Database, Realtime, Edge Functions এবং `pg_cron`-এর Free quota-ভিত্তিক ব্যবহার।
- [ ] Offline cache ও পরিবর্তনের queue-এর জন্য IndexedDB; Web Push/Notification কেবল সমর্থিত Browser/Device-এ।
- [ ] কোনো paid API বা বাধ্যতামূলক paid account নয়; কোনো secret key public frontend/repository-তে নয়।
- [ ] প্রতিটি deploy-এর সময় Free-plan quota ও vendor policy পুনরায় যাচাই।

### ২.২ ঠিক দুইজন Google/Gmail ব্যবহারকারী ও Workspace
- [ ] Google OAuth Login; allowlist-এ কেবল ব্যবহারকারীর দেওয়া ঠিক দুইটি Gmail থাকবে।
- [ ] প্রথম অনুমোদিত ঠিকানার Role: **Admin**; দ্বিতীয়টির Role: **Member**। সঠিক ঠিকানা Secure Database provisioning-এ থাকবে—Git বা Frontend-এ নয়।
- [ ] allowlist Database-এর private schema-তে থাকবে; Frontend-এ লুকানো তালিকা দিয়ে নিরাপত্তা করা হবে না।
- [ ] Backend authorization ও প্রতিটি প্রাসঙ্গিক table-এ RLS দিয়ে Workspace সদস্যপদ যাচাই।
- [ ] দুই সদস্য Work Lists, Tasks, Status, Schedule, Shared Notes, Chat, History ও Summary একসঙ্গে দেখবেন।
- [ ] Profile-এর ব্যক্তিগত অংশ, Personal Settings ও Private Notes শুধু সংশ্লিষ্ট ব্যবহারকারীর জন্য।
- [ ] Online পরিবর্তন Realtime-এ অপর Device-এ পৌঁছাবে; Realtime disconnect হলে পুনরায় Database থেকে reconcile হবে।

### ২.৩ Work Lists, Checklist ও Task
- [ ] একাধিক Category-ভিত্তিক List তৈরি, Edit, Archive ও Delete; Delete-এর আগে Confirmation।
- [ ] Task-এ Checkbox, Title, Description, Category, Priority, Schedule ও Status।
- [ ] Complete/Uncomplete হলে বাস্তব Database data থেকে Progress পুনর্গণনা।
- [ ] Archive/Delete ইতিহাসে থাকবে; ইতিহাস না মুছে নিরাপদে soft-delete/restore ব্যবস্থা।

### ২.৪ প্রতিদিনের ব্যবস্থা, History ও Asia/Dhaka
- [ ] Task Template ও তারিখভিত্তিক Task Instance আলাদা; একই Template-এর একই দিনের duplicate আটকাতে Database unique constraint।
- [ ] Workspace reset timezone `Asia/Dhaka`; UTC timestamp-এর পাশাপাশি স্থানীয় `local_date` সংরক্ষণ।
- [ ] প্রতিদিনের Completed/Pending/সময় পেরিয়ে যাওয়া Task-এর Instance ও Activity History সংরক্ষণ; আগের দিনের data মুছবে না।
- [ ] App বন্ধ/Offline থাকলে পুনরায় Login/Sync-এ Database transaction দিয়ে বাদ পড়া তারিখগুলো idempotently backfill এবং আজকের Checklist নিশ্চিত।
- [ ] দিন বদলের সময় পুরোনো record ইতিহাসে থাকবে; নতুন দিনের Instance আলাদা হবে।

### ২.৫ Schedule, Timer ও Overdue
- [ ] Start time, expected duration/end, reminder timing ও schedule পরিবর্তনের history।
- [ ] Timestamp-ভিত্তিক Countdown, elapsed/remaining time, overdue, actual start ও completion time।
- [ ] Pause/Resume-এর প্রতিটি বিরতি সংরক্ষণ; refresh, sleep বা app বন্ধ থাকলেও `now - saved timestamp` থেকে সঠিক elapsed time।
- [ ] Task Complete হলে timer বন্ধ; concurrent update-এর জন্য server-side atomic operation।
- [ ] Overdue notification frequency ও Quiet Hours user preference অনুযায়ী; duplicate alert আটকাতে idempotent outbox।

### ২.৬ Reminders ও Notifications
- [ ] Task Start, Upcoming, Countdown Expiration, Overdue, Daily Summary এবং নতুন Chat Message notification।
- [ ] Enable/Disable, reminder lead time, Quiet Hours, in-app sound preference ও delivery status।
- [ ] App খোলা থাকলে in-app/Web Notification; অনুমতি থাকলে HTTPS PWA-তে Web Push।
- [ ] Service worker, notification permission, app/background restrictions ও Android battery behavior ব্যবহারকারীকে স্পষ্টভাবে জানানো।
- [ ] Notification sound/appearance OS/browser নির্ধারণ করে; custom sound সব platform-এ নিশ্চিত নয়। App foreground-এ থাকলে আলাদা in-app sound চেষ্টা করা যাবে।

### ২.৭ Live Chat
- [ ] দুই সদস্যের One-to-One Chat, Sender ও server timestamp-সহ message history।
- [ ] Supabase Realtime দিয়ে online অবস্থায় দ্রুত message update; reconnect-এ Database থেকে history reconcile।
- [ ] Per-user read cursor/read status, unread count, latest preview ও Chat notification।
- [ ] Chat table-এ RLS; unauthorized account conversation/message query করতে পারবে না।

### ২.৮ PC Quick Access ও Floating Window
- [ ] Compact Checklist, Quick Task Add, Quick Note, Today's Preview ও Pending Counter।
- [ ] Quick view থেকে পরিবর্তন করলে মূল App ও অন্য Device-এ একই Database-এর মাধ্যমে Sync।
- [ ] PWA-তে compact route/panel; browser-এর বাইরে সব window-এর উপরে থাকার দাবি নয়।
- [ ] Always-on-top সত্যিই দরকার হলে আলাদা Tauri/Electron Phase ও তার Windows packaging/device test বিবেচনা।

### ২.৯ Dashboard, Summary ও Report
- [ ] Total, Completed, Pending, Overdue, Completion %, Planned/Actual time ও Time Overrun।
- [ ] Upcoming Task, Recent Activity ও Unread Messages।
- [ ] বাস্তব Database data থেকে Daily, Weekly, Monthly, Category-wise ও User-wise summary।
- [ ] CSV export; export-এর ক্ষেত্র/তারিখসীমা দেখিয়ে download এবং failure handling।

### ২.১০ Notes ও History
- [ ] Note Create/Edit/Delete, Search, Pin, Category/Tag ও Timestamp।
- [ ] Shared/Private scope; Private Note-এর Database policy owner ছাড়া কাউকে access দেবে না।
- [ ] Task status, schedule edit, pause/resume, completion ও list action-এর audit history।

### ২.১১ Profile, Settings, Theme ও Language
- [ ] Profile: avatar/photo, display name, Gmail, User ID, account creation date ও Workspace membership।
- [ ] Settings: account/workspace, notification, daily reset/timezone, default duration, theme, language, privacy/security, export/backup/restore।
- [ ] Light/Dark/System theme; বাংলা/English interface ও app-এর guide text।
- [ ] Push notification-এর ভাষা/Quiet Hours সংশ্লিষ্ট ব্যবহারকারীর preference অনুযায়ী।

### ২.১২ Navigation ও User Guide
- [ ] Dashboard, Work Lists, Today's Tasks, Calendar/Schedule, Summary/Reports, Live Chat, Quick Notes, History, Profile, Settings ও Help।
- [ ] PC Sidebar; ছোট screen-এ Bottom Navigation বা accessible Drawer।
- [ ] App-এর ভিতরে বাংলা step-by-step guide: Login/User Setup, Checklist, Scheduling/Countdown, Reminder/Daily Reset, Chat/Notification, PC/Mobile, Quick Notes, Profile/Settings, Summary/Export, Backup/Restore, Offline Sync, Permission ও Troubleshooting।

### ২.১৩ Offline, Backup ও Data Protection
- [ ] শেষ Sync-এর Task/Notes cache; offline checkbox/note edit IndexedDB-তে queue।
- [ ] reconnect হলে idempotent sync, conflict handling, unique ID, duplicate prevention ও Sync status।
- [ ] যাচাইযোগ্য JSON backup/restore ও CSV export; সফলতা যাচাই না করে Success বার্তা নয়।
- [ ] Local cache-কে Cloud backup বলা হবে না; Browser data clear/private browsing/storage eviction-এর ঝুঁকি দেখানো।
- [ ] Free Supabase-এ automatic backup নেই বলে নিয়মিত manual export-এর নির্দেশনা।

### ২.১৪ UI/UX ও Performance
- [ ] Premium-looking কিন্তু সহজ UI; responsive PC/tablet/Android, keyboard navigation, focus, contrast ও screen-reader label।
- [ ] Loading, Empty, Error, Offline, Syncing, Conflict ও Success states।
- [ ] Pagination/limited query, index ও Realtime channel cleanup; অপ্রয়োজনীয় animation/request নয়।
- [ ] App name **SmartFlow Duo** ব্যবহারকারীর দেওয়া নাম; নাম/ডোমেইন/ট্রেডমার্ক একচেটিয়া কি না যাচাই করা হয়নি। Logo concept: দুইটি linked checkmark/flow node; exclusivity দাবি করা হবে না।

### ২.১৫ Phases, Test ও Final Delivery
- [ ] নিচে Phase 1–12-এর gate/ক্রম নথিভুক্ত।
- [ ] প্রতিটি feature-এর Automated/Manual test আলাদা; `PASS / FAIL / NOT TESTED / BLOCKED` status ও evidence।
- [ ] UI-কে functional backend বলে দাবি নয়; বাস্তবে deploy/build না হলে deployed/complete বলা হবে না।
- [ ] Source, folder structure, setup/deploy/security/test report ও বাংলা User Guide deliverable।

## ৩. Feasibility ও স্পষ্ট সীমাবদ্ধতা

| Feature | মূল্যায়ন | সীমা/শর্ত |
|---|---|---|
| দুইজনের Google Login ও secure shared Workspace | সম্ভব | দুইটি সঠিক Gmail দরকার; OAuth Client ID/Secret Supabase dashboard-এ owner নিজে বসাবেন। Secret chat বা Git-এ নয়। |
| Shared data, Chat ও real-time sync | সম্ভব | Online অবস্থায় Realtime; Offline-এ live cross-device sync হয় না। Free quota/Internet প্রযোজ্য। |
| Daily reset, history, duplicate prevention | সম্ভব | PostgreSQL transaction, unique key ও Asia/Dhaka `local_date`; অ্যাপ খুললে missed date পুনরুদ্ধার। Backend pause থাকলে নির্ধারিত মুহূর্তে server job চালার নিশ্চয়তা নেই। |
| Timestamp-ভিত্তিক Countdown ও elapsed time | সম্ভব | UI প্রতি সেকেন্ডে redraw করতে পারে; মূল সময় Database timestamp থেকে পুনর্গণনা হবে। Timer চালাতে tab খোলা রাখতে হবে না। |
| PWA Push, app বন্ধ অবস্থার alert | শর্তসাপেক্ষ | HTTPS, push permission, browser push service, active backend ও device network লাগে। OS force-stop/battery optimization/permission বন্ধ/Free project pause হলে বিলম্ব বা অনুপস্থিতি সম্ভব। |
| Quiet hours, reminder timing, alert frequency | সম্ভব, best-effort | Server cron/Edge dispatcher, due-event table ও deduplication; cron minute-level delivery-এর প্রতিশ্রুতি নয়। Foreground-এ local alert দ্রুততর। |
| Private Notes ও member-only data | সম্ভব | UI check যথেষ্ট নয়; RLS ও private schema Database-এ পরীক্ষা আবশ্যক। |
| Offline কাজ ও reconnect sync | আংশিক সক্ষমতা বাস্তবায়নযোগ্য | একই Device-এ IndexedDB; browser storage best-effort। Conflict থাকলে overwrite না করে user resolution দেখানো হবে। |
| Backup/Restore | manual backup সম্ভব | Supabase Free-এ auto backup/PITR নেই। Restore/export user-created file-ভিত্তিক; local file-ও user-কে আলাদা জায়গায় রাখতে হবে। |
| Always-on-top PC popup | PWA-তে সম্ভব নয় | compact panel সম্ভব; native always-on-top-এর জন্য desktop wrapper ও আলাদা build/device test। |
| Custom sound ও সব platform notification | নিশ্চিত নয় | OS/browser sound ও notification rendering নিয়ন্ত্রণ করে; app-এর custom sound কেবল foreground-এ বাস্তবসম্মত। |
| Android install | PWA হিসেবে সম্ভব | Home Screen-এ install/add করা যাবে; এটি Play Store APK নয়। Native APK/Store distribution এই Phase 1 scope নয়। |

## ৪. প্রস্তাবিত Free Technology Stack

| স্তর | পছন্দ | কেন |
|---|---|---|
| UI | React + TypeScript + Vite | দ্রুত static build; React ecosystem; TypeScript ভুল ধরতে সাহায্য করে। |
| Navigation/UI | React Router; accessible UI primitives; Lucide icons | প্রয়োজনীয় সব section, PC Sidebar/mobile navigation। কোনো paid UI kit আবশ্যক নয়। |
| PWA | Service Worker + Workbox/`vite-plugin-pwa` | HTTPS-এ install, offline app shell, cache update ও notification event handling। |
| Data/Realtime | `@supabase/supabase-js` | Google OAuth, PostgreSQL, RLS, Realtime, Edge Functions ও scheduled function integration একই backend-এ। |
| Offline local database | IndexedDB, Dexie wrapper | Task/Note snapshot, pending operation queue ও local search; এটি cloud backup নয়। |
| Push | Browser Push API + Service Worker + Web Push/VAPID | App background/বন্ধে notification চেষ্টা; backend private key Supabase secret-এ। Browser Push service vendor-mediated। |
| Hosting | Cloudflare Pages-এ শুধু `dist/` static assets | Dynamic server দরকার নেই; Backend Supabase-এ থাকবে। Static asset free limits-এ। |
| Test | Vitest, React Testing Library, Playwright, Supabase local/pgTAP | logic, UI, database/RLS ও browser flow আলাদা করে পরীক্ষা। External OAuth/device test manual-ও হবে। |

**Firebase কেন প্রাথমিক পছন্দ নয়:** Firebase-এর Spark plan-এ Authentication ও Firestore-এর উল্লেখযোগ্য no-cost quota আছে, কিন্তু production Cloud Functions deploy করতে Blaze billing plan সংযুক্ত করতে হয়। Scheduled/secure push worker-এর জন্য কার্ড/billing ছাড়া থাকতে চাওয়া লক্ষ্যটির সঙ্গে এটি কম মানানসই। তাই Supabase-কে প্রাথমিক পছন্দ করা হয়েছে; Firebase বিকল্প হিসেবে রাখা যায়, কিন্তু এই অ্যাপের scheduled backend notification-কে Spark-only দিয়ে সম্পূর্ণ করা যাবে না।

## ৫. Database Architecture (প্রস্তাব)

একটি Supabase project-এ একটি Workspace। সব সময় `timestamptz` UTC-তে, এবং দৈনিক grouping-এর জন্য আলাদা `local_date` `Asia/Dhaka` অনুযায়ী। Summary সরাসরি বাস্তব row থেকে query হবে—hard-coded/demo সংখ্যা নয়।

| Table/area | কী রাখবে | Access-এর মূল নিয়ম |
|---|---|---|
| `workspaces` | Workspace ID, নাম, timezone (default `Asia/Dhaka`) | কেবল active member |
| `workspace_members` | দুই সদস্যের user ID/role/active status | নিজে role/member যোগ বা বদলাতে পারবে না; protected trigger/provisioning |
| `private.authorized_emails` | সঠিক দুই verified Gmail allowlist | `private` schema; browser/PostgREST-এ expose নয় |
| `profiles` | Name, avatar, Gmail, created date | Members profile পড়তে পারে; প্রত্যেকে কেবল নিজের editable field বদলাবে |
| `personal_settings` | Theme, language, default duration, notification/quiet-hours | শুধু সংশ্লিষ্ট user |
| `categories`, `work_lists` | Category ও List, archive/delete metadata | workspace member |
| `task_templates` | Task definition/recurrence/priority/list | workspace member |
| `task_instances` | নির্দিষ্ট occurrence, state, schedule ও actual timestamps | workspace member; `(template_id, occurrence_key)` unique |
| `task_time_events` | Start/Pause/Resume/Complete event ও elapsed intervals | workspace member; server transaction writes |
| `notes` | Shared/Private note, tags, pin, owner, timestamps | private note: owner only; shared: workspace members |
| `chat_messages`, `chat_read_states` | message sender/body/time ও per-user read cursor | শুধু workspace-এর দুই member; sender server/authenticated user হতে হবে |
| `activity_events` | Task/List/Schedule change audit; actor/time/before-after | workspace member; client delete নয়; private note body log নয় |
| `push_subscriptions` | user/device-এর push endpoint ও keys | owner read/delete; secret keys নিরাপদে সংরক্ষণ |
| `notification_outbox` | due notification, dedupe key, sent/failed status | UI-তে সরাসরি access নয়; trusted function dispatch |
| `sync_operations` | UUID operation ID/version/result | idempotent retry; client duplicate write আটকানো |

### দৈনিক Task তৈরি

1. `ensure_daily_instances()` নামে Database RPC বর্তমান Dhaka date Database time থেকে নেবে।
2. প্রতিটি eligible daily template-এর জন্য `(template_id, occurrence_key)` unique key-সহ `INSERT ... ON CONFLICT` ব্যবহার করবে। একই RPC একাধিকবার বা concurrent-এ চললেও duplicate হবে না।
3. পুরোনো missing date backfill হলে আগের দিনের history থাকবে; বর্তমান দিনের instance আলাদা হবে। User delete/complete-এর পুরোনো record মুছবে না।
4. Notification cron একই candidate/due-event data দেখে; notification পাঠানোর আগে unique idempotency key ও `sent_at` যাচাই করবে।

### Timer/Conflict/Sync

- Timer-এ `actual_started_at`, `last_resumed_at`, `accumulated_seconds`, `paused_at`, `completed_at` ও event history থাকবে। Running elapsed = সংরক্ষিত accumulated time + বর্তমান UTC time থেকে running segment। `setInterval` শুধু screen refresh-এর জন্য।
- Offline change-এর জন্য client-generated UUID; server-side unique `operation_id` retry duplicate আটকায়।
- Task/Note row-এ `version` counter থাকবে। একই version-এ দুই Device edit করলে server conflict return করবে; UI server version দেখাবে এবং user-এর queued change হারানোর আগে Resolve/Retry বিকল্প দেবে। Checkbox command idempotent থাকবে।
- Reconnect-এ আগে pending operations পাঠানো, তারপর server canonical rows থেকে local cache reconcile। Sync status “Pending/Conflict/Synced/Error” আলাদা হবে।

## ৬. Security Plan

1. **Authentication:** Supabase Google OAuth; শুধু basic identity/profile scopes—Gmail mailbox/API access লাগবে না। Google OAuth Client Secret শুধু Supabase Auth provider configuration-এ।
2. **Allowlist:** Private Database schema-তে user-প্রদত্ত ঠিক দুইটি lowercase exact email। Google verified email মিললে Auth trigger membership তৈরি করবে; অন্য email-এর account-কে data access দেওয়া হবে না। Dot/plus alias স্বয়ংক্রিয়ভাবে একই ধরা হবে না।
3. **Database RLS:** exposed `public` table-এ RLS চালু; প্রতিটি read/write policy `auth.uid()` এবং active workspace membership পরীক্ষা করবে। Notes-এ owner-only/private policy। RLS bypass করতে পারে এমন `service_role` কখনো browser-এ নয়।
4. **Server-side validation:** member count, workspace ID, allowed status transition, immutable owner/sender, daily unique occurrence, task/message length, notification deduplication Database constraint/RPC-এ।
5. **Secrets:** `SUPABASE_URL` ও publishable key browser config-এ থাকতেই পারে; এগুলো data-secret নয়—তবু RLS বাধ্যতামূলক। `service_role`, Google OAuth Secret, VAPID private key `.env`, frontend bundle, Git বা chat-এ নয়; project dashboard/Vault/Edge Function secrets-এ।
6. **Private/cache safety:** IndexedDB record `user_id` দিয়ে partition; Logout-এ user-scoped cache/queued data পর্যালোচনা/মুছে ফেলা। Shared device হলে অন্য account যেন আগের account-এর private data না দেখে। IndexedDB নিজে encrypted vault নয়।
7. **Input/Audit:** Notes/Chat plain text render; unsanitized HTML নয়; database parameterized query/RPC; append-only activity history, rate-limit/size limit; dependency audit ও CSP Phase 11-এ।
8. **Privacy:** push body-তে private note বা sensitive message text না পাঠিয়ে generic “নতুন বার্তা” দেখানো default; full content শুধু authenticated app-এ।
9. **Backup:** Free tier automatic backup নেই—manual JSON export, restore validation ও নিয়মিত আলাদা নিরাপদ স্থানীয় কপি; সফল restore না যাচাই করে Success নয়।

## ৭. Free-tier, Hosting ও ভবিষ্যৎ খরচের ঝুঁকি

পরিমাণগুলো ১০ অক্টোবর ২০২৬-এ দেখা official pricing/docs-এর উপর ভিত্তি করে; provider পরে পরিবর্তন করতে পারে। নিচের পরিকল্পনায় Paid upgrade অনুমোদিত নয়।

### Supabase Free — নির্বাচিত Backend

- **$0 Free plan:** 50,000 MAU; database 500 MB; egress 5 GB (এবং cached egress 5 GB); file storage 1 GB; সর্বোচ্চ 2 active free projects। দুইজনের app-এর জন্য এই quota-র অনেকটাই যথেষ্ট হওয়ার কথা, তবে বাস্তব ব্যবহার monitor করতে হবে। [Supabase Pricing](https://supabase.com/pricing)
- **Realtime:** Free plan-এ 2 million messages/month ও 200 peak concurrent connections। এই অ্যাপের দুই সদস্যের সাধারণ ব্যবহার এতে মানানসই; অস্বাভাবিক message/connection হলে quota alert/ব্যর্থতা হতে পারে। [Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing) · [Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- **Edge Functions:** Free-এ 500,000 invocation/month; scheduled push worker ছোট batch-এ চালানোর জন্য পর্যাপ্ত হওয়ার কথা। [Edge Functions Pricing](https://supabase.com/docs/guides/functions/pricing)
- Hosted Supabase-এ `pg_cron` + `pg_net` দিয়ে সময়মতো Edge Function চালানোর পদ্ধতি আছে। Cron থাকলেও project pause/network/provider failure হলে সময়মতো notification নিশ্চিত নয়। [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- Free project এক সপ্তাহ inactivity-তে pause হতে পারে; Free-এ automatic backups/PITR নেই। Database size 500 MB ছাড়ালে Free project read-only হতে পারে। [Supabase Pricing](https://supabase.com/pricing) · [Database Size](https://supabase.com/docs/guides/platform/database-size)
- Google OAuth provider Free Auth-এর মধ্যে; provider চালু করতে Supabase project ও Google OAuth client configuration দরকার। Custom SMTP-এর ওপর পরিকল্পনা নির্ভর করছে না। [Google OAuth setup](https://supabase.com/docs/guides/auth/social-login/auth-google)

### Hosting ও বিকল্পের সীমা

- **Cloudflare Pages Free:** Static assets-এর request/bandwidth free/unlimited; 500 build/month, একসঙ্গে 1 build; একটি asset সর্বোচ্চ 25 MiB এবং Free plan-এ site-এ সর্বোচ্চ 20,000 file। আমরা Pages Functions ব্যবহার করব না—dynamic/backend কাজ Supabase-এ থাকবে। [Pages Pricing](https://developers.cloudflare.com/pages/functions/pricing/) · [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)
- **Firebase বিকল্প:** Spark-এ Firestore-এর no-cost quota এবং Auth আছে; কিন্তু production Cloud Functions deploy-এর জন্য billing account-সহ Blaze দরকার। Paid plan-এ আপগ্রেড না করার শর্তে Supabase বেছে নেওয়া হয়েছে। [Firebase Pricing](https://firebase.google.com/pricing) · [Firebase Billing Plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- **IndexedDB:** Browser quota browser/OS অনুযায়ী আলাদা; default storage best-effort এবং ব্যবহারকারী storage clear করলে data মুছতে পারে। `navigator.storage.persist()` অনুরোধ করা গেলেও grant নিশ্চিত নয়। [MDN Storage Quotas & Eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- **Push:** Push API service worker-কে app বন্ধ থাকলেও জাগাতে পারে; Push message browser push service দিয়ে আসে, permission ও user-visible notification লাগে। Browser/OS scheduling বা delivery guarantee নয়। [MDN Offline & Background Operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)

## ৮. Deployment Plan

1. **Supabase Free project:** owner Supabase account-এ project তৈরি করে Asia-র কাছাকাছি available region বাছবেন; project region পরে বদলানো সহজ নয়। Billing/paid upgrade চালু করা হবে না।
2. **Database migrations:** tables, constraints, private schema, RLS policies, protected Auth trigger, initial Workspace ও timezone migration apply; allowlist emails secure SQL provisioning-এ বসবে, source code-এ নয়।
3. **Google OAuth:** Google Cloud Console-এ Web OAuth client; app origin ও Supabase callback redirect যুক্ত; Client ID/Secret Supabase dashboard-এ। Secret Git-এ নয়।
4. **Build/Hosting:** `npm ci`, typecheck, automated tests, `npm run build`; Cloudflare Pages-এ `dist/` static output publish; automatic HTTPS এবং free `pages.dev` address। Custom domain বাধ্যতামূলক নয়।
5. **Client configuration:** কেবল Supabase project URL ও publishable key; OAuth redirect URLs/origins production domain-এ allowlist। `service_role`, OAuth secret, VAPID private key server-side secret/Vault-এ।
6. **Scheduled notification:** `pg_cron` → protected Edge Function → due rows/outbox; notification delivery state log; test project/notification permission যাচাইয়ের পর production schedule enable।
7. **Verification:** deployed site-এ migration/RLS/auth redirect, two-user access, quota page, HTTPS/PWA install, sync, notification এবং backup/restore test। বাস্তবে চালানো না হলে “deployed” বলা হবে না।

**বর্তমান deployment status:** Deploy করা হয়নি। Supabase project, Google OAuth configuration, Cloudflare production URL বা private-schema allowlist provisioning এখনো নেই। User allowlist-এর দুই ঠিকানা ও Admin/Member role জানিয়েছেন; ঠিকানাগুলো source file-এ রাখা হয়নি। কোনো secret বা account access chat-এ চাইব না।

## ৯. Testing Strategy ও Phase 1-এর বাস্তব ফল

### Automated tests (পরবর্তী Phase-এ)
- Vitest: Asia/Dhaka midnight boundary, daily occurrence key, timer pause/resume/overdue, quiet-hours, summary calculations, CSV/backup validation।
- Supabase local/pgTAP: authorized vs unauthorized RLS, private/shared Notes, Chat access, exactly-two membership, duplicate daily generation, concurrent insert/update, idempotent operations।
- Playwright: navigation, loading/empty/error/offline/sync states, responsive widths, theme/language, checklist/note/export flows।
- `npm run typecheck`, lint, production build ও dependency/security audit। External Google OAuth এবং actual Web Push-কে mock test দিয়ে বাস্তব প্রমাণ বলা হবে না।

### Manual tests (বাস্তব setup/device দরকার)
- দুই পৃথক Gmail দিয়ে sign-in; তৃতীয়/unauthorized account denial।
- দুই Device-এ shared change, concurrent edit, offline mutation ও reconnect conflict।
- PC browser ও Android Chrome/PWA: Notification permission, screen lock/app closed, battery restrictions, Chat push, quiet hours।
- Backup download, file validation, restore round-trip, browser storage clear warning।
- PC/tablet/mobile responsive UI; user-supplied test device-এ installation।

### Phase 1-এ চালানো যাচাই
- Repository inventory: **PASS** — শুরুতে repository-তে কেবল `README.md` ছিল; app source, `package.json`, database migration বা test suite ছিল না।
- Product feature tests: **NOT TESTED** — executable application এখনো নেই।
- Actual two-account, OAuth/RLS, Realtime, Push, Android/PC, Backup/Restore test: **NOT TESTED** — accounts/device/backend config নেই।
- Quota/Architecture review: official provider documentation পর্যালোচনা করে এই নথিতে link করা হয়েছে; এটি runtime test নয় এবং future plan change হলে পুনরায় যাচাই করতে হবে।

## ১০. Phase 1–12 কাজের ক্রম

| Phase | Scope | Exit evidence |
|---|---|---|
| 1 | Requirements, Feasibility, Free plan, Architecture | এই Phase 1 document ও initial test report |
| 2 | UI/UX, design system, responsive navigation | বাস্তব page/component, mobile/desktop screenshot ও automated UI tests |
| 3 | Google Login, allowlist, schema, RLS/security | দুই অনুমোদিত account ও unauthorized account manual/SQL test; no public secrets |
| 4 | Work Lists, categories, task CRUD/checklist | Database-backed CRUD/progress/delete confirmation tests |
| 5 | Daily reset, timer, reminder | unique daily instance, timer/overdue/notification test |
| 6 | Dashboard, reports, history/export | database-derived aggregate, CSV test ও audit history |
| 7 | Live Chat ও notifications | দুই account Realtime/read/unread + permissioned push tests |
| 8 | Quick Notes ও PC compact access | shared/private scope, quick update sync tests; no false always-on-top claim |
| 9 | Profile, Settings, theme, language, guide | বাংলা/English, theme persistence ও guide coverage |
| 10 | Offline, backup, conflict resolution | offline queue/reconnect, duplicate/conflict, export-restore round-trip |
| 11 | Testing, Security Review, Bug Fix | automated+manual report; unresolved bugs স্পষ্টভাবে চিহ্নিত |
| 12 | Deployment, installation, final delivery | বাস্তব build/deploy/redirect/PWA install ও final Bengali guide; না করলে deployment status অসম্পন্ন |

## ১১. Phase 1-এর Files, অসম্পূর্ণতা ও পরবর্তী পদক্ষেপ

- Phase 1 Files: `docs/phase-1-plan.md`, `docs/test-report.md`, `README.md`।
- ব্যবহারকারী allowlist তথ্য দিয়েছেন: প্রথম ঠিকানা **Admin**, দ্বিতীয় ঠিকানা **Member**। গোপনীয়তার জন্য ঠিকানাগুলো Git-এ কপি করা হবে না; Supabase secure provisioning-এ বসবে।
- Phase 1-এ বাস্তব App feature নেই; Authentication, Database, Sync, Notification, Chat, Backup ও Deployment এখনো **NOT IMPLEMENTED / NOT TESTED**।
- Phase 2 UI/UX foundation সম্পন্ন; Phase 3-এ Supabase project ও OAuth setup প্রয়োজন হবে।

## ১২. শব্দের সহজ অর্থ

- **PWA:** Browser থেকে install করা যায় এমন Web App; তবে native app-এর সব OS ক্ষমতা পায় না।
- **RLS:** Database-এর নিজস্ব নিয়ম—কোনো ব্যবহারকারী কোন row দেখতে/বদলাতে পারবেন। শুধু UI লুকিয়ে রাখার চেয়ে শক্তিশালী।
- **IndexedDB:** ঐ Device-এর Browser-এ local data; Cloud server নয় এবং Browser clear করলে মুছতে পারে।
- **Realtime:** Internet থাকা অবস্থায় server change অন্য খোলা app-এ দ্রুত পাঠানোর channel।
- **Idempotent/unique:** একই operation retry হলেও duplicate row/notification না হওয়ার Database-ভিত্তিক সুরক্ষা।
- **VAPID/Web Push:** Browser push service-এ নিরাপদ notification পাঠাতে ব্যবহৃত web-standard key/signature; private key server-এ থাকবে।
