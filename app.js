// ── SUPABASE ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://enharhoobrptpjctntko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuaGFyaG9vYnJwdHBqY3RudGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTM4NDksImV4cCI6MjA4ODYyOTg0OX0.hE-GC9DSugftfndo3-vJ-O-rcE7wXS4fWLQmlhqNdSs";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CAPITAL = 100000;

// ── STATE ─────────────────────────────────────────────────────────────────
let trades      = [];
let filterOut   = "All";
let filterDir   = "All";
let searchQ     = "";
let editingId   = null;
let calYear, calMonth;

// ── BOOT ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();

  setupNav();
  setupModal();
  setupCalendarNav();
  setupFilters();
  await loadTrades();
});

// ── DATA ──────────────────────────────────────────────────────────────────
async function loadTrades() {
  const { data, error } = await db
    .from("trades")
    .select("*")
    .order("date", { ascending: false });

  if (error) { console.error(error); return; }
  trades = data || [];
  renderAll();
}

function renderAll() {
  renderSidebarBalance();
  renderDashboard();
  renderGallery();
  renderList();
  renderCalendar();
  renderStats();
}

// ── STATS CALCULATION ─────────────────────────────────────────────────────
/*
  RULES:
  - Win Rate   = wins / (wins + losses)   — breakeven excluded from rate
  - Profit Factor = gross wins / gross losses — breakeven trades excluded
  - Breakeven trades count toward totals but not win/loss calculations
  - If no losses exist yet, Profit Factor = gross wins / 0 → shown as "∞"
  - Avg Win / Avg Loss only use winning / losing trades respectively
*/
function calcStats(subset) {
  // Only count trades that have an outcome and pnl
  const closed = subset.filter(t =>
    ["Win", "Loss", "Breakeven"].includes(t.outcome)
  );
  if (!closed.length) return null;

  const wins = closed.filter(t => t.outcome === "Win");
  const losses = closed.filter(t => t.outcome === "Loss");
  const bes    = closed.filter(t => t.outcome === "Breakeven");

  // P&L sums
  const totalPnl  = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossWin  = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));

  // Win rate: wins vs (wins + losses), breakeven not counted
  const decisiveTrades = wins.length + losses.length;
  const winRate = decisiveTrades > 0
    ? (wins.length / decisiveTrades) * 100
    : null; // not enough data

  // Averages
  const avgWin  = wins.length   ? grossWin  / wins.length   : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  // Profit factor: if no losses yet, use Infinity
  let profitFactor;
  if (grossLoss === 0 && grossWin === 0) profitFactor = null;
  else if (grossLoss === 0)              profitFactor = Infinity;
  else                                   profitFactor = grossWin / grossLoss;

  // R:R
  const rr = avgLoss > 0 ? avgWin / avgLoss : null;

  // Expected value per trade
  const ev = winRate !== null
    ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
    : null;

  // Net %
  const netPct = (totalPnl / CAPITAL) * 100;

  // Largest trades
  const sortByPnl = [...closed].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const largestWin  = wins.length   ? wins.reduce((b, t) => (t.pnl > b.pnl ? t : b)).pnl   : null;
  const largestLoss = losses.length ? losses.reduce((b, t) => (t.pnl < b.pnl ? t : b)).pnl : null;

  // Drawdown — walk trades chronologically (oldest first)
  const chrono = [...closed].reverse();
  let peak = CAPITAL, bal = CAPITAL, maxDD = 0, maxDDpct = 0;
  chrono.forEach(t => {
    bal += (t.pnl || 0);
    if (bal > peak) peak = bal;
    const dd    = peak - bal;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDD) { maxDD = dd; maxDDpct = ddPct; }
  });

  // Consecutive streaks (chronological)
  let maxCW = 0, maxCL = 0, cW = 0, cL = 0;
  chrono.forEach(t => {
    if      (t.outcome === "Win")  { cW++; cL = 0; if (cW > maxCW) maxCW = cW; }
    else if (t.outcome === "Loss") { cL++; cW = 0; if (cL > maxCL) maxCL = cL; }
    else                           { cW = 0; cL = 0; } // breakeven resets streak
  });

  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: bes.length,
    decisiveTrades,
    winRate,
    totalPnl, netPct,
    avgPnl: totalPnl / closed.length,
    grossWin, grossLoss,
    avgWin, avgLoss,
    profitFactor, rr, ev,
    largestWin, largestLoss,
    largestWinPct:  largestWin  !== null ? (largestWin  / CAPITAL) * 100 : null,
    largestLossPct: largestLoss !== null ? (largestLoss / CAPITAL) * 100 : null,
    maxDD, maxDDpct,
    currentBalance: CAPITAL + totalPnl,
    totalReturn: netPct,
    maxConsecWins: maxCW,
    maxConsecLosses: maxCL,
  };
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────
function f$(v) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const sign = v >= 0 ? "+$" : "-$";
  return sign + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fPct(v, decimals = 1) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

function fNum(v, d = 2) {
  if (v === null || v === undefined) return "—";
  if (!isFinite(v)) return "∞";
  return v.toFixed(d);
}

function pnlClass(pnl) {
  if (pnl === null || pnl === undefined) return "pnl-neu";
  return pnl > 0 ? "pnl-pos" : pnl < 0 ? "pnl-neg" : "pnl-neu";
}

function outcomeClass(o) {
  if (o === "Win")  return "win";
  if (o === "Loss") return "loss";
  return "be";
}

function badgeDir(d) {
  return d === "Long" ? "long" : "short";
}

// ── SIDEBAR BALANCE ───────────────────────────────────────────────────────
function renderSidebarBalance() {
  const totalPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const balance   = CAPITAL + totalPnl;
  const changePct = (totalPnl / CAPITAL) * 100;
  const sign      = totalPnl >= 0 ? "+" : "";

  document.getElementById("sidebarBalance").textContent =
    "$" + balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const el = document.getElementById("sidebarChange");
  el.textContent = `${sign}$${Math.abs(totalPnl).toFixed(2)} · ${sign}${changePct.toFixed(2)}%`;
  el.style.color = totalPnl >= 0 ? "var(--win)" : "var(--loss)";
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function renderDashboard() {
  const total = trades.length;
  document.getElementById("dashSub").textContent =
    `${total} trade${total !== 1 ? "s" : ""} · $100,000 starting capital`;

  const s = calcStats(trades);

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    el.textContent = val;
    if (color) el.style.color = color;
    else el.style.color = "";
  };

  if (!s) {
    set("statWinRate", "—"); set("statNetPnl", "—");
    set("statPF", "—"); set("statRR", "—"); set("statDD", "—");
    document.getElementById("statWinRateSub").textContent = "No trades yet";
    document.getElementById("statNetPnlSub").textContent = "0.00% return";
    document.getElementById("statDDSub").textContent = "—";
    renderRecentList([]);
    return;
  }

  // Win Rate — only if we have decisive trades
  if (s.winRate !== null) {
    set("statWinRate", s.winRate.toFixed(1) + "%", s.winRate >= 50 ? "var(--win)" : "var(--loss)");
    document.getElementById("statWinRateSub").textContent =
      `${s.wins}W · ${s.losses}L${s.breakeven ? ` · ${s.breakeven}BE` : ""}`;
  } else {
    set("statWinRate", "—");
    document.getElementById("statWinRateSub").textContent = "Need win + loss data";
  }

  // Net P&L
  set("statNetPnl", f$(s.totalPnl), s.totalPnl >= 0 ? "var(--win)" : "var(--loss)");
  document.getElementById("statNetPnlSub").textContent = fPct(s.netPct) + " return";

  // Profit Factor
  if (s.profitFactor === null) {
    set("statPF", "—");
  } else if (!isFinite(s.profitFactor)) {
    set("statPF", "∞", "var(--win)"); // all wins, no losses yet
  } else {
    set("statPF", fNum(s.profitFactor),
      s.profitFactor >= 1.5 ? "var(--win)" : s.profitFactor >= 1 ? "var(--be)" : "var(--loss)");
  }

  // R:R
  set("statRR", s.rr !== null ? fNum(s.rr) + "R" : "—");

  // Max Drawdown
  set("statDD", fPct(-s.maxDDpct), s.maxDDpct < 10 ? "var(--win)" : s.maxDDpct < 20 ? "var(--be)" : "var(--loss)");
  document.getElementById("statDDSub").textContent = f$(-s.maxDD);

  renderRecentList(trades.slice(0, 7));
}

function renderRecentList(list) {
  const el = document.getElementById("recentTradesList");
  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No trades yet</div>
        <div class="empty-body">Log your first trade to start tracking</div>
        <button class="btn-primary" onclick="openModal()">Log First Trade</button>
      </div>`;
    return;
  }
  el.innerHTML = list.map(t => `
    <div class="recent-row">
      <span class="badge badge-${outcomeClass(t.outcome)}">${t.outcome}</span>
      <span class="recent-pair">${t.pair || "—"}</span>
      <span class="badge badge-${badgeDir(t.direction)}">${t.direction || ""}</span>
      <span class="recent-meta">${t.strategy || ""}</span>
      <span class="recent-meta">${t.date || ""}</span>
      ${t.exit_reason ? `<span class="badge badge-neutral">${t.exit_reason}</span>` : ""}
      <span class="recent-pnl ${pnlClass(t.pnl)}" style="margin-left:auto">${f$(t.pnl)}</span>
    </div>`).join("");
}

// ── GALLERY ───────────────────────────────────────────────────────────────
function renderGallery() {
  const list = getFiltered();
  const grid = document.getElementById("galleryGrid");

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🖼️</div>
      <div class="empty-title">No trades found</div>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(t => `
    <div class="trade-card" onclick="openModal('${t.id}')">
      <div class="card-img">
        ${t.screenshot_url
          ? `<img src="${t.screenshot_url}" alt="chart" loading="lazy" />`
          : `<span class="no-img">No screenshot</span>`}
        <span class="card-badge badge badge-${outcomeClass(t.outcome)}">${t.outcome}</span>
      </div>
      <div class="card-body">
        <div class="card-pair">${t.pair || "—"}</div>
        <div class="card-meta">${[t.date, t.day, t.time_entered, t.duration].filter(Boolean).join(" · ")}</div>
        <div class="card-tags">
          ${t.direction ? `<span class="badge badge-${badgeDir(t.direction)}">${t.direction}</span>` : ""}
          ${t.exit_reason ? `<span class="badge badge-neutral">${t.exit_reason}</span>` : ""}
          ${t.strategy ? `<span class="badge badge-strat">${t.strategy}</span>` : ""}
        </div>
        <div class="card-pnl ${pnlClass(t.pnl)}">${f$(t.pnl)}</div>
      </div>
      <div class="card-footer">
        <button class="card-delete" onclick="event.stopPropagation(); confirmDelete('${t.id}')">Delete</button>
      </div>
    </div>`).join("");
}

// ── LIST ──────────────────────────────────────────────────────────────────
function renderList() {
  const tbody = document.getElementById("listBody");
  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">No trades logged yet</td></tr>`;
    return;
  }
  tbody.innerHTML = trades.map(t => `
    <tr>
      <td class="td-pair">${t.pair || "—"}</td>
      <td><span class="badge badge-${outcomeClass(t.outcome)}">${t.outcome}</span></td>
      <td>${t.date || "—"}</td>
      <td>${t.day || "—"}</td>
      <td>${t.time_entered || "—"}</td>
      <td>${t.duration || "—"}</td>
      <td><span class="badge badge-${badgeDir(t.direction)}">${t.direction || "—"}</span></td>
      <td><span class="badge badge-strat">${t.strategy || "—"}</span></td>
      <td><span class="badge badge-neutral">${t.exit_reason || "—"}</span></td>
      <td class="td-pnl ${pnlClass(t.pnl)}">${f$(t.pnl)}</td>
      <td><div class="td-actions">
        <button class="btn-sm" onclick="openModal('${t.id}')">Edit</button>
        <button class="btn-danger" onclick="confirmDelete('${t.id}')">Del</button>
      </div></td>
    </tr>`).join("");
}

// ── CALENDAR ──────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  document.getElementById("calMonthSelect").value = calMonth;
  document.getElementById("calYearSelect").value  = calYear;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  trades.forEach(t => {
    if (!t.date) return;
    const [y, m, d] = t.date.split("-").map(Number);
    if (y === calYear && m - 1 === calMonth) {
      if (!dayMap[d]) dayMap[d] = { pnl: 0, count: 0 };
      dayMap[d].pnl   += (t.pnl || 0);
      dayMap[d].count += 1;
    }
  });

  let html = "";
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell blank"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const data = dayMap[d];
    const cls  = data ? (data.pnl >= 0 ? "win-day" : "loss-day") : "";
    const pnlColor = data ? (data.pnl >= 0 ? "var(--win)" : "var(--loss)") : "";
    const sign = data && data.pnl >= 0 ? "+" : "";
    html += `
      <div class="cal-cell ${cls}">
        <div class="cal-num">${d}</div>
        ${data ? `
          <div class="cal-pnl" style="color:${pnlColor}">${sign}$${Math.abs(data.pnl).toFixed(0)}</div>
          <div class="cal-count">${data.count} trade${data.count > 1 ? "s" : ""}</div>
        ` : ""}
      </div>`;
  }
  document.getElementById("calGrid").innerHTML = html;
}

function setupCalendarNav() {
  // populate year dropdown 2000 → current year + 2
  const yearSel = document.getElementById("calYearSelect");
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 2; y >= 2000; y--) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    yearSel.appendChild(opt);
  }

  document.getElementById("calMonthSelect").addEventListener("change", e => {
    calMonth = parseInt(e.target.value);
    renderCalendar();
  });
  document.getElementById("calYearSelect").addEventListener("change", e => {
    calYear = parseInt(e.target.value);
    renderCalendar();
  });
}

// ── STATS TABLE ───────────────────────────────────────────────────────────
function renderStats() {
  const el = document.getElementById("statsWrap");
  document.getElementById("statsSub").textContent =
    `Auto-calculated from ${trades.length} trades · $100,000 starting capital`;

  if (!trades.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Log trades to see stats</div></div>`;
    return;
  }

  const all   = calcStats(trades);
  const longs = calcStats(trades.filter(t => t.direction === "Long"));
  const shorts= calcStats(trades.filter(t => t.direction === "Short"));

  // Helper: render one cell
  const cell = (s, fn) => {
    if (!s) return `<td style="color:var(--text-soft)">—</td>`;
    try { const v = fn(s); return `<td>${v ?? "—"}</td>`; }
    catch { return `<td style="color:var(--text-soft)">—</td>`; }
  };

  const row = (label, fn) =>
    `<tr><td>${label}</td>${cell(all,fn)}${cell(longs,fn)}${cell(shorts,fn)}</tr>`;

  const sec = (label) =>
    `<tr class="stats-section"><td colspan="4">${label}</td></tr>`;

  // Win rate display with note about breakeven
  const wrDisplay = (s) => {
    if (s.winRate === null) return "—";
    return s.winRate.toFixed(1) + "%";
  };

  const pfDisplay = (s) => {
    if (s.profitFactor === null) return "—";
    if (!isFinite(s.profitFactor)) return "∞";
    return fNum(s.profitFactor);
  };

  el.innerHTML = `
    <div class="stats-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>All Trades</th>
            <th>Long</th>
            <th>Short</th>
          </tr>
        </thead>
        <tbody>
          ${sec("Trade Summary")}
          ${row("Total Trades", s => s.total)}
          ${row("Winning Trades", s => s.wins)}
          ${row("Losing Trades", s => s.losses)}
          ${row("Breakeven Trades", s => s.breakeven)}
          ${row("Decisive Trades (W+L)", s => s.decisiveTrades)}
          ${row("Win Rate % (W ÷ W+L, excl. BE)", s => wrDisplay(s))}
          ${row("Max Consecutive Wins", s => s.maxConsecWins)}
          ${row("Max Consecutive Losses", s => s.maxConsecLosses)}

          ${sec("P&L Metrics")}
          ${row("Net P&L ($)", s => f$(s.totalPnl))}
          ${row("Net P&L (%)", s => fPct(s.netPct))}
          ${row("Avg P&L per Trade ($)", s => f$(s.avgPnl))}
          ${row("Avg Winning Trade ($)", s => s.wins ? f$(s.avgWin) : "—")}
          ${row("Avg Losing Trade ($)", s => s.losses ? f$(-s.avgLoss) : "—")}
          ${row("Largest Win ($)", s => s.largestWin !== null ? f$(s.largestWin) : "—")}
          ${row("Largest Loss ($)", s => s.largestLoss !== null ? f$(s.largestLoss) : "—")}
          ${row("Largest Win (%)", s => s.largestWinPct !== null ? fPct(s.largestWinPct) : "—")}
          ${row("Largest Loss (%)", s => s.largestLossPct !== null ? fPct(s.largestLossPct) : "—")}

          ${sec("Risk & Ratio")}
          ${row("Profit Factor (gross W ÷ gross L)", s => pfDisplay(s))}
          ${row("Risk:Reward Ratio (avg W ÷ avg L)", s => s.rr !== null ? fNum(s.rr) + "R" : "—")}
          ${row("Expected Value per Trade ($)", s => s.ev !== null ? f$(s.ev) : "—")}

          ${sec("Drawdown")}
          ${row("Max Drawdown ($)", s => f$(-s.maxDD))}
          ${row("Max Drawdown (%)", s => fPct(-s.maxDDpct))}

          ${sec("Account")}
          ${row("Starting Balance", () => "$100,000.00")}
          ${row("Current Balance ($)", s => "$" + s.currentBalance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}))}
          ${row("Total Return (%)", s => fPct(s.totalReturn))}
        </tbody>
      </table>
    </div>`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────
function setupModal() {
  document.getElementById("sidebarLogBtn").addEventListener("click", () => openModal());
  document.getElementById("dashLogBtn").addEventListener("click",   () => openModal());
  document.getElementById("galleryLogBtn").addEventListener("click",() => openModal());
  document.getElementById("listLogBtn").addEventListener("click",   () => openModal());
  document.getElementById("viewAllBtn").addEventListener("click",   () => switchTab("gallery"));
  document.getElementById("modalClose").addEventListener("click",   closeModal);
  document.getElementById("modalCancel").addEventListener("click",  closeModal);
  document.getElementById("modalSave").addEventListener("click",    saveTrade);

  document.getElementById("tradeModal").addEventListener("click", e => {
    if (e.target.id === "tradeModal") closeModal();
  });

  // Auto-fill day of week
  document.getElementById("fDate").addEventListener("change", e => {
    fillDay(e.target.value);
  });

  // Screenshot tabs
  document.getElementById("scrTabUrl").addEventListener("click", () => switchScrTab("url"));
  document.getElementById("scrTabUpload").addEventListener("click", () => switchScrTab("upload"));

  // URL preview button
  document.getElementById("scrUrlPreviewBtn").addEventListener("click", () => {
    const url = document.getElementById("screenshotUrl").value.trim();
    if (url) { window._pendingUrl = url; previewScreenshot(url); }
  });
  // Also preview on Enter
  document.getElementById("screenshotUrl").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const url = document.getElementById("screenshotUrl").value.trim();
      if (url) { window._pendingUrl = url; previewScreenshot(url); }
    }
  });

  // File upload
  document.getElementById("screenshotUpload").addEventListener("click", () =>
    document.getElementById("screenshotFile").click());
  document.getElementById("screenshotFile").addEventListener("change", e => {
    if (e.target.files[0]) uploadScreenshot(e.target.files[0]);
  });

  // Remove screenshot
  document.getElementById("scrRemoveBtn").addEventListener("click", () => {
    window._pendingUrl = null;
    document.getElementById("screenshotPreviewWrap").classList.add("hidden");
    document.getElementById("screenshotUrl").value = "";
    document.getElementById("screenshotFile").value = "";
  });

  document.getElementById("fDate").value = today();
}

function switchScrTab(tab) {
  document.getElementById("scrTabUrl").classList.toggle("active", tab === "url");
  document.getElementById("scrTabUpload").classList.toggle("active", tab === "upload");
  document.getElementById("scrPanelUrl").classList.toggle("hidden", tab !== "url");
  document.getElementById("scrPanelUpload").classList.toggle("hidden", tab !== "upload");
}

function today() { return new Date().toISOString().slice(0, 10); }

function fillDay(dateStr) {
  if (!dateStr) return;
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  document.getElementById("fDay").value = days[d.getDay()] || "";
}

function openModal(id = null) {
  editingId = id;
  clearForm();

  if (id) {
    const t = trades.find(x => x.id === id);
    if (!t) return;
    document.getElementById("modalTitle").textContent = "Edit Trade";
    document.getElementById("tradeId").value       = t.id;
    document.getElementById("fPair").value         = t.pair      || "EURUSD";
    document.getElementById("fDirection").value    = t.direction || "Long";
    document.getElementById("fOutcome").value      = t.outcome   || "Win";
    document.getElementById("fDate").value         = t.date      || today();
    document.getElementById("fDay").value          = t.day       || "";
    // if day was never saved, auto-fill it now
    if (!t.day && t.date) fillDay(t.date);
    document.getElementById("fTime").value         = t.time_entered || "";
    document.getElementById("fDuration").value     = t.duration  || "";
    document.getElementById("fPnl").value          = t.pnl ?? "";
    document.getElementById("fExitReason").value   = t.exit_reason || "Hit TP";
    document.getElementById("fStrategy").value     = t.strategy  || "Strategy #1";
    document.getElementById("fSession").value      = t.session   || "London";
    document.getElementById("fTags").value         = t.tags      || "";
    document.getElementById("fNotes").value        = t.notes     || "";
    if (t.screenshot_url) {
      document.getElementById("screenshotUrl").value = t.screenshot_url;
      window._pendingUrl = t.screenshot_url;
      previewScreenshot(t.screenshot_url);
    }
  } else {
    document.getElementById("modalTitle").textContent = "Log New Trade";
    document.getElementById("fDate").value = today();
    fillDay(today());
  }

  document.getElementById("tradeModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("tradeModal").classList.add("hidden");
  editingId = null;
  clearForm();
}

function clearForm() {
  document.getElementById("tradeId").value       = "";
  document.getElementById("fPair").value         = "EURUSD";
  document.getElementById("fDirection").value    = "Long";
  document.getElementById("fOutcome").value      = "Win";
  document.getElementById("fDate").value         = today();
  document.getElementById("fDay").value          = "";
  document.getElementById("fTime").value         = "";
  document.getElementById("fDuration").value     = "";
  document.getElementById("fPnl").value          = "";
  document.getElementById("fExitReason").value   = "Hit TP";
  document.getElementById("fStrategy").value     = "Strategy #1";
  document.getElementById("fSession").value      = "London";
  document.getElementById("fTags").value         = "";
  document.getElementById("fNotes").value        = "";
  document.getElementById("screenshotFile").value = "";
  document.getElementById("screenshotUrl").value  = "";
  document.getElementById("screenshotPreviewWrap").classList.add("hidden");
  document.getElementById("screenshotPreview").src = "";
  switchScrTab("url");
  window._pendingUrl = null;
}

async function saveTrade() {
  const btn = document.getElementById("modalSave");
  btn.textContent = "Saving…"; btn.disabled = true;

  const pnlVal = document.getElementById("fPnl").value;
  const payload = {
    pair:           document.getElementById("fPair").value,
    direction:      document.getElementById("fDirection").value,
    outcome:        document.getElementById("fOutcome").value,
    date:           document.getElementById("fDate").value,
    day:            document.getElementById("fDay").value,
    time_entered:   document.getElementById("fTime").value,
    duration:       document.getElementById("fDuration").value,
    pnl:            pnlVal !== "" ? parseFloat(pnlVal) : null,
    exit_reason:    document.getElementById("fExitReason").value,
    strategy:       document.getElementById("fStrategy").value,
    session:        document.getElementById("fSession").value,
    tags:           document.getElementById("fTags").value,
    notes:          document.getElementById("fNotes").value,
    screenshot_url: window._pendingUrl
      || (editingId ? trades.find(t => t.id === editingId)?.screenshot_url : null)
      || null,
  };

  let error;
  if (editingId) {
    ({ error } = await db.from("trades").update(payload).eq("id", editingId));
    if (!error) trades = trades.map(t => t.id === editingId ? { ...t, ...payload } : t);
  } else {
    const { data, error: e } = await db.from("trades").insert([payload]).select();
    error = e;
    if (!error && data) trades = [data[0], ...trades];
  }

  if (error) {
    alert("Save failed: " + error.message);
  } else {
    closeModal();
    renderAll();
  }

  btn.textContent = "Save Trade"; btn.disabled = false;
}

async function confirmDelete(id) {
  if (!confirm("Delete this trade? This cannot be undone.")) return;
  const { error } = await db.from("trades").delete().eq("id", id);
  if (!error) { trades = trades.filter(t => t.id !== id); renderAll(); }
}

// ── SCREENSHOT ────────────────────────────────────────────────────────────
async function uploadScreenshot(file) {
  const placeholder = document.getElementById("screenshotPlaceholder");
  placeholder.innerHTML = `<span style="color:var(--text-soft)">Uploading…</span>`;

  try {
    const ext  = file.name.split(".").pop();
    const path = `trade_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await db.storage.from("screenshots").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = db.storage.from("screenshots").getPublicUrl(path);
    window._pendingUrl = data.publicUrl;
    previewScreenshot(data.publicUrl);
  } catch (e) {
    alert("Upload failed: " + e.message);
  } finally {
    placeholder.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
      <span>Click to upload chart screenshot</span>`;
  }
}

function previewScreenshot(url) {
  const img = document.getElementById("screenshotPreview");
  img.src = url;
  document.getElementById("screenshotPreviewWrap").classList.remove("hidden");
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(id) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const btn = document.querySelector(`.nav-btn[data-tab="${id}"]`);
  const tab = document.getElementById(`tab-${id}`);
  if (btn) btn.classList.add("active");
  if (tab) tab.classList.add("active");
}

// ── FILTERS ───────────────────────────────────────────────────────────────
function setupFilters() {
  document.getElementById("gallerySearch").addEventListener("input", e => {
    searchQ = e.target.value.toLowerCase();
    renderGallery();
  });
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.filter;
      document.querySelectorAll(`.filter-btn[data-filter="${type}"]`)
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (type === "outcome") filterOut = btn.dataset.value;
      if (type === "dir")     filterDir = btn.dataset.value;
      renderGallery();
    });
  });
}

function getFiltered() {
  return trades.filter(t => {
    if (filterOut !== "All" && t.outcome !== filterOut) return false;
    if (filterDir !== "All" && t.direction !== filterDir) return false;
    if (searchQ) {
      const q = searchQ;
      return (t.pair||"").toLowerCase().includes(q)
          || (t.notes||"").toLowerCase().includes(q)
          || (t.tags||"").toLowerCase().includes(q)
          || (t.strategy||"").toLowerCase().includes(q);
    }
    return true;
  });
}