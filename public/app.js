// Live Casino Math Companion - Core Application Logic

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // ==========================================
  // 1. Web Audio API Sound Generator (No external assets required)
  // ==========================================
  let audioEnabled = true;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(type) {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'win') {
        // High celebratory chime (two tones)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'loss') {
        // Low dull thud
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'alert') {
        // Urgent double siren
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(440, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Audio Toggle Button
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  const audioLabel = document.getElementById('audioLabel');
  const audioIcon = document.getElementById('audioIcon');

  audioToggleBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      audioLabel.textContent = 'অডিও অ্যালার্ট: চালু';
      audioIcon.setAttribute('data-lucide', 'volume-2');
      audioIcon.classList.remove('text-slate-500');
      audioIcon.classList.add('text-emerald-400');
      playSound('win');
    } else {
      audioLabel.textContent = 'অডিও অ্যালার্ট: বন্ধ';
      audioIcon.setAttribute('data-lucide', 'volume-x');
      audioIcon.classList.remove('text-emerald-400');
      audioIcon.classList.add('text-slate-500');
    }
    if (window.lucide) window.lucide.createIcons();
  });


  // ==========================================
  // 2. Navigation Tabs
  // ==========================================
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = `tab-${tab.getAttribute('data-tab')}`;
      
      navTabs.forEach(t => t.classList.remove('active', 'bg-blue-600', 'text-white'));
      tab.classList.add('active', 'bg-blue-600', 'text-white');

      tabContents.forEach(content => {
        if (content.id === targetId) {
          content.classList.remove('hidden');
          content.classList.add('block');
        } else {
          content.classList.add('hidden');
          content.classList.remove('block');
        }
      });
    });
  });


  // ==========================================
  // 3. Live Session State & Bankroll Management
  // ==========================================
  let sessionState = {
    currency: '৳',
    startBankroll: 5000,
    currentBalance: 5000,
    stopLossPct: 30, // 30% loss
    takeProfitPct: 25, // 25% profit
    maxTimeMinutes: 20,
    unitBetMin: 50,
    unitBetMax: 100,
    rounds: [],
    consecutiveLosses: 0,
    consecutiveWins: 0,
    startTime: Date.now(),
    timerInterval: null
  };

  // DOM Elements - Settings
  const inputStartBankroll = document.getElementById('inputStartBankroll');
  const selectCurrency = document.getElementById('selectCurrency');
  const displayUnitBet = document.getElementById('displayUnitBet');
  const rangeStopLoss = document.getElementById('rangeStopLoss');
  const stopLossPctLabel = document.getElementById('stopLossPctLabel');
  const stopLossTargetVal = document.getElementById('stopLossTargetVal');
  const rangeTakeProfit = document.getElementById('rangeTakeProfit');
  const takeProfitPctLabel = document.getElementById('takeProfitPctLabel');
  const takeProfitTargetVal = document.getElementById('takeProfitTargetVal');
  const rangeMaxTime = document.getElementById('rangeMaxTime');
  const sessionMaxTimeLabel = document.getElementById('sessionMaxTimeLabel');
  const applySetupBtn = document.getElementById('applySetupBtn');
  const resetSessionBtn = document.getElementById('resetSessionBtn');

  // DOM Elements - Live Metrics
  const currentBalanceDisplay = document.getElementById('currentBalanceDisplay');
  const bankrollChangeSubtext = document.getElementById('bankrollChangeSubtext');
  const netPnLDisplay = document.getElementById('netPnLDisplay');
  const roiPctDisplay = document.getElementById('roiPctDisplay');
  const winRateDisplay = document.getElementById('winRateDisplay');
  const totalRoundsDisplay = document.getElementById('totalRoundsDisplay');
  const sessionTimerDisplay = document.getElementById('sessionTimerDisplay');
  const sessionRiskStageDisplay = document.getElementById('sessionRiskStageDisplay');
  const headerTimerVal = document.getElementById('headerTimerVal');

  // Live Alert Elements
  const liveAlertBanner = document.getElementById('liveAlertBanner');
  const alertStatusDot = document.getElementById('alertStatusDot');
  const alertStatusBadge = document.getElementById('alertStatusBadge');
  const alertMessageText = document.getElementById('alertMessageText');
  const lossChasingWarningBox = document.getElementById('lossChasingWarningBox');
  const consecutiveLossCountText = document.getElementById('consecutiveLossCountText');
  const streakBadge = document.getElementById('streakBadge');
  const roundHistoryChips = document.getElementById('roundHistoryChips');

  // Action Buttons
  const quickBetAmount = document.getElementById('quickBetAmount');
  const btnLogWin = document.getElementById('btnLogWin');
  const btnLogLoss = document.getElementById('btnLogLoss');
  const winBtnPreviewVal = document.getElementById('winBtnPreviewVal');
  const lossBtnPreviewVal = document.getElementById('lossBtnPreviewVal');
  const customPnLInput = document.getElementById('customPnLInput');
  const btnSubmitCustom = document.getElementById('btnSubmitCustom');
  const btnUndoRound = document.getElementById('btnUndoRound');

  // Mini Floating HUD Elements
  const compactModeBtn = document.getElementById('compactModeBtn');
  const compactMiniHud = document.getElementById('compactMiniHud');
  const closeMiniHudBtn = document.getElementById('closeMiniHudBtn');
  const miniBalance = document.getElementById('miniBalance');
  const miniPnL = document.getElementById('miniPnL');
  const miniBtnWin = document.getElementById('miniBtnWin');
  const miniBtnLoss = document.getElementById('miniBtnLoss');
  const miniAlertText = document.getElementById('miniAlertText');


  // Format Numbers with Currency
  function formatMoney(amount) {
    const sym = sessionState.currency;
    return `${sym} ${Math.round(amount).toLocaleString('en-US')}`;
  }

  // Update Settings calculations
  function updateCalculatedTargets() {
    const start = parseFloat(inputStartBankroll.value) || 5000;
    const cur = selectCurrency.value;
    const slPct = parseInt(rangeStopLoss.value, 10);
    const tpPct = parseInt(rangeTakeProfit.value, 10);
    const maxTime = parseInt(rangeMaxTime.value, 10);

    sessionState.startBankroll = start;
    sessionState.currency = cur;
    sessionState.stopLossPct = slPct;
    sessionState.takeProfitPct = tpPct;
    sessionState.maxTimeMinutes = maxTime;

    // Unit Bet: 1% to 2%
    const unit1 = Math.max(10, Math.round(start * 0.01));
    const unit2 = Math.max(20, Math.round(start * 0.02));
    sessionState.unitBetMin = unit1;
    sessionState.unitBetMax = unit2;

    displayUnitBet.textContent = `${cur} ${unit1} - ${cur} ${unit2}`;
    stopLossPctLabel.textContent = `-${slPct}%`;
    takeProfitPctLabel.textContent = `+${tpPct}%`;
    sessionMaxTimeLabel.textContent = `${maxTime} মিনিট`;

    const stopLossFloor = start * (1 - slPct / 100);
    const takeProfitCeil = start * (1 + tpPct / 100);

    stopLossTargetVal.textContent = `${cur} ${Math.round(stopLossFloor).toLocaleString()}`;
    takeProfitTargetVal.textContent = `${cur} ${Math.round(takeProfitCeil).toLocaleString()}`;

    // Update Quick Bet preview
    const betVal = parseFloat(quickBetAmount.value) || unit1;
    winBtnPreviewVal.textContent = `+${cur}${betVal}`;
    lossBtnPreviewVal.textContent = `-${cur}${betVal}`;

    document.querySelectorAll('.currencyLabel').forEach(el => el.textContent = cur);
    const currDisplay = document.getElementById('currencySymbolDisplay');
    if (currDisplay) currDisplay.textContent = cur;
  }

  inputStartBankroll.addEventListener('input', updateCalculatedTargets);
  selectCurrency.addEventListener('change', updateCalculatedTargets);
  rangeStopLoss.addEventListener('input', updateCalculatedTargets);
  rangeTakeProfit.addEventListener('input', updateCalculatedTargets);
  rangeMaxTime.addEventListener('input', updateCalculatedTargets);
  quickBetAmount.addEventListener('input', updateCalculatedTargets);

  // Apply Setup / Start Fresh
  applySetupBtn.addEventListener('click', () => {
    updateCalculatedTargets();
    sessionState.currentBalance = sessionState.startBankroll;
    sessionState.rounds = [];
    sessionState.consecutiveLosses = 0;
    sessionState.consecutiveWins = 0;
    sessionState.startTime = Date.now();
    startTimer();
    renderLiveDashboard();
    playSound('win');
  });

  resetSessionBtn.addEventListener('click', () => {
    if (confirm('আপনি কি নিশ্চিত যে সম্পূর্ণ সেশন ডেটা রিসেট করতে চান?')) {
      sessionState.currentBalance = sessionState.startBankroll;
      sessionState.rounds = [];
      sessionState.consecutiveLosses = 0;
      sessionState.consecutiveWins = 0;
      sessionState.startTime = Date.now();
      renderLiveDashboard();
    }
  });


  // ==========================================
  // 4. Timer & Time-Decay Warnings
  // ==========================================
  function startTimer() {
    if (sessionState.timerInterval) clearInterval(sessionState.timerInterval);
    sessionState.startTime = Date.now();

    sessionState.timerInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - sessionState.startTime) / 1000);
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      sessionTimerDisplay.textContent = formatted;
      headerTimerVal.textContent = formatted;

      // Risk stage evaluation
      if (minutes >= sessionState.maxTimeMinutes) {
        sessionRiskStageDisplay.textContent = '🚨 সর্বোচ্চ সময়সীমা পার!';
        sessionRiskStageDisplay.className = 'text-[11px] text-rose-400 font-bold mt-0.5 block animate-pulse';
      } else if (minutes >= sessionState.maxTimeMinutes * 0.75) {
        sessionRiskStageDisplay.textContent = '⚠️ সেশন দীর্ঘ হচ্ছে (ঝুঁকি বাড়ছে)';
        sessionRiskStageDisplay.className = 'text-[11px] text-amber-400 font-medium mt-0.5 block';
      } else {
        sessionRiskStageDisplay.textContent = '✅ নিরাপদ খেলার উইন্ডো';
        sessionRiskStageDisplay.className = 'text-[11px] text-emerald-400 font-medium mt-0.5 block';
      }

      checkSessionHealthAlerts();
    }, 1000);
  }

  startTimer();


  // ==========================================
  // 5. Live Round Logging (Win / Loss)
  // ==========================================
  function logRound(pnlChange) {
    const betSize = Math.abs(pnlChange);
    const newBalance = sessionState.currentBalance + pnlChange;
    const isWin = pnlChange > 0;

    sessionState.currentBalance = newBalance;

    if (isWin) {
      sessionState.consecutiveWins++;
      sessionState.consecutiveLosses = 0;
      playSound('win');
    } else {
      sessionState.consecutiveLosses++;
      sessionState.consecutiveWins = 0;
      playSound('loss');
    }

    sessionState.rounds.push({
      id: Date.now(),
      pnl: pnlChange,
      balanceAfter: newBalance,
      isWin,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    renderLiveDashboard();
  }

  btnLogWin.addEventListener('click', () => {
    const bet = parseFloat(quickBetAmount.value) || sessionState.unitBetMin;
    logRound(bet);
  });

  btnLogLoss.addEventListener('click', () => {
    const bet = parseFloat(quickBetAmount.value) || sessionState.unitBetMin;
    logRound(-bet);
  });

  btnSubmitCustom.addEventListener('click', () => {
    const val = parseFloat(customPnLInput.value);
    if (!isNaN(val) && val !== 0) {
      logRound(val);
      customPnLInput.value = '';
    }
  });

  btnUndoRound.addEventListener('click', () => {
    if (sessionState.rounds.length > 0) {
      const last = sessionState.rounds.pop();
      sessionState.currentBalance -= last.pnl;
      // recalculate streaks
      recalcStreaks();
      renderLiveDashboard();
    }
  });

  function recalcStreaks() {
    let lossCount = 0;
    let winCount = 0;
    for (let i = sessionState.rounds.length - 1; i >= 0; i--) {
      const r = sessionState.rounds[i];
      if (r.isWin) {
        if (lossCount === 0) winCount++;
        else break;
      } else {
        if (winCount === 0) lossCount++;
        else break;
      }
    }
    sessionState.consecutiveLosses = lossCount;
    sessionState.consecutiveWins = winCount;
  }


  // ==========================================
  // 6. Live Dashboard & Real-Time Alert Engine
  // ==========================================
  function renderLiveDashboard() {
    const start = sessionState.startBankroll;
    const current = sessionState.currentBalance;
    const netPnL = current - start;
    const roi = ((netPnL / start) * 100).toFixed(1);

    // Update Counter texts
    currentBalanceDisplay.textContent = formatMoney(current);
    bankrollChangeSubtext.textContent = `প্রারম্ভিক: ${formatMoney(start)}`;

    if (netPnL >= 0) {
      netPnLDisplay.textContent = `+${formatMoney(netPnL)}`;
      netPnLDisplay.className = 'text-xl md:text-2xl font-bold font-mono mt-1 text-emerald-400';
      roiPctDisplay.textContent = `ROI: +${roi}% (লাভজনক)`;
      roiPctDisplay.className = 'text-[11px] font-mono mt-0.5 block text-emerald-400';
    } else {
      netPnLDisplay.textContent = `-${formatMoney(Math.abs(netPnL))}`;
      netPnLDisplay.className = 'text-xl md:text-2xl font-bold font-mono mt-1 text-rose-400';
      roiPctDisplay.textContent = `ROI: ${roi}% (ক্ষতি)`;
      roiPctDisplay.className = 'text-[11px] font-mono mt-0.5 block text-rose-400';
    }

    // Win Rate
    const totalRounds = sessionState.rounds.length;
    const winRounds = sessionState.rounds.filter(r => r.isWin).length;
    const winRate = totalRounds > 0 ? ((winRounds / totalRounds) * 100).toFixed(0) : '০';
    winRateDisplay.textContent = `${winRate}%`;
    totalRoundsDisplay.textContent = `${totalRounds} টি রাউন্ড (${winRounds}W / ${totalRounds - winRounds}L)`;

    // History Chips
    renderHistoryChips();

    // Mini Mode Updates
    miniBalance.textContent = formatMoney(current);
    miniPnL.textContent = (netPnL >= 0 ? '+' : '') + formatMoney(netPnL);
    miniPnL.className = netPnL >= 0 ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-rose-400';

    // Health Alerts
    checkSessionHealthAlerts();
  }

  function renderHistoryChips() {
    if (sessionState.rounds.length === 0) {
      roundHistoryChips.innerHTML = '<span class="text-slate-500 italic text-[11px]">এখনো কোনো রাউন্ড রেকর্ড করা হয়নি। উপরে WIN বা LOSS বাটনে চাপুন।</span>';
      streakBadge.textContent = 'স্ট্রিক: নিরপেক্ষ';
      streakBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700';
      return;
    }

    // Show last 12 rounds
    const recent = sessionState.rounds.slice(-12);
    let chipsHtml = '';
    recent.forEach(r => {
      const cls = r.isWin ? 'round-chip-win' : 'round-chip-loss';
      const label = r.isWin ? `+${r.pnl}` : `${r.pnl}`;
      chipsHtml += `<span class="round-chip ${cls}">${label}</span>`;
    });
    roundHistoryChips.innerHTML = chipsHtml;

    // Streak badge
    if (sessionState.consecutiveLosses >= 2) {
      streakBadge.textContent = `🚨 ${sessionState.consecutiveLosses} বার হার (সতর্কতা)`;
      streakBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold';
    } else if (sessionState.consecutiveWins >= 2) {
      streakBadge.textContent = `🔥 ${sessionState.consecutiveWins} বার জয় (স্ট্রিক)`;
      streakBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold';
    } else {
      streakBadge.textContent = 'স্ট্রিক: স্বাভাবিক';
      streakBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700';
    }
  }


  // ==========================================
  // 7. Dynamic Alert Evaluator (The Brain of the Live Assistant)
  // ==========================================
  function checkSessionHealthAlerts() {
    const start = sessionState.startBankroll;
    const current = sessionState.currentBalance;
    const netPnL = current - start;
    const stopLossLimit = start * (1 - sessionState.stopLossPct / 100);
    const takeProfitLimit = start * (1 + sessionState.takeProfitPct / 100);
    const elapsedMinutes = Math.floor((Date.now() - sessionState.startTime) / 60000);

    // Rule 1: STOP LOSS REACHED (CRITICAL)
    if (current <= stopLossLimit) {
      triggerBannerAlert(
        'danger',
        'স্টপ-লস ট্রিগার হয়েছে!',
        `🚨 আপনি পূর্বনির্ধারিত -${sessionState.stopLossPct}% ক্ষতিসীমায় পৌঁছেছেন! এখনই খেলা বন্ধ করুন। লস রিকভার করার চেষ্টা করলে সব খোয়াবেন!`
      );
      miniAlertText.innerHTML = `<span class="text-rose-400 font-bold">🚨 স্টপ-লস ট্রিগার! খেলা বন্ধ করুন!</span>`;
      playSound('alert');
      return;
    }

    // Rule 2: TAKE PROFIT REACHED (GOAL ACHIEVED)
    if (current >= takeProfitLimit) {
      triggerBannerAlert(
        'success',
        'টার্গেট প্রফিট অর্জিত!',
        `🎉 অভিনন্দন! আপনি +${sessionState.takeProfitPct}% লাভ করেছেন (${formatMoney(netPnL)})! ক্যাসিনোর ল অব লার্জ নাম্বার্স কার্যকর হওয়ার আগেই ক্যাশআউট করে টেবিল ছাড়ুন!`
      );
      miniAlertText.innerHTML = `<span class="text-emerald-400 font-bold">🎉 টার্গেট প্রফিট! ক্যাশআউট করুন ও টেবিল ছাড়ুন!</span>`;
      return;
    }

    // Rule 3: CONSECUTIVE LOSSES (CHASING LOSSES ALERT)
    if (sessionState.consecutiveLosses >= 3) {
      lossChasingWarningBox.classList.remove('hidden');
      consecutiveLossCountText.textContent = sessionState.consecutiveLosses;

      triggerBannerAlert(
        'warning',
        'লস চেসিং সতর্কতা',
        `⚠️ পরপর ${sessionState.consecutiveLosses} বার হার! আবেগ নিয়ন্ত্রণ করুন। বাজি বাড়ানোর ভুল করবেন না (No Martingale)!`
      );
      miniAlertText.innerHTML = `<span class="text-amber-400 font-bold">⚠️ ${sessionState.consecutiveLosses}x হার! বাজি দ্বিগুণ করবেন না!</span>`;
      return;
    } else {
      lossChasingWarningBox.classList.add('hidden');
    }

    // Rule 4: MAX TIME EXCEEDED
    if (elapsedMinutes >= sessionState.maxTimeMinutes) {
      triggerBannerAlert(
        'warning',
        'সময়সীমা অতিক্রান্ত',
        `⏰ আপনি ${sessionState.maxTimeMinutes} মিনিটের বেশি খেলছেন। যত বেশিক্ষণ খেলবেন ক্যাসিনোর হাউস এজ তত বেশি আপনাকে গ্রাস করবে। বিরতি নিন!`
      );
      miniAlertText.innerHTML = `<span class="text-amber-400 font-bold">⏰ সেশন সময় শেষ! ক্যাসিনো ছাড়ুন!</span>`;
      return;
    }

    // Default Normal State
    triggerBannerAlert(
      'normal',
      'সেশন নিরাপদ',
      `ব্যাংক রোল ডিসিপ্লিন মেনে খেলুন। প্রতি বাজিতে ${formatMoney(sessionState.unitBetMin)} - ${formatMoney(sessionState.unitBetMax)} এর মধ্যে সীমাবদ্ধ থাকুন।`
    );
    miniAlertText.textContent = `১%-২% রুল মেনে চলুন। স্টপ লসে পৌঁছালে খেলা বন্ধ করুন।`;
  }

  function triggerBannerAlert(type, badgeText, message) {
    alertStatusBadge.textContent = badgeText;
    alertMessageText.textContent = message;

    if (type === 'danger') {
      liveAlertBanner.className = 'bg-rose-950/90 border-b border-rose-600/80 py-2.5 px-4 transition-all duration-300 stop-loss-pulse';
      alertStatusDot.className = 'w-3 h-3 rounded-full bg-rose-500 animate-ping';
      alertStatusBadge.className = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40';
    } else if (type === 'success') {
      liveAlertBanner.className = 'bg-emerald-950/90 border-b border-emerald-600/80 py-2.5 px-4 transition-all duration-300 take-profit-pulse';
      alertStatusDot.className = 'w-3 h-3 rounded-full bg-emerald-400 animate-bounce';
      alertStatusBadge.className = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    } else if (type === 'warning') {
      liveAlertBanner.className = 'bg-amber-950/90 border-b border-amber-600/80 py-2.5 px-4 transition-all duration-300';
      alertStatusDot.className = 'w-3 h-3 rounded-full bg-amber-400 animate-pulse';
      alertStatusBadge.className = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40';
    } else {
      liveAlertBanner.className = 'bg-slate-900 border-b border-slate-800 py-2.5 px-4 transition-all duration-300';
      alertStatusDot.className = 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse';
      alertStatusBadge.className = 'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    }
  }


  // ==========================================
  // 8. Compact Mini Floating HUD Controls
  // ==========================================
  compactModeBtn.addEventListener('click', () => {
    compactMiniHud.classList.toggle('hidden');
  });

  closeMiniHudBtn.addEventListener('click', () => {
    compactMiniHud.classList.add('hidden');
  });

  miniBtnWin.addEventListener('click', () => {
    const bet = parseFloat(quickBetAmount.value) || sessionState.unitBetMin;
    logRound(bet);
  });

  miniBtnLoss.addEventListener('click', () => {
    const bet = parseFloat(quickBetAmount.value) || sessionState.unitBetMin;
    logRound(-bet);
  });


  // ==========================================
  // 9. Crash / Aviator Math Radar Engine
  // ==========================================
  const crashMultiplierSlider = document.getElementById('crashMultiplierSlider');
  const crashMultiplierVal = document.getElementById('crashMultiplierVal');
  const crashWinChanceText = document.getElementById('crashWinChanceText');
  const crashRiskChanceText = document.getElementById('crashRiskChanceText');
  const crashRiskAssessmentBox = document.getElementById('crashRiskAssessmentBox');
  const crashRiskCategoryTitle = document.getElementById('crashRiskCategoryTitle');
  const crashRiskAdviceText = document.getElementById('crashRiskAdviceText');
  const crashEVText = document.getElementById('crashEVText');
  const crashPresetBtns = document.querySelectorAll('.crashPresetBtn');

  function calculateCrashProbabilities(multiplier) {
    // Standard Crash Game RTP is 97% (House Edge 3%), plus ~3% insta-crash at 1.00x
    const rtp = 0.97;
    let winProb = (rtp / multiplier) * 100;
    if (winProb > 97) winProb = 97;
    const crashRisk = 100 - winProb;

    // Expected value on a 100 bet: (winProb/100 * multiplier * 100) - 100 = -3
    const ev = (winProb / 100 * multiplier * 100) - 100;

    crashMultiplierVal.textContent = `${multiplier.toFixed(2)}x`;
    crashWinChanceText.textContent = `${winProb.toFixed(1)}%`;
    crashRiskChanceText.textContent = `${crashRisk.toFixed(1)}%`;
    crashEVText.textContent = `${ev.toFixed(1)} ৳ প্রতি ১০০ ৳ বাজিতে (হাউস এজ ৩%)`;

    // Dynamic advice and risk meter
    if (multiplier <= 1.30) {
      crashRiskCategoryTitle.textContent = 'ঝুঁকি স্তর: মাইক্রো / তুলনামূলক নিরাপদ';
      crashRiskCategoryTitle.className = 'text-emerald-400 font-bold';
      crashRiskAssessmentBox.className = 'p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs';
      crashRiskAdviceText.textContent = `জেতার সম্ভাবনা প্রায় ${(winProb).toFixed(0)}%। ছোট প্রফিট নিয়ে উঠে যাওয়ার জন্য ১.১০x থেকে ১.৩০x অটো-ক্যাশআউট সবচেয়ে বাস্তবসম্মত কৌশল। তবে প্রতি রাউন্ডেই ৩% ইনস্ট্যান্ট ক্র্যাশের ঝুঁকি রয়ে যায়।`;
    } else if (multiplier <= 2.00) {
      crashRiskCategoryTitle.textContent = 'ঝুঁকি স্তর: মাঝারি (৫০% এর বেশি ক্র্যাশ রেট)';
      crashRiskCategoryTitle.className = 'text-amber-400 font-bold';
      crashRiskAssessmentBox.className = 'p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs';
      crashRiskAdviceText.textContent = `২.০০x মাল্টিপ্লায়ারে জেতার সম্ভাবনা মাত্র ৪৮.৫% (অর্থাৎ প্রতি ১০০ বারে ৫১ বারই এর নিচে ক্র্যাশ করে)। টানা ৩-৪ বার লসের সম্ভাবনা অত্যন্ত প্রবল।`;
    } else if (multiplier <= 5.00) {
      crashRiskCategoryTitle.textContent = 'ঝুঁকি স্তর: উচ্চ ঝুঁকি (৮০% এর বেশি ক্র্যাশ)';
      crashRiskCategoryTitle.className = 'text-rose-400 font-bold';
      crashRiskAssessmentBox.className = 'p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs';
      crashRiskAdviceText.textContent = `৫.০০x মাল্টিপ্লায়ারে আপনার জেতার সম্ভাবনা মাত্র ১৯.৪%, অর্থাৎ ৮০% এর বেশি সময়ে আপনার সম্পূর্ণ বাজি পুড়ে যাবে। এটি দিয়ে নিয়মিত লাভের আশা করা অসম্ভব।`;
    } else {
      crashRiskCategoryTitle.textContent = 'ঝুঁকি স্তর: চরম ফাঁদ (৯১% নিশ্চিত লস)';
      crashRiskCategoryTitle.className = 'text-red-400 font-bold';
      crashRiskAssessmentBox.className = 'p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-xs';
      crashRiskAdviceText.textContent = `১০.০০x এর জন্য অপেক্ষা করা মানে নিজের চোখে লটারির মতো টিকিট কেনা। ৯০% এর বেশি ক্ষেত্রে রকেট আগেই ধ্বংস হয়ে যায়। টেলিগ্রামের "১০x প্রেডিক্টর" ফেক স্ক্রিনশট দেখে বিভ্রান্ত হবেন না!`;
    }
  }

  crashMultiplierSlider.addEventListener('input', (e) => {
    calculateCrashProbabilities(parseFloat(e.target.value));
  });

  crashPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const m = parseFloat(btn.getAttribute('data-mult'));
      crashMultiplierSlider.value = m;
      calculateCrashProbabilities(m);
    });
  });

  calculateCrashProbabilities(1.50);


  // ==========================================
  // 10. Blackjack Basic Strategy Engine
  // ==========================================
  const dealerCardButtons = document.querySelectorAll('.dealer-card-btn');
  const handTypeButtons = document.querySelectorAll('.hand-type-btn');
  const playerHandValuesGrid = document.getElementById('playerHandValuesGrid');
  const bjActionText = document.getElementById('bjActionText');
  const bjActionExplanation = document.getElementById('bjActionExplanation');
  const bjDecisionBox = document.getElementById('bjDecisionBox');
  const bjSummaryPlayer = document.getElementById('bjSummaryPlayer');
  const bjSummaryDealer = document.getElementById('bjSummaryDealer');

  let selectedDealerCard = '2';
  let selectedHandType = 'hard';
  let selectedPlayerHand = '12';

  const handOptions = {
    hard: ['5-8', '9', '10', '11', '12', '13', '14', '15', '16', '17+'],
    soft: ['A,2', 'A,3', 'A,4', 'A,5', 'A,6', 'A,7', 'A,8', 'A,9+'],
    pairs: ['2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10', 'A,A']
  };

  function renderPlayerHandButtons() {
    playerHandValuesGrid.innerHTML = '';
    const options = handOptions[selectedHandType];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = `player-hand-btn py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white border border-slate-700 ${opt === selectedPlayerHand ? 'active' : ''}`;
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.player-hand-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPlayerHand = opt;
        evaluateBlackjackStrategy();
      });
      playerHandValuesGrid.appendChild(btn);
    });
  }

  dealerCardButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dealerCardButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDealerCard = btn.getAttribute('data-val');
      evaluateBlackjackStrategy();
    });
  });

  handTypeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handTypeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedHandType = btn.getAttribute('data-type');
      selectedPlayerHand = handOptions[selectedHandType][0];
      renderPlayerHandButtons();
      evaluateBlackjackStrategy();
    });
  });

  renderPlayerHandButtons();

  function evaluateBlackjackStrategy() {
    const d = selectedDealerCard;
    const p = selectedPlayerHand;
    const isDealerBustCard = ['4', '5', '6'].includes(d);
    const isDealerWeak = ['2', '3', '4', '5', '6'].includes(d);
    const isDealerStrong = ['7', '8', '9', '10', 'A'].includes(d);

    let action = 'HIT';
    let explanation = '';
    let badgeColor = 'emerald';

    if (selectedHandType === 'hard') {
      if (['5-8'].includes(p)) {
        action = 'HIT (হিট নিন)';
        explanation = 'আপনার স্কোর খুবই কম। কখনোই বাস্ট হবেন না, তাই কার্ড টানা আবশ্যক।';
      } else if (p === '9') {
        if (['3', '4', '5', '6'].includes(d)) {
          action = 'DOUBLE (ডাবল ডাউন করুন)';
          explanation = 'ডিলারের কার্ড দুর্বল। ডাবল বাজি ধরে ১টি কার্ড নেওয়াই সর্বোচ্চ লাভজনক গাণিতিক মুভ।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের স্ট্রং কার্ডের বিরুদ্ধে বাজি না বাড়িয়ে সাধারণ হিট নিন।';
        }
      } else if (p === '10') {
        if (['2', '3', '4', '5', '6', '7', '8', '9'].includes(d)) {
          action = 'DOUBLE (ডাবল ডাউন করুন)';
          explanation = '১০ স্কোর নিয়ে ডাবল করা ব্ল্যাকজ্যাকের অন্যতম সেরা সম্ভাবনাময় চাল।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের ১০ বা A আছে, তাই বাজি দ্বিগুণ না করে হিট নিন।';
        }
      } else if (p === '11') {
        if (d !== 'A') {
          action = 'DOUBLE (ডাবল ডাউন করুন)';
          explanation = '১১ স্কোরে সবসময় ডাবল ডাউন সেরা, কারণ ১০ পয়েন্ট কার্ডের সংখ্যা ডেক-এ সবচেয়ে বেশি।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের A থাকলে ডাবল না করে হিট নেওয়া নিরাপদ।';
        }
      } else if (p === '12') {
        if (['4', '5', '6'].includes(d)) {
          action = 'STAND (স্ট্যান্ড / থামুন)';
          explanation = 'ডিলারের ৪, ৫ বা ৬ কার্ড বাস্ট হওয়ার সম্ভাবনা ৪০% এর বেশি। নিজে বাস্ট না হয়ে ডিলারের ভুলের সুযোগ নিন।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের ২, ৩ অথবা ৭+ আছে। ১২ পয়েন্টে বাস্ট হওয়ার ঝুঁকি মেনেও হিট নেওয়াই অংকের নিয়ম।';
        }
      } else if (['13', '14', '15', '16'].includes(p)) {
        if (isDealerWeak) {
          action = 'STAND (স্ট্যান্ড / থামুন)';
          explanation = 'ডিলার দুর্বল জোনে আছে (২ থেকে ৬)। আপনি অতিরিক্ত কার্ড নিয়ে বাস্ট হবেন না। ডিলারকে বাস্ট হতে দিন।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের ৭ বা তার বেশি আছে। আপনি দাঁড়িয়ে থাকলে ডিলার নিশ্চিতভাবে জিতবে, তাই হিট নিয়ে ঝুঁকি নেওয়া বাধ্যতামূলক।';
        }
      } else { // 17+
        action = 'STAND (স্ট্যান্ড / থামুন)';
        explanation = '১৭ বা তার বেশি হলে কখনোই হিট নেবেন না। বাস্ট হওয়ার সম্ভাবনা ৭০% এর বেশি।';
      }
    } else if (selectedHandType === 'soft') {
      if (['A,2', 'A,3'].includes(p)) {
        if (['5', '6'].includes(d)) { action = 'DOUBLE (ডাবল ডাউন)'; explanation = 'ডিলারের দুর্বল ৫ ও ৬ এর বিপরীতে সফট হ্যান্ড ডাবল করা সেরা।'; }
        else { action = 'HIT (হিট নিন)'; explanation = 'স্কোর কম, অতিরিক্ত কার্ড টানুন। বাস্ট হওয়ার কোনো ভয় নেই।'; }
      } else if (['A,4', 'A,5'].includes(p)) {
        if (['4', '5', '6'].includes(d)) { action = 'DOUBLE (ডাবল ডাউন)'; explanation = 'ডিলারের ৪, ৫ বা ৬ এর বিপরীতে ডাবল করুন।'; }
        else { action = 'HIT (হিট নিন)'; explanation = 'হিট নিন। আপনার হাতের A আপনাকে বাস্ট হওয়া থেকে রক্ষা করবে।'; }
      } else if (p === 'A,6') {
        if (['3', '4', '5', '6'].includes(d)) { action = 'DOUBLE (ডাবল ডাউন)'; explanation = 'সফট ১৭ নিয়ে ডাবল করা গাণিতিকভাবে অত্যন্ত লাভজনক।'; }
        else { action = 'HIT (হিট নিন)'; explanation = 'সাধারণ হিট নিয়ে স্কোর উন্নত করার চেষ্টা করুন।'; }
      } else if (p === 'A,7') {
        if (['3', '4', '5', '6'].includes(d)) { action = 'DOUBLE (ডাবল ডাউন)'; explanation = 'ডিলারের দুর্বল কার্ডের বিপরীতে সফট ১৮ ডাবল করুন।'; }
        else if (['2', '7', '8'].includes(d)) { action = 'STAND (স্ট্যান্ড)'; explanation = 'সফট ১৮ যথেষ্ট ভালো স্কোর। দাঁড়িয়ে যান।'; }
        else { action = 'HIT (হিট নিন)'; explanation = 'ডিলারের ৯, ১০ বা A এর বিরুদ্ধে ১৮ স্কোর নিয়ে জেতার সম্ভাবনা কম, তাই হিট নিন।'; }
      } else { // A,8 or A,9+
        action = 'STAND (স্ট্যান্ড / থামুন)';
        explanation = 'সফট ১৯ বা ২০ নিয়ে সবসময় স্ট্যান্ড করুন।';
      }
    } else { // Pairs
      if (['A,A', '8,8'].includes(p)) {
        action = 'SPLIT (স্প্লিট করুন)';
        explanation = 'ব্ল্যাকজ্যাকের সুবর্ণ নিয়ম: ৮ ও Ace জোড়া সবসময় স্প্লিট করতে হয়! কখনোই একসাথে রাখবেন না।';
      } else if (p === '10,10') {
        action = 'STAND (কখনই স্প্লিট করবেন না!)';
        explanation = 'আপনার হাতে অলরেডি ২০ পয়েন্ট আছে! এটি ভেঙে দুটি দুর্বল হাতে পরিণত করবেন না। স্ট্যান্ড করুন।';
      } else if (p === '5,5') {
        if (['2', '3', '4', '5', '6', '7', '8', '9'].includes(d)) {
          action = 'DOUBLE (ডাবল করুন, স্প্লিট নয়)';
          explanation = '৫ এর জোড়া মানে আপনার হাত ১০। এটাকে স্প্লিট না করে ডাবল ডাউন করুন।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'হিট নিন।';
        }
      } else if (['2,2', '3,3', '7,7'].includes(p)) {
        if (['2', '3', '4', '5', '6', '7'].includes(d)) {
          action = 'SPLIT (স্প্লিট করুন)';
          explanation = 'ডিলারের ৭ বা তার নিচে থাকলে জোড়া স্প্লিট করুন।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'ডিলারের ৮ বা বেশি থাকলে স্প্লিট না করে হিট নিন।';
        }
      } else if (p === '9,9') {
        if (['7', '10', 'A'].includes(d)) {
          action = 'STAND (স্ট্যান্ড)';
          explanation = 'ডিলারের ৭ থাকলে ১৮ দিয়ে জেতার সম্ভাবনা বেশি। ডিলারের ১০ বা A থাকলেও স্ট্যান্ড নিরাপদ।';
        } else {
          action = 'SPLIT (স্প্লিট করুন)';
          explanation = 'ডিলারের অন্যান্য সব কার্ডের বিপরীতে ৯ এর জোড়া স্প্লিট করুন।';
        }
      } else {
        if (isDealerBustCard) {
          action = 'SPLIT (স্প্লিট করুন)';
          explanation = 'ডিলারের দুর্বল কার্ডের বিরুদ্ধে স্প্লিট করে দুটি পৃথক হাত খেলুন।';
        } else {
          action = 'HIT (হিট নিন)';
          explanation = 'স্প্লিট না করে সাধারণ হিট নিন।';
        }
      }
    }

    bjActionText.textContent = action;
    bjActionExplanation.textContent = explanation;
    bjSummaryPlayer.textContent = p;
    bjSummaryDealer.textContent = d;

    if (action.includes('DOUBLE')) {
      bjActionText.className = 'text-3xl md:text-4xl font-black font-mono tracking-wider text-amber-400 my-2';
      bjDecisionBox.className = 'rounded-2xl p-6 border text-center transition-all duration-300 bg-amber-950/30 border-amber-500/40';
    } else if (action.includes('STAND')) {
      bjActionText.className = 'text-3xl md:text-4xl font-black font-mono tracking-wider text-blue-400 my-2';
      bjDecisionBox.className = 'rounded-2xl p-6 border text-center transition-all duration-300 bg-blue-950/30 border-blue-500/40';
    } else if (action.includes('SPLIT')) {
      bjActionText.className = 'text-3xl md:text-4xl font-black font-mono tracking-wider text-purple-400 my-2';
      bjDecisionBox.className = 'rounded-2xl p-6 border text-center transition-all duration-300 bg-purple-950/30 border-purple-500/40';
    } else {
      bjActionText.className = 'text-3xl md:text-4xl font-black font-mono tracking-wider text-emerald-400 my-2';
      bjDecisionBox.className = 'rounded-2xl p-6 border text-center transition-all duration-300 bg-emerald-950/30 border-emerald-500/40';
    }
  }

  evaluateBlackjackStrategy();


  // ==========================================
  // 11. Roulette Gambler's Fallacy Slider
  // ==========================================
  const rouletteStreakSlider = document.getElementById('rouletteStreakSlider');
  const rouletteStreakVal = document.getElementById('rouletteStreakVal');

  if (rouletteStreakSlider) {
    rouletteStreakSlider.addEventListener('input', (e) => {
      rouletteStreakVal.textContent = `${e.target.value} বার`;
    });
  }


  // ==========================================
  // 12. Martingale Death Simulator Engine
  // ==========================================
  const mgBaseBet = document.getElementById('mgBaseBet');
  const mgBankroll = document.getElementById('mgBankroll');
  const runMartingaleSimBtn = document.getElementById('runMartingaleSimBtn');
  const martingaleTableBody = document.getElementById('martingaleTableBody');
  const martingaleVerdictBox = document.getElementById('martingaleVerdictBox');

  function runMartingaleSimulation() {
    const base = parseFloat(mgBaseBet.value) || 100;
    const bankroll = parseFloat(mgBankroll.value) || 5000;

    let html = '';
    let totalRisked = 0;
    let wipeoutRound = null;

    for (let r = 1; r <= 8; r++) {
      const requiredBet = base * Math.pow(2, r - 1);
      totalRisked += requiredBet;
      const isBankrupt = totalRisked > bankroll;

      if (isBankrupt && wipeoutRound === null) {
        wipeoutRound = r;
      }

      const rowClass = isBankrupt ? 'bg-red-950/40 text-red-300 font-bold' : '';

      html += `
        <tr class="${rowClass}">
          <td class="p-2.5">রাউন্ড #${r} ${isBankrupt ? '💥 (দেউলিয়া)' : ''}</td>
          <td class="p-2.5">৳ ${requiredBet.toLocaleString()}</td>
          <td class="p-2.5">৳ ${totalRisked.toLocaleString()}</td>
          <td class="p-2.5 text-emerald-400">+৳ ${base.toLocaleString()}</td>
        </tr>
      `;
    }

    martingaleTableBody.innerHTML = html;

    if (wipeoutRound !== null) {
      martingaleVerdictBox.innerHTML = `
        <strong>💥 গাণিতিক রায়:</strong> আপনার ৳ ${bankroll.toLocaleString()} ব্যাংক রোল দিয়ে মাত্র <strong>${wipeoutRound}টি ধারাবাহিক লস</strong> হলেই আপনি ১ পয়সাও ফেরত পাবেন না। মাত্র ৳ ${base} লাভ করার জন্য আপনাকে ৳ ${(base * Math.pow(2, wipeoutRound - 1)).toLocaleString()} বাজি ধরতে হতো, যা অসম্ভব! ক্যাসিনোতে পরপর ৬-৭ বার ভুল হওয়া খুবই সাধারণ ঘটনা।
      `;
    } else {
      martingaleVerdictBox.innerHTML = `
        <strong>⚠️ সতর্কতা:</strong> টেবিলের বাজি সীমা (Table Maximum Limit) থাকে, যার কারণে ৮-৯ বারের বেশি ডাবল করা ক্যাসিনো কর্তৃপক্ষ এমনিতেই নিষিদ্ধ করে রাখে। তাই মার্টিঙ্গেল ১০০% আত্মঘাতী।
      `;
    }
  }

  runMartingaleSimBtn.addEventListener('click', runMartingaleSimulation);
  runMartingaleSimulation();

  // Initial update
  updateCalculatedTargets();
  renderLiveDashboard();
});
