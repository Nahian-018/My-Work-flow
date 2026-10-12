import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

function renderApp() {
  return render(<BrowserRouter><App /></BrowserRouter>)
}

function workspaceNavigation() {
  return within(screen.getByRole('navigation', { name: /workspace/i }))
}

describe('SmartFlow Duo Phase 2 UI', () => {
  it('labels sample information honestly and renders the working demo dashboard', () => {
    renderApp()
    expect(screen.getByRole('status', { name: 'ডেমো মোড' })).toBeInTheDocument()
    expect(screen.getByText(/নমুনা তথ্য—শুধু এই Browser session-এ/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'দুজনের কাজ, এক জায়গায়।', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('৭', { selector: '.metric-value' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /আজকের অগ্রগতি:/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Cloud Sync নেই/i).length).toBeGreaterThan(0)
  })

  it('routes to each of the eleven unique, titled page views', async () => {
    const user = userEvent.setup()
    renderApp()
    const nav = workspaceNavigation()
    const routes = [
      ['ড্যাশবোর্ড', 'দুজনের কাজ, এক জায়গায়।'],
      ['ওয়ার্ক লিস্ট', 'ওয়ার্ক লিস্ট'],
      ['আজকের কাজ', 'আজকের কাজ'],
      ['ক্যালেন্ডার / সময়সূচি', 'ক্যালেন্ডার / সময়সূচি'],
      ['সারাংশ / রিপোর্ট', 'সারাংশ / রিপোর্ট'],
      ['লাইভ চ্যাট', 'লাইভ চ্যাট'],
      ['কুইক নোট', 'কুইক নোট'],
      ['ইতিহাস', 'ইতিহাস'],
      ['প্রোফাইল', 'প্রোফাইল'],
      ['সেটিংস', 'সেটিংস'],
      ['সহায়তা / User Guide', 'সহায়তা / User Guide'],
    ]
    for (const [linkName, heading] of routes) {
      await user.click(nav.getByRole('link', { name: new RegExp(linkName) }))
      expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
    }
  })

  it('filters work lists and completes a task with session-only feedback', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /ওয়ার্ক লিস্ট/i }))
    expect(screen.getByRole('heading', { name: 'কনটেন্ট স্টুডিও' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ব্যক্তিগত' }))
    expect(screen.getByRole('heading', { name: 'দৈনিক ছন্দ' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'কনটেন্ট স্টুডিও' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /সব তালিকা/i }))
    const taskCheckbox = screen.getByRole('button', { name: /বাকি: সকালের ইনবক্স গুছানো/i })
    await user.click(taskCheckbox)
    expect(taskCheckbox).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/ডেমো কাজের অবস্থা বদলেছে/i)).toBeInTheDocument()
  })

  it('validates and creates a demo quick task from the global quick-add menu', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'দ্রুত যোগ' }))
    await user.click(screen.getByRole('menuitem', { name: 'দ্রুত কাজ যোগ' }))
    expect(screen.getByRole('dialog', { name: 'দ্রুত কাজ যোগ' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'তৈরি করুন' }))
    expect(screen.getByRole('alert')).toHaveTextContent('এই ঘরটি পূরণ করুন।')

    await user.type(screen.getByPlaceholderText('যেমন: সাপ্তাহিক পরিকল্পনা তৈরি'), 'ডেমোতে নতুন কাজ')
    await user.click(screen.getByRole('button', { name: 'তৈরি করুন' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('ডেমোতে নতুন কাজ')).toBeInTheDocument()
    expect(screen.getByText(/Cloud-এ save হয়নি/i)).toBeInTheDocument()
  })

  it('validates task duration, edits the task, and requires confirmation before deletion', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /ওয়ার্ক লিস্ট/i }))
    await user.click(screen.getAllByRole('button', { name: 'নতুন কাজ' })[0])
    await user.type(screen.getByPlaceholderText('যেমন: সাপ্তাহিক পরিকল্পনা তৈরি'), 'সময়ের লগ পরীক্ষা')
    const duration = screen.getByLabelText('সময়কাল (মিনিট)')
    await user.clear(duration)
    await user.type(duration, '0')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    expect(screen.getByRole('alert')).toHaveTextContent('সময়কাল ১–১৪৪০ মিনিটের মধ্যে দিন।')
    await user.clear(duration)
    await user.type(duration, '45')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))

    let taskRow = screen.getByText('সময়ের লগ পরীক্ষা').closest('.task-row')
    expect(taskRow).not.toBeNull()
    await user.click(within(taskRow as HTMLElement).getByRole('button', { name: /সম্পাদনা:/ }))
    const titleInput = screen.getByPlaceholderText('যেমন: সাপ্তাহিক পরিকল্পনা তৈরি')
    await user.clear(titleInput)
    await user.type(titleInput, 'সম্পাদিত সময়ের লগ')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    taskRow = screen.getByText('সম্পাদিত সময়ের লগ').closest('.task-row')
    expect(taskRow).not.toBeNull()
    await user.click(within(taskRow as HTMLElement).getByRole('button', { name: /মুছুন:/ }))
    expect(screen.getByRole('dialog', { name: 'মুছে ফেলার নিশ্চয়তা' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'হ্যাঁ, মুছুন' }))
    expect(screen.queryByText('সম্পাদিত সময়ের লগ')).not.toBeInTheDocument()
  })

  it('creates a list with validation and requires confirmation before deletion', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /ওয়ার্ক লিস্ট/i }))
    await user.click(screen.getByRole('button', { name: 'নতুন তালিকা' }))
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    expect(screen.getByRole('alert')).toHaveTextContent('এই ঘরটি পূরণ করুন।')
    await user.type(screen.getByPlaceholderText('যেমন: সাপ্তাহিক পরিকল্পনা'), 'পরীক্ষার তালিকা')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    const listHeading = screen.getByRole('heading', { name: 'পরীক্ষার তালিকা' })
    expect(listHeading).toBeInTheDocument()
    const listCard = listHeading.closest('.work-list-card')
    expect(listCard).not.toBeNull()
    await user.click(within(listCard as HTMLElement).getByLabelText('খুলুন'))
    await user.click(within(listCard as HTMLElement).getByRole('button', { name: 'তালিকা মুছুন' }))
    expect(screen.getByRole('dialog', { name: 'মুছে ফেলার নিশ্চয়তা' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'হ্যাঁ, মুছুন' }))
    expect(screen.queryByRole('heading', { name: 'পরীক্ষার তালিকা' })).not.toBeInTheDocument()
  })

  it('creates, pins, and safely deletes a demo note', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /কুইক নোট/i }))
    await user.click(screen.getByRole('button', { name: 'নতুন নোট' }))
    await user.type(screen.getByLabelText(/নোটের শিরোনাম/), 'পরীক্ষার নোট')
    await user.type(screen.getByLabelText('নোটের লেখা'), 'শুধু session-এর নমুনা লেখা')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    expect(screen.getByRole('heading', { name: 'পরীক্ষার নোট' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pin: পরীক্ষার নোট' }))
    await user.click(screen.getByRole('button', { name: /Pin করা/i }))
    expect(screen.getByRole('heading', { name: /পরীক্ষার নোট/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'মুছুন: পরীক্ষার নোট' }))
    expect(screen.getByRole('dialog', { name: 'মুছে ফেলার নিশ্চয়তা' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'হ্যাঁ, মুছুন' }))
    expect(screen.queryByRole('heading', { name: /পরীক্ষার নোট/ })).not.toBeInTheDocument()
  })

  it('appends a chat message only to the local sample conversation', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /লাইভ চ্যাট/i }))
    expect(screen.getByText(/বার্তা অন্য ব্যবহারকারীর কাছে যায় না/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('বার্তা লিখুন…'), 'স্থানীয় পরীক্ষার বার্তা')
    await user.click(screen.getByRole('button', { name: 'পাঠান' }))
    expect(screen.getByText('স্থানীয় পরীক্ষার বার্তা')).toBeInTheDocument()
    expect(screen.getAllByText(/বার্তা অন্য ব্যবহারকারীর কাছে যায় না/i).length).toBeGreaterThan(0)
  })

  it('exposes day/week schedule controls while identifying countdowns as static samples', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /ক্যালেন্ডার \/ সময়সূচি/i }))
    expect(screen.getByText(/Countdown-গুলো স্থির ডেমো UI/i)).toBeInTheDocument()
    const weekButton = screen.getByRole('button', { name: 'সপ্তাহ' })
    await user.click(weekButton)
    expect(weekButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'সপ্তাহ' })).toBeInTheDocument()
  })

  it('rejects malformed demo JSON without closing the Restore dialog', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: 'সেটিংস' }))
    await user.click(screen.getByRole('button', { name: 'Demo JSON Restore' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const malformed = new File([JSON.stringify({ type: 'SMARTFLOW_DEMO_EXPORT', tasks: [{}], lists: [], notes: [] })], 'invalid.json', { type: 'application/json' })
    await user.upload(fileInput, malformed)
    expect(await screen.findByRole('alert')).toHaveTextContent('ফাইলটি SmartFlow Demo JSON নয়')
    expect(screen.getByRole('dialog', { name: 'ডেমো JSON Restore' })).toBeInTheDocument()
  })

  it('loads a valid Demo JSON into this session, not into a cloud backup', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: 'সেটিংস' }))
    await user.click(screen.getByRole('button', { name: 'Demo JSON Restore' }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const valid = new File([JSON.stringify({ type: 'SMARTFLOW_DEMO_EXPORT', tasks: [], lists: [], notes: [] })], 'demo.json', { type: 'application/json' })
    await user.upload(fileInput, valid)
    expect(await screen.findByText(/ডেমো Export পড়া হয়েছে; Cloud restore হয়নি/i)).toBeInTheDocument()
    await user.click(workspaceNavigation().getByRole('link', { name: /ওয়ার্ক লিস্ট/i }))
    expect(screen.getByText('মিল থাকা তালিকা নেই')).toBeInTheDocument()
  })

  it('opens search and navigates to a sample match', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'খুঁজুন' }))
    const searchDialog = screen.getByRole('dialog', { name: 'খুঁজুন' })
    await user.type(within(searchDialog).getByPlaceholderText('কাজ, নোট বা তালিকা খুঁজুন…'), 'ক্লায়েন্ট নোট')
    await user.click(within(searchDialog).getByRole('button', { name: /ক্লায়েন্ট নোট পর্যালোচনা/i }))
    expect(screen.getByRole('heading', { name: 'আজকের কাজ' })).toBeInTheDocument()
  })

  it('opens and dismisses notifications, and marks the demo count as read', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'নোটিফিকেশন (2)' }))
    const panel = screen.getByRole('dialog', { name: 'নোটিফিকেশন' })
    await user.click(within(panel).getByRole('button', { name: /সব দেখা/i }))
    expect(screen.queryByRole('dialog', { name: 'নোটিফিকেশন' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'নোটিফিকেশন (0)' })).toBeInTheDocument()
  })

  it('switches theme and language and updates document metadata', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: 'সেটিংস' }))
    await user.click(screen.getByRole('button', { name: /Dark/ }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await user.click(screen.getByRole('button', { name: /English/ }))
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument()
  })

  it('shows the mobile drawer and closes it after a route change; Escape dismisses dialogs', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'নেভিগেশন মেনু খুলুন' }))
    expect(screen.getByLabelText('প্রধান নেভিগেশন')).toHaveClass('sidebar-open')
    await user.click(workspaceNavigation().getByRole('link', { name: /ইতিহাস/i }))
    expect(screen.getByLabelText('প্রধান নেভিগেশন')).not.toHaveClass('sidebar-open')
    expect(screen.getByRole('heading', { name: 'ইতিহাস', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'দ্রুত যোগ' }))
    await user.click(screen.getByRole('menuitem', { name: 'দ্রুত কাজ যোগ' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('provides named interactive controls and a skip link on the help page', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(workspaceNavigation().getByRole('link', { name: /সহায়তা/i }))
    expect(screen.getByRole('link', { name: 'মূল কনটেন্টে যান' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('heading', { name: 'সহায়তা / User Guide', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offline' })).toBeInTheDocument()
    const unnamedButtons = [...document.querySelectorAll('button')].filter((button) => {
      return !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.getAttribute('title') && !button.textContent?.trim()
    })
    expect(unnamedButtons).toHaveLength(0)
  })
})
