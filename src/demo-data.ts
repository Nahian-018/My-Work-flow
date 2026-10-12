export type LocalizedText = { bn: string; en: string }
export type DemoPriority = 'high' | 'medium' | 'low'
export type DemoTaskStatus = 'completed' | 'in-progress' | 'pending' | 'overdue'
export type DemoCategory = 'work' | 'personal' | 'project'

export interface DemoList {
  id: string
  name: LocalizedText
  category: DemoCategory
  accent: string
  archived?: boolean
}

export interface DemoTask {
  id: string
  title: LocalizedText
  listId: string
  priority: DemoPriority
  status: DemoTaskStatus
  startTime: string
  durationMinutes: number
  actualMinutes?: number
  countdown?: string
  assignee: 'Admin' | 'Member'
}

export interface DemoNote {
  id: string
  title: LocalizedText
  body: LocalizedText
  category: LocalizedText
  updatedAt: LocalizedText
  pinned: boolean
}

export interface DemoMessage {
  id: string
  sender: 'Admin' | 'Member'
  text: LocalizedText
  time: string
  mine: boolean
  read: boolean
}

export interface DemoActivity {
  id: string
  actor: 'Admin' | 'Member'
  action: LocalizedText
  target: LocalizedText
  time: LocalizedText
  type: 'task' | 'schedule' | 'note' | 'list'
}

export interface DemoProfile {
  name: string
  email: string
  userId: string
  role: 'Admin' | 'Member'
  workspace: string
  created: string
}

export const initialLists: DemoList[] = [
  { id: 'list-studio', name: { bn: 'কনটেন্ট স্টুডিও', en: 'Content Studio' }, category: 'work', accent: 'teal' },
  { id: 'list-rhythm', name: { bn: 'দৈনিক ছন্দ', en: 'Daily Rhythm' }, category: 'personal', accent: 'amber' },
  { id: 'list-northstar', name: { bn: 'প্রজেক্ট নর্থস্টার', en: 'Project Northstar' }, category: 'project', accent: 'blue' },
]

export const initialTasks: DemoTask[] = [
  { id: 'task-1', title: { bn: 'সাপ্তাহিক কনটেন্ট পরিকল্পনা', en: 'Plan weekly content' }, listId: 'list-studio', priority: 'high', status: 'completed', startTime: '09:00', durationMinutes: 35, actualMinutes: 42, assignee: 'Admin' },
  { id: 'task-2', title: { bn: 'প্রকল্পের রূপরেখা আপডেট', en: 'Update project outline' }, listId: 'list-studio', priority: 'medium', status: 'in-progress', startTime: '10:15', durationMinutes: 50, actualMinutes: 23, countdown: '00:27:00', assignee: 'Member' },
  { id: 'task-3', title: { bn: 'সকালের ইনবক্স গুছানো', en: 'Clear the morning inbox' }, listId: 'list-rhythm', priority: 'high', status: 'overdue', startTime: '08:30', durationMinutes: 25, assignee: 'Admin' },
  { id: 'task-4', title: { bn: 'সাপ্তাহিক অগ্রাধিকার ঠিক করা', en: 'Set weekly priorities' }, listId: 'list-rhythm', priority: 'medium', status: 'pending', startTime: '13:00', durationMinutes: 30, countdown: '02:14:00', assignee: 'Member' },
  { id: 'task-5', title: { bn: 'ক্লায়েন্ট নোট পর্যালোচনা', en: 'Review client notes' }, listId: 'list-northstar', priority: 'low', status: 'pending', startTime: '15:30', durationMinutes: 45, countdown: '04:44:00', assignee: 'Admin' },
  { id: 'task-6', title: { bn: 'দৈনিক অগ্রগতি শেয়ার', en: 'Share daily progress' }, listId: 'list-northstar', priority: 'high', status: 'completed', startTime: '11:40', durationMinutes: 45, actualMinutes: 38, assignee: 'Member' },
  { id: 'task-7', title: { bn: 'ফলো-আপ বার্তা তৈরি', en: 'Draft a follow-up message' }, listId: 'list-studio', priority: 'low', status: 'pending', startTime: '16:15', durationMinutes: 20, countdown: '05:29:00', assignee: 'Admin' },
]

export const initialNotes: DemoNote[] = [
  { id: 'note-1', title: { bn: 'সোমবারের পরিকল্পনা', en: 'Monday planning' }, body: { bn: 'সপ্তাহের তিনটি প্রধান লক্ষ্য ঠিক করে কাজ ভাগ করে নেওয়া।', en: 'Choose three key goals for the week and divide the work.' }, category: { bn: 'পরিকল্পনা', en: 'Planning' }, updatedAt: { bn: 'আজ · ৯:২০', en: 'Today · 9:20' }, pinned: true },
  { id: 'note-2', title: { bn: 'মিটিং থেকে নেওয়া', en: 'Meeting takeaways' }, body: { bn: 'পরবর্তী আলোচনার আগে কাজের অগ্রগতি ও খোলা প্রশ্নগুলো একত্র করা।', en: 'Collect progress and open questions before the next discussion.' }, category: { bn: 'কাজ', en: 'Work' }, updatedAt: { bn: 'আজ · ১০:০৫', en: 'Today · 10:05' }, pinned: false },
  { id: 'note-3', title: { bn: 'দ্রুত আইডিয়া', en: 'Quick idea' }, body: { bn: 'ছোট কাজগুলো একসঙ্গে ব্যাচ করলে সময় বাঁচবে।', en: 'Batch small tasks together to save time.' }, category: { bn: 'আইডিয়া', en: 'Ideas' }, updatedAt: { bn: 'গতকাল · ১৮:৪০', en: 'Yesterday · 6:40' }, pinned: false },
]

export const initialMessages: DemoMessage[] = [
  { id: 'message-1', sender: 'Member', text: { bn: 'সাপ্তাহিক পরিকল্পনার খসড়া তৈরি করেছি। দেখে জানিও।', en: 'I drafted the weekly plan. Let me know what you think.' }, time: '09:18', mine: false, read: true },
  { id: 'message-2', sender: 'Admin', text: { bn: 'দারুণ! আমি দুপুরের মধ্যে অগ্রাধিকারগুলো যোগ করব।', en: 'Great! I’ll add the priorities by noon.' }, time: '09:26', mine: true, read: true },
  { id: 'message-3', sender: 'Member', text: { bn: 'প্রজেক্ট নর্থস্টারের নোটও আপডেট করেছি।', en: 'I also updated the Project Northstar notes.' }, time: '10:04', mine: false, read: false },
  { id: 'message-4', sender: 'Member', text: { bn: 'আজকের কাজের তালিকায় নতুন একটি ফলো-আপ আছে।', en: 'There is a new follow-up in today’s task list.' }, time: '10:12', mine: false, read: false },
]

export const initialActivities: DemoActivity[] = [
  { id: 'activity-1', actor: 'Member', action: { bn: 'সম্পন্ন করেছেন', en: 'completed' }, target: { bn: 'দৈনিক অগ্রগতি শেয়ার', en: 'Share daily progress' }, time: { bn: 'আজ · ১১:৪০', en: 'Today · 11:40' }, type: 'task' },
  { id: 'activity-2', actor: 'Admin', action: { bn: 'সময় বদলেছেন', en: 'rescheduled' }, target: { bn: 'সাপ্তাহিক অগ্রাধিকার ঠিক করা', en: 'Set weekly priorities' }, time: { bn: 'আজ · ১০:৩২', en: 'Today · 10:32' }, type: 'schedule' },
  { id: 'activity-3', actor: 'Member', action: { bn: 'নোট সম্পাদনা করেছেন', en: 'edited a note' }, target: { bn: 'মিটিং থেকে নেওয়া', en: 'Meeting takeaways' }, time: { bn: 'আজ · ১০:০৫', en: 'Today · 10:05' }, type: 'note' },
  { id: 'activity-4', actor: 'Admin', action: { bn: 'তালিকা তৈরি করেছেন', en: 'created a list' }, target: { bn: 'প্রজেক্ট নর্থস্টার', en: 'Project Northstar' }, time: { bn: 'গতকাল · ১৬:২০', en: 'Yesterday · 4:20' }, type: 'list' },
]

export const initialProfile: DemoProfile = {
  name: 'Alex Morgan',
  email: 'admin@example.test',
  userId: 'demo-user-001',
  role: 'Admin',
  workspace: 'SmartFlow Duo · 2 demo members',
  created: 'Demo account · 2026',
}

export const localize = (text: LocalizedText, language: 'bn' | 'en') => text[language]
