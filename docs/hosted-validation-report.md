# SmartFlow Duo — Hosted Supabase Validation প্রতিবেদন

- **তারিখ:** ১১ অক্টোবর ২০২৬
- **শাখা:** `arena/7d617a02-my-work-flow`
- **workspace HEAD:** `04c0ed9` (আগের উল্লেখিত `bb1ab7d`-এর সঙ্গে অমিল অপরিবর্তিত; reset/switch করা হয়নি)
- **সামগ্রিক hosted ফল:** **BLOCKED**
- **Phase 4 code:** অপরিবর্তিত; এই validation turn-এ কোনো migration apply, database write, reset, deletion বা deployment করা হয়নি।

## সারাংশ ও প্রমাণের সীমা

এই run-এ কোনো Hosted Supabase API, SQL endpoint, Auth/OAuth session বা Realtime channel-এ সংযোগ করা যায়নি। Workspace-এ `.env.local` নেই; `VITE_SUPABASE_URL` ও `VITE_SUPABASE_PUBLISHABLE_KEY`—দুটিই environment-এ সেট করা নেই। `.env.example`-এ কেবল placeholder আছে, বাস্তব project URL/key নেই। Supabase dashboard session-ও এই workspace-এ সংযুক্ত নয়। তাই কোনো hosted database-এর অবস্থা, migration history, user session বা message delivery সম্পর্কে PASS/FAIL বলা হয়নি।

এই sandbox থেকে Supabase host-এ সরাসরি network request করার সুবিধাও নেই। ফলে public browser-safe config যোগ হলেও এই runner-এর মাধ্যমে hosted endpoint-এ সরাসরি integration test চালানো সম্ভব নয়। Local test-এর ফল hosted validation নয়।

## অনুরোধকৃত validation matrix

| ক্ষেত্র | ফল | এই run-এ কী যাচাই হয়েছে / কী বাকি |
|---|---|---|
| Supabase Project পরিচয় ও project URL | **BLOCKED** | Project ref/URL দেওয়া বা local config-এ নেই; dashboard সংযুক্ত নয়। কোনো project অনুমান করা হয়নি। |
| Publishable/browser key configuration | **BLOCKED** | `.env.local` নেই এবং `VITE_SUPABASE_PUBLISHABLE_KEY` সেট নেই; key value চাইনি বা প্রকাশ করিনি। |
| Database schema ও hosted migration 001→004 | **BLOCKED** | Repository-তে চারটি migration file আছে; কোনো hosted project-এ apply/history যাচাই করা হয়নি। `db reset` বা migration চালানো হয়নি। |
| Google OAuth ও real session/refresh/logout | **BLOCKED** | Hosted Auth provider/callback settings ও browser OAuth session পরীক্ষা করা হয়নি। |
| আগের অনুমোদিত দুই Gmail account | **BLOCKED** | কোনো account দিয়ে login করা হয়নি; আগের অনুমোদিত pair আবার চাওয়া হয়নি। |
| Hosted database CRUD | **BLOCKED** | Live read/insert/update/delete চালানো হয়নি; কোনো live row পরিবর্তন বা মুছে ফেলা হয়নি। Test data-র জন্য disposable staging scope দরকার। |
| Chat history/message send/read receipt/unread | **BLOCKED** | Hosted database-এ message/RPC call করা হয়নি; দুই account session নেই। |
| দুই-account data isolation ও private notes/RLS | **BLOCKED** | Hosted role/JWT/RLS query বা cross-account access test হয়নি। PGlite simulation hosted RLS প্রমাণ নয়। |
| Realtime chat/reconnect | **BLOCKED** | Supabase channel subscribe, second-client delivery বা reconnect পরীক্ষা হয়নি। |
| Error handling/session expiry/network failure | **BLOCKED** | Real hosted Auth/API error বা expired session তৈরি করে পরীক্ষা করা হয়নি। Mock/component tests আলাদা evidence। |
| Android Chrome/PWA login, sync, chat, offline/online | **NOT TESTED** | বাস্তব Android device/browser-এ পরীক্ষা চালানো হয়নি। |
| PC browser/PWA login, sync, chat, offline/online | **NOT TESTED** | বাস্তব PC browser-এ hosted session পরীক্ষা করা হয়নি। |
| Android/PC OS notification delivery/background | **NOT TESTED** | কোনো বাস্তব OS permission, sleep/force-stop বা background delivery পরীক্ষা হয়নি। |
| Frontend secret/service-role exposure — source/config scan | **PASS** | `src/lib/supabase.ts` browser client-এ URL ও publishable key-ই ব্যবহার করে; `src`-এ `SUPABASE_SERVICE_ROLE_KEY` reference নেই। Workspace text scan-এ service-role environment assignment পাওয়া যায়নি। এটি শুধু বর্তমান workspace-এর static check; Supabase dashboard/provider secret বা অন্য deployment bundle audit নয়। |
| Automated repository tests/build/audit | **PASS** | এই report-এর “Automated checks” অংশে command ও ফল আছে; এগুলো hosted PASS নয়। |

## স্থানীয় automated checks — Hosted evidence নয়

| Command / test | ফল | সীমা |
|---|---|---|
| `npm test` | **PASS — ১৭ file, ৮৯/৮৯** | PGlite/Auth/RLS, fake IndexedDB, component/provider/unit simulation; live Supabase নয়। |
| `npm run build` | **PASS** | `tsc -b` এবং Vite production build সফল। |
| `npm audit --audit-level=moderate` | **PASS — ০ vulnerability** | npm advisory check; production project/config বা RLS audit নয়। |
| Phase 4 PGlite/Auth/RLS migration tests | **PASS — ৪/৪** | Local PostgreSQL-compatible simulation; Supabase Auth/JWT, hosted grants, publication বা production RLS-এর বিকল্প নয়। |
| Phase 3 PGlite/Auth/RLS migration tests | **PASS — ৬/৬** | Local simulation; Phase 3 hosted validation হয়েছে—এমন প্রমাণ নয়। |

## Secret ও data safety

- কোনো secret, service-role key, database password, OAuth client secret, access token বা VAPID private key চাওয়া/পড়া/লেখা/প্রকাশ করা হয়নি।
- Browser-এর `VITE_SUPABASE_PUBLISHABLE_KEY` publishable key; এটি secret নয় এবং RLS-এর বিকল্পও নয়। Service-role key কখনো `VITE_` variable বা browser bundle-এ রাখা যাবে না।
- কোনো live database CRUD, migration, restore, reset, destructive operation, paid upgrade, commit বা push করা হয়নি। কোনো account/session/data-ও পরিবর্তন করা হয়নি।

## Hosted validation চালাতে আপনার প্রয়োজনীয় কাজ

**Secret এই chat-এ দেবেন না।** নিচের ধাপগুলো owner-side dashboard বা আপনার নিয়ন্ত্রিত test environment-এ করুন:

1. **Project নিশ্চিত করুন:** যে existing Supabase project ব্যবহার করতে চান সেটির project ref, Auth URL allowlist, billing/free quota ও বর্তমান migration history dashboard-এ যাচাই করুন। Project URL বা key chat-এ পাঠানোর প্রয়োজন নেই।
2. **Safe staging scope প্রস্তুত করুন:** বাস্তব production task/message/note মুছে বা বদলে CRUD পরীক্ষা করা হবে না। Production project হলে আগে আলাদা disposable/staging project এবং test workspace ব্যবহার করুন। কোনো `db reset` চালাবেন না।
3. **Migration history মিলিয়ে নিন:** staging project-এ `202610100001_phase3_task_system.sql` থেকে `202610100004_phase4_chat_notes_backup.sql` পর্যন্ত ক্রমানুসারে apply করুন; প্রতিটি ধাপের result ও grants/RLS/function error যাচাই করুন। migration mismatch বা partial failure হলে থামুন—অনুমান করে পুনরায় apply/reset করবেন না।
4. **দুই অনুমোদিত account provision করুন:** আগে অনুমোদিত Admin/Member pair-কে private `private.authorized_emails` table-এ owner-side-এ রাখুন। ঠিকানা এখানে বা public migration-এ কপি করবেন না; পুনরায় Gmail চাওয়া হচ্ছে না। Google OAuth-এ callback/site URL মিলিয়ে নিন এবং unauthorized user-কে allowlist-এ ঢোকাবেন না। OAuth client secret কেবল Supabase/Google provider configuration-এ থাকবে।
5. **শুধু browser-safe config দিন:** local ignored `.env.local`-এ `.env.example`-এর key name অনুসারে `VITE_SUPABASE_URL` ও `VITE_SUPABASE_PUBLISHABLE_KEY` রাখুন। `.gitignore`-এ `.env.*` ignore করা আছে। Service-role key, database password বা OAuth secret `.env.local`-এ VITE prefix-সহ রাখবেন না। এই sandbox থেকে Supabase host-এ direct connection সম্ভব নয়; hosted check-টি network-enabled browser/staging environment-এ owner-side-এ চালাতে হবে।
6. **অনুমোদিত test plan:** Admin ও Member আলাদা browser context-এ sign in; session refresh/logout; staging-এর tagged test row CRUD; shared data দুজনের কাছে দৃশ্যমান, private note শুধু owner-এর কাছে; অন্য account-এর direct table/RPC read/write denial; chat-এ send→database reload→read receipt/unread→দ্বিতীয় browser-এ Realtime→disconnect/reconnect; offline queue/retry/conflict/duplicate prevention. Test শেষে test fixture cleanup কেবল staging data-তে করুন।
7. **বাস্তব device pass/fail:** PC browser-এ browser/PWA test, Android device-এ Chrome/PWA install/login/sync/chat/offline/online এবং notification permission/sleep/force-stop আলাদাভাবে চালান। Browser notification background delivery নিশ্চিত ধরে নেবেন না। Device না থাকলে ওই ফল **NOT TESTED** থাকবে।

> Hosted validation পুনরায় চালানোর আগে staging project/config এবং owner-side OAuth setup সম্পন্ন হওয়া দরকার। Project URL/key বা কোনো secret chat-এ পাঠাবেন না; sanitized ফল (project ref বাদ দিয়ে migration version, error code, test outcome) দিলেই যথেষ্ট।
