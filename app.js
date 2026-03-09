// ── SUPABASE SETUP ──────────────────────────────────────────────────────
const SUPABASE_URL = "https://enharhoobrptpjctntko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuaGFyaG9vYnJwdHBqY3RudGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTM4NDksImV4cCI6MjA4ODYyOTg0OX0.hE-GC9DSugftfndo3-vJ-O-rcE7wXS4fWLQmlhqNdSs";
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const STARTING_CAPITAL = 100000;

// ── STATE ───────────────────────────────────────────────────────────────
let allTrades = [];
let filterOutcome = "All";
let filterDir = "All";
let searchQuery = "";
let calYear, calMonth;
let editingId = null;

// ── INIT ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  setupNav();
  setupModal();
  setupCalendar();
  setupFilters();

  await loadTrades();
});

// ── LOAD TRADES ─────────────────────────────────────────────────────────
async function loadTrades() {
  const { data, error } = await db
    .from("trades")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Error loading trades:", error.message);
    return;
  }

  allTrades = data || [];
  renderAll();
}

// ── RENDER ALL VIEWS ────────────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderGallery();
  renderList();
  renderCalendar();
  renderStats();
  updateSidebarBalance();
}

// ── SIDEBAR BALANCE ─────────────────────────────────────────────────────
function updateSidebarBalance() {
  const totalPnl = allTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const balance = STARTING_CAPITAL + totalPnl;
  const change = balance - STARTING_CAPITAL;

  document.getElementById("sidebarBalance").textContent =
    "$" + balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const changeEl = document.getElementById("sidebarChange");
  const sign = change >= 0 ? "+" : "";
  changeEl.textContent = sign + "$" + Math.abs(change).toFixed(2) + " from $100k";
  changeEl.style.color = change >= 0 ? "rgba(255,255,255,0.9)" : "rgba(255,180,180,0.9)";
}

// ── DASHBOARD ───────────────────────────────────────────────────────────
function renderDashboard() {
  const s = calcStats(allTrades);
  const total = allTrades.length;

  document.getElementById("dashSub").textContent =
    `${total} trade${total !== 1 ? "s" : ""} logged · Starting capital $100,000`;

  if (!s) {
    // reset stat cards
    ["statWinRate","statNetPnl","statPF","statRR","statDD"].forEach(id => {
      document.getElementById(id).textContent = "—";
      document.getElementById(id).style.color = "var(--gold)";
    });
    document.getElementById("statWinRateSub").textContent = "No trades yet";
    document.getElementById("statNetPnlSub").textContent = "0.00% return";
    document.getElementById("statDDSub").textContent = "—";
    renderRecentTrades([]);
    return;
  }

  // Win Rate
  const wrEl = document.getElementById("statWinRate");
  wrEl.textContent = s.winRate.toFixed(1) + "%";
  wrEl.style.color = s.winRate >= 50 ? "var(--win)" : "var(--loss)";
  document.getElementById("statWinRateSub").textContent = `${s.wins}W · ${s.losses}L`;

  // Net P&L
  const pnlEl = document.getElementById("statNetPnl");
  pnlEl.textContent = fmtDollar(s.totalPnl);
  pnlEl.style.color = s.totalPnl >= 0 ? "var(--win)" : "var(--loss)";
  document.getElementById("statNetPnlSub").textContent = fmtPct(s.netPct) + " return";

  // Profit Factor
  const pfEl = document.getElementById("statPF");
  pfEl.textContent = fmtNum(s.profitFactor);
  pfEl.style.color = s.profitFactor >= 1.5 ? "var(--win)" : s.profitFactor >= 1 ? "var(--gold)" : "var(--loss)";

  // R:R
  document.getElementById("statRR").textContent = s.rr ? fmtNum(s.rr) + "R" : "—";

  // Drawdown
  const ddEl = document.getElementById("statDD");
  ddEl.textContent = fmtPct(-s.maxDDpct);
  ddEl.style.color = s.maxDDpct < 10 ? "var(--win)" : s.maxDDpct < 20 ? "var(--gold)" : "var(--loss)";
  document.getElementById("statDDSub").textContent = fmtDollar(-s.maxDD);

  renderRecentTrades(allTrades.slice(0, 6));
}

function renderRecentTrades(trades) {
  const el = document.getElementById("recentTradesList");

  if (!trades.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📒</div>
        <div class="empty-title">No trades yet</div>
        <div class="empty-sub">Log your first trade to start tracking performance</div>
        <button class="btn-gold" onclick="openModal()">Log Your First Trade</button>
      </div>`;
    return;
  }

  el.innerHTML = trades.map(t => `
    <div class="recent-trade-row">
      <span class="tag tag-${outcomeClass(t.outcome)}">${t.outcome}</span>
      <span class="recent-trade-pair">${t.pair || "—"}</span>
      <span class="tag tag-${t.direction === "Long" ? "long" : "short"}">${t.direction || ""}</span>
      <span class="recent-trade-meta">${t.strategy || ""}</span>
      <span class="recent-trade-meta">${t.date || ""}</span>
      ${t.exit_reason ? `<span class="tag tag-neutral">${t.exit_reason}</span>` : ""}
      <span class="recent-trade-pnl ${pnlClass(t.pnl)}">${fmtDollar(t.pnl)}</span>
    </div>`).join("");
}

// ── GALLERY ─────────────────────────────────────────────────────────────
function renderGallery() {
  const filtered = getFiltered();
  const grid = document.getElementById("galleryGrid");

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⊞</div>
      <div class="empty-title">No trades found</div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(t => `
    <div class="trade-card" onclick="openModal('${t.id}')">
      <div class="trade-card-img">
        ${t.screenshot_url
          ? `<img src="${t.screenshot_url}" alt="chart" />`
          : `<span class="no-img">No screenshot</span>`}
        <div class="outcome-badge">
          <span class="tag tag-${outcomeClass(t.outcome)}">${t.outcome}</span>
        </div>
      </div>
      <div class="trade-card-body">
        <div class="trade-card-pair">${t.pair || "—"}</div>
        <div class="trade-card-meta">
          ${[t.date, t.day, t.time_entered, t.duration].filter(Boolean).join(" · ")}
        </div>
        <div class="trade-card-tags">
          ${t.direction ? `<span class="tag tag-${t.direction === "Long" ? "long" : "short"}">${t.direction}</span>` : ""}
          ${t.exit_reason ? `<span class="tag tag-neutral">${t.exit_reason}</span>` : ""}
          ${t.strategy ? `<span class="tag tag-gold">${t.strategy}</span>` : ""}
        </div>
        <div class="trade-card-pnl ${pnlClass(t.pnl)}">${fmtDollar(t.pnl)}</div>
      </div>
      <div class="trade-card-footer">
        <button class="delete-link" onclick="event.stopPropagation(); deleteTrade('${t.id}')">delete</button>
      </div>
    </div>`).join("");
}

// ── LIST ────────────────────────────────────────────────────────────────
function renderList() {
  const tbody = document.getElementById("listTableBody");

  if (!allTrades.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">No trades logged yet</td></tr>`;
    return;
  }

  tbody.innerHTML = allTrades.map((t, i) => `
    <tr>
      <td class="pair-cell">${t.pair || "—"}</td>
      <td><span class="tag tag-${outcomeClass(t.outcome)}">${t.outcome}</span></td>
      <td>${t.date || "—"}</td>
      <td>${t.day || "—"}</td>
      <td>${t.time_entered || "—"}</td>
      <td>${t.duration || "—"}</td>
      <td><span class="tag tag-${t.direction === "Long" ? "long" : "short"}">${t.direction || "—"}</span></td>
      <td><span class="tag tag-gold">${t.strategy || "—"}</span></td>
      <td><span class="tag tag-neutral">${t.exit_reason || "—"}</span></td>
      <td class="pnl-cell ${pnlClass(t.pnl)}">${fmtDollar(t.pnl)}</td>
      <td>
        <div class="table-actions">
          <button class="btn-sm" onclick="openModal('${t.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteTrade('${t.id}')">Del</button>
        </div>
      </td>
    </tr>`).join("");
}

// ── CALENDAR ────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("calMonthLabel").textContent = `${MONTHS[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // build day map
  const dayMap = {};
  allTrades.forEach(t => {
    if (!t.date) return;
    const [y, m, d] = t.date.split("-").map(Number);
    if (y === calYear && m - 1 === calMonth) {
      if (!dayMap[d]) dayMap[d] = { pnl: 0, count: 0 };
      dayMap[d].pnl += (t.pnl || 0);
      dayMap[d].count++;
    }
  });

  const grid = document.getElementById("calGrid");
  let html = "";

  // empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const data = dayMap[d];
    let cls = "cal-cell";
    let inner = `<div class="cal-day-num">${d}</div>`;

    if (data) {
      cls += data.pnl >= 0 ? " has-win" : " has-loss";
      const sign = data.pnl >= 0 ? "+" : "";
      const color = data.pnl >= 0 ? "var(--win)" : "var(--loss)";
      inner += `<div class="cal-day-pnl" style="color:${color}">${sign}$${Math.abs(data.pnl).toFixed(0)}</div>`;
      inner += `<div class="cal-day-count">${data.count} trade${data.count > 1 ? "s" : ""}</div>`;
    }

    html += `<div class="${cls}">${inner}</div>`;
  }

  grid.innerHTML = html;
}

function setupCalendar() {
  document.getElementById("calPrev").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
}

// ── STATS TABLE ─────────────────────────────────────────────────────────
function renderStats() {
  const wrap = document.getElementById("statsTableWrap");
  document.getElementById("statsSub").textContent =
    `Auto-calculated from ${allTrades.length} logged trades · $100,000 starting capital`;

  if (!allTrades.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">◉</div>
      <div class="empty-title">Log trades to see your stats</div>
    </div>`;
    return;
  }

  const all  = calcStats(allTrades);
  const long = calcStats(allTrades.filter(t => t.direction === "Long"));
  const short= calcStats(allTrades.filter(t => t.direction === "Short"));

  const cell = (s, fn) => {
    if (!s) return `<td>ø</td>`;
    try {
      const v = fn(s);
      return `<td>${v ?? "ø"}</td>`;
    } catch { return `<td>ø</td>`; }
  };

  const row = (label, fn) =>
    `<tr><td>${label}</td>${cell(all,fn)}${cell(long,fn)}${cell(short,fn)}</tr>`;

  const sec = (label) =>
    `<tr class="section-row"><td colspan="4">${label}</td></tr>`;

  wrap.innerHTML = `
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th style="text-align:left">Metric</th>
            <th>All Trades</th>
            <th>Long Trades</th>
            <th>Short Trades</th>
          </tr>
        </thead>
        <tbody>
          ${sec("Trade Summary")}
          ${row("Total Trades", s => s.total)}
          ${row("Winning Trades", s => s.wins)}
          ${row("Losing Trades", s => s.losses)}
          ${row("Breakeven Trades", s => s.breakeven)}
          ${row("Win Rate (%)", s => s.winRate.toFixed(1) + "%")}
          ${row("Consecutive Wins (max)", s => s.maxConsecWins)}
          ${row("Consecutive Losses (max)", s => s.maxConsecLosses)}

          ${sec("P&L Metrics")}
          ${row("Net P&L ($)", s => fmtDollar(s.totalPnl))}
          ${row("Net P&L (%)", s => fmtPct(s.netPct))}
          ${row("Avg P&L per Trade ($)", s => fmtDollar(s.avgPnl))}
          ${row("Avg Winning Trade ($)", s => fmtDollar(s.avgWin))}
          ${row("Avg Losing Trade ($)", s => fmtDollar(-s.avgLoss))}
          ${row("Largest Winning Trade ($)", s => fmtDollar(s.largestWin))}
          ${row("Largest Losing Trade ($)", s => fmtDollar(s.largestLoss))}
          ${row("Largest Win (%)", s => fmtPct(s.largestWinPct))}
          ${row("Largest Loss (%)", s => fmtPct(s.largestLossPct))}

          ${sec("Risk & Ratio Metrics")}
          ${row("Profit Factor", s => fmtNum(s.profitFactor))}
          ${row("Risk : Reward Ratio", s => s.rr ? fmtNum(s.rr) + "R" : "ø")}
          ${row("Expected Value per Trade ($)", s => fmtDollar(s.ev))}

          ${sec("Drawdown")}
          ${row("Max Drawdown ($)", s => fmtDollar(-s.maxDD))}
          ${row("Max Drawdown (%)", s => fmtPct(-s.maxDDpct))}

          ${sec("Account Metrics")}
          ${row("Starting Balance", () => "$100,000.00")}
          ${row("Current Balance", s => "$" + s.currentBalance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}))}
          ${row("Total Return (%)", s => fmtPct(s.totalReturn))}
        </tbody>
      </table>
    </div>`;
}

// ── STATS CALCULATION ────────────────────────────────────────────────────
function calcStats(trades) {
  const closed = trades.filter(t => ["Win","Loss","Breakeven"].includes(t.outcome));
  if (!closed.length) return null;

  const wins   = closed.filter(t => t.outcome === "Win");
  const losses = closed.filter(t => t.outcome === "Loss");
  const be     = closed.filter(t => t.outcome === "Breakeven");

  const totalPnl  = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossWin  = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const avgWin    = wins.length ? grossWin / wins.length : 0;
  const avgLoss   = losses.length ? grossLoss / losses.length : 0;
  const pf        = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const rr        = avgLoss > 0 ? avgWin / avgLoss : null;
  const winRate   = (wins.length / closed.length) * 100;
  const netPct    = (totalPnl / STARTING_CAPITAL) * 100;

  // largest
  const sortedByPnl = [...closed].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const largestWin  = sortedByPnl[0]?.pnl || 0;
  const largestLoss = sortedByPnl[sortedByPnl.length - 1]?.pnl || 0;

  // drawdown
  let peak = STARTING_CAPITAL, bal = STARTING_CAPITAL, maxDD = 0, maxDDpct = 0;
  [...closed].reverse().forEach(t => {
    bal += (t.pnl || 0);
    if (bal > peak) peak = bal;
    const dd = peak - bal;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDD) { maxDD = dd; maxDDpct = ddPct; }
  });

  // consecutive streaks
  let maxCW = 0, maxCL = 0, cW = 0, cL = 0;
  [...closed].reverse().forEach(t => {
    if (t.outcome === "Win")  { cW++; cL = 0; if (cW > maxCW) maxCW = cW; }
    else if (t.outcome === "Loss") { cL++; cW = 0; if (cL > maxCL) maxCL = cL; }
    else { cW = 0; cL = 0; }
  });

  const currentBalance = STARTING_CAPITAL + totalPnl;
  const ev = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;

  return {
    total: closed.length, wins: wins.length, losses: losses.length, breakeven: be.length,
    winRate, totalPnl, netPct, avgPnl: totalPnl / closed.length,
    avgWin, avgLoss, grossWin, grossLoss,
    largestWin, largestLoss,
    largestWinPct:  (largestWin  / STARTING_CAPITAL) * 100,
    largestLossPct: (largestLoss / STARTING_CAPITAL) * 100,
    profitFactor: pf, rr, ev,
    maxDD, maxDDpct, currentBalance, totalReturn: netPct,
    maxConsecWins: maxCW, maxConsecLosses: maxCL,
  };
}

// ── MODAL ────────────────────────────────────────────────────────────────
function setupModal() {
  // open triggers
  document.getElementById("sidebarLogBtn").addEventListener("click", () => openModal());
  document.getElementById("dashLogBtn").addEventListener("click", () => openModal());
  document.getElementById("galleryLogBtn").addEventListener("click", () => openModal());
  document.getElementById("listLogBtn").addEventListener("click", () => openModal());
  document.getElementById("emptyLogBtn")?.addEventListener("click", () => openModal());
  document.getElementById("viewAllBtn").addEventListener("click", () => switchTab("gallery"));

  // close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("tradeModal").addEventListener("click", e => {
    if (e.target === document.getElementById("tradeModal")) closeModal();
  });

  // save
  document.getElementById("modalSave").addEventListener("click", saveTrade);

  // auto-fill day from date
  document.getElementById("fDate").addEventListener("change", e => {
    const d = new Date(e.target.value + "T12:00:00");
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    document.getElementById("fDay").value = days[d.getDay()] || "";
  });

  // screenshot upload
  const uploadArea = document.getElementById("screenshotUpload");
  const fileInput  = document.getElementById("screenshotFile");
  uploadArea.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    if (e.target.files[0]) handleScreenshotUpload(e.target.files[0]);
  });

  // set today as default date
  document.getElementById("fDate").value = new Date().toISOString().slice(0, 10);
}

function openModal(tradeId = null) {
  editingId = tradeId;
  const modal = document.getElementById("tradeModal");
  const title = document.getElementById("modalTitle");

  resetForm();

  if (tradeId) {
    const t = allTrades.find(x => x.id === tradeId);
    if (!t) return;
    title.textContent = "Edit Trade";
    document.getElementById("tradeId").value = t.id;
    document.getElementById("fPair").value        = t.pair || "EURUSD";
    document.getElementById("fDirection").value   = t.direction || "Long";
    document.getElementById("fOutcome").value     = t.outcome || "Win";
    document.getElementById("fDate").value        = t.date || "";
    document.getElementById("fDay").value         = t.day || "";
    document.getElementById("fTime").value        = t.time_entered || "";
    document.getElementById("fDuration").value    = t.duration || "";
    document.getElementById("fPnl").value         = t.pnl ?? "";
    document.getElementById("fExitReason").value  = t.exit_reason || "Hit TP";
    document.getElementById("fStrategy").value    = t.strategy || "Strategy #1";
    document.getElementById("fSession").value     = t.session || "London";
    document.getElementById("fTags").value        = t.tags || "";
    document.getElementById("fNotes").value       = t.notes || "";

    if (t.screenshot_url) {
      showScreenshotPreview(t.screenshot_url);
    }
  } else {
    title.textContent = "Log New Trade";
    document.getElementById("fDate").value = new Date().toISOString().slice(0, 10);
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("tradeModal").classList.add("hidden");
  editingId = null;
  resetForm();
}

function resetForm() {
  document.getElementById("tradeId").value   = "";
  document.getElementById("fPair").value     = "EURUSD";
  document.getElementById("fDirection").value= "Long";
  document.getElementById("fOutcome").value  = "Win";
  document.getElementById("fDate").value     = new Date().toISOString().slice(0, 10);
  document.getElementById("fDay").value      = "";
  document.getElementById("fTime").value     = "";
  document.getElementById("fDuration").value = "";
  document.getElementById("fPnl").value      = "";
  document.getElementById("fExitReason").value = "Hit TP";
  document.getElementById("fStrategy").value  = "Strategy #1";
  document.getElementById("fSession").value   = "London";
  document.getElementById("fTags").value      = "";
  document.getElementById("fNotes").value     = "";
  document.getElementById("screenshotFile").value = "";
  document.getElementById("screenshotPreview").classList.add("hidden");
  document.getElementById("screenshotPreview").src = "";
  document.getElementById("screenshotPlaceholder").classList.remove("hidden");
  window._pendingScreenshotUrl = null;
}

async function saveTrade() {
  const btn = document.getElementById("modalSave");
  btn.textContent = "Saving…";
  btn.disabled = true;

  const pnlRaw = document.getElementById("fPnl").value;
  const trade = {
    pair:          document.getElementById("fPair").value,
    direction:     document.getElementById("fDirection").value,
    outcome:       document.getElementById("fOutcome").value,
    date:          document.getElementById("fDate").value,
    day:           document.getElementById("fDay").value,
    time_entered:  document.getElementById("fTime").value,
    duration:      document.getElementById("fDuration").value,
    pnl:           pnlRaw !== "" ? parseFloat(pnlRaw) : null,
    exit_reason:   document.getElementById("fExitReason").value,
    strategy:      document.getElementById("fStrategy").value,
    session:       document.getElementById("fSession").value,
    tags:          document.getElementById("fTags").value,
    notes:         document.getElementById("fNotes").value,
    screenshot_url: window._pendingScreenshotUrl || (editingId ? allTrades.find(t => t.id === editingId)?.screenshot_url : null) || null,
  };

  let error;
  if (editingId) {
    ({ error } = await db.from("trades").update(trade).eq("id", editingId));
    if (!error) {
      allTrades = allTrades.map(t => t.id === editingId ? { ...t, ...trade } : t);
    }
  } else {
    const { data, error: err } = await db.from("trades").insert([trade]).select();
    error = err;
    if (!error && data) allTrades = [data[0], ...allTrades];
  }

  if (error) {
    alert("Error saving trade: " + error.message);
  } else {
    closeModal();
    renderAll();
  }

  btn.textContent = "Save Trade ✓";
  btn.disabled = false;
}

async function deleteTrade(id) {
  if (!confirm("Delete this trade? This cannot be undone.")) return;
  const { error } = await db.from("trades").delete().eq("id", id);
  if (!error) {
    allTrades = allTrades.filter(t => t.id !== id);
    renderAll();
  }
}

// ── SCREENSHOT UPLOAD ────────────────────────────────────────────────────
async function handleScreenshotUpload(file) {
  document.getElementById("screenshotPlaceholder").textContent = "Uploading…";

  try {
    const ext  = file.name.split(".").pop();
    const path = `trade_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await db.storage.from("screenshots").upload(path, file, { upsert: true });
    if (error) throw error;

    const { data } = db.storage.from("screenshots").getPublicUrl(path);
    window._pendingScreenshotUrl = data.publicUrl;
    showScreenshotPreview(data.publicUrl);
  } catch (e) {
    alert("Upload failed: " + e.message);
    document.getElementById("screenshotPlaceholder").textContent = "📸 Click to upload trade screenshot";
  }
}

function showScreenshotPreview(url) {
  const img = document.getElementById("screenshotPreview");
  img.src = url;
  img.classList.remove("hidden");
  document.getElementById("screenshotPlaceholder").classList.add("hidden");
}

// ── NAVIGATION ───────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  const tab = document.getElementById(`tab-${tabId}`);
  if (btn) btn.classList.add("active");
  if (tab) tab.classList.add("active");
}

// ── FILTERS ──────────────────────────────────────────────────────────────
function setupFilters() {
  document.getElementById("gallerySearch").addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase();
    renderGallery();
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.filter;
      const val  = btn.dataset.value;

      // toggle active in group
      document.querySelectorAll(`.filter-btn[data-filter="${type}"]`)
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (type === "outcome") filterOutcome = val;
      if (type === "dir") filterDir = val;
      renderGallery();
    });
  });
}

function getFiltered() {
  return allTrades.filter(t => {
    if (filterOutcome !== "All" && t.outcome !== filterOutcome) return false;
    if (filterDir !== "All" && t.direction !== filterDir) return false;
    if (searchQuery) {
      const q = searchQuery;
      return (t.pair||"").toLowerCase().includes(q) ||
             (t.notes||"").toLowerCase().includes(q) ||
             (t.tags||"").toLowerCase().includes(q) ||
             (t.strategy||"").toLowerCase().includes(q);
    }
    return true;
  });
}

// ── FORMAT HELPERS ───────────────────────────────────────────────────────
function fmtDollar(v) {
  if (v == null || !isFinite(v)) return "—";
  const sign = v >= 0 ? "+$" : "-$";
  return sign + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtNum(v, d = 2) {
  if (v == null || !isFinite(v)) return "ø";
  return v.toFixed(d);
}

function outcomeClass(outcome) {
  if (outcome === "Win") return "win";
  if (outcome === "Loss") return "loss";
  return "be";
}

function pnlClass(pnl) {
  if (pnl == null) return "pnl-neutral";
  return pnl >= 0 ? "pnl-positive" : "pnl-negative";
}