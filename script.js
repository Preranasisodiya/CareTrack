/* CareTrack — Quarantine Facility Patient Management
   Vanilla JS prototype. State persisted in localStorage. */

const STORAGE_KEY = "caretrack_v1";
const MAX_ROOMS = 74;
const FEVER_THRESHOLD = 100.4; // °F
const DISCHARGE_STREAK = 3; // full fever-free days required

let state = null;
let currentRole = null;

/* ---------------- Date / time helpers ---------------- */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function today() { return fmtDate(new Date()); }
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function prettyDate(ds) {
  const d = new Date(ds + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ---------------- Persistence ---------------- */
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through to seed */ }
  }
  return seedData();
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- Seed demo data ---------------- */
function seedData() {
  const patients = [];
  let id = 1;

  function mk(name, age, room, admittedDaysAgo, status, extra) {
    patients.push(Object.assign({
      id: id++,
      name, age, room,
      admittedDate: fmtDate(daysAgo(admittedDaysAgo)),
      status, // active | discharged | deceased
      tempLog: [],
      visitLog: [],
      dischargeRequested: false,
      dischargeRequestedDate: null,
      dischargedDate: null,
      deceasedDate: null,
    }, extra || {}));
  }

  // Helper to add a log entry N days ago at a given hour
  function addTemp(p, daysBack, value, by, hour) {
    const d = daysAgo(daysBack);
    d.setHours(hour, 0, 0, 0);
    p.tempLog.push({ date: fmtDate(d), time: fmtTime(d), value, by });
  }
  function addVisit(p, daysBack, notes, hour) {
    const d = daysAgo(daysBack);
    d.setHours(hour, 0, 0, 0);
    p.visitLog.push({ date: fmtDate(d), time: fmtTime(d), notes });
  }

  // 1. Fresh admission today, no readings yet
  mk("Arjun Mehta", 34, 1, 0, "active");

  // 2. Checked today, no fever, mid-treatment
  mk("Fatima Noor", 29, 2, 2, "active");
  addTemp(patients[1], 2, 101.1, "nurse", 9);
  addTemp(patients[1], 1, 99.8, "nurse", 9);
  addTemp(patients[1], 0, 98.4, "nurse", 8);

  // 3. Currently has a fever today — not yet visited by doctor today
  mk("Carlos Dominguez", 52, 3, 3, "active");
  addTemp(patients[2], 3, 102.3, "nurse", 9);
  addTemp(patients[2], 2, 101.5, "nurse", 9);
  addTemp(patients[2], 1, 100.9, "nurse", 9);
  addTemp(patients[2], 0, 100.6, "nurse", 8);
  addVisit(patients[2], 1, "Started antipyretics.", 11);

  // 4. Ready for discharge: 3 full fever-free days (today not counted), already flagged by doctor
  mk("Priya Shah", 41, 4, 5, "active");
  addTemp(patients[3], 4, 101.8, "nurse", 9);
  addTemp(patients[3], 3, 99.2, "nurse", 9);
  addTemp(patients[3], 2, 98.6, "nurse", 9);
  addTemp(patients[3], 1, 98.1, "nurse", 9);
  addTemp(patients[3], 0, 98.3, "nurse", 8);
  addVisit(patients[3], 1, "Afebrile x3 days, clinically well.", 10);
  patients[3].dischargeRequested = true;
  patients[3].dischargeRequestedDate = fmtDate(daysAgo(1));

  // 5. Has a gap day in the journal (illustrates broken streak from missed recording)
  mk("Ben Okafor", 46, 5, 6, "active");
  addTemp(patients[4], 4, 100.9, "nurse", 9);
  // day 3 missing entirely — nurse forgot
  addTemp(patients[4], 2, 98.0, "nurse", 9);
  addTemp(patients[4], 1, 98.2, "nurse", 9);

  // 6. Doctor visited before nurse took temp today (no temp reading today yet)
  mk("Lena Kowalski", 61, 6, 4, "active");
  addTemp(patients[5], 3, 100.1, "nurse", 9);
  addTemp(patients[5], 2, 98.9, "nurse", 9);
  addTemp(patients[5], 1, 98.5, "nurse", 9);

  // 7. Already discharged (history)
  mk("Noah Williams", 37, null, 10, "discharged", { dischargedDate: fmtDate(daysAgo(2)) });
  addTemp(patients[6], 9, 101.2, "nurse", 9);
  addTemp(patients[6], 6, 98.0, "nurse", 9);
  addTemp(patients[6], 5, 98.1, "nurse", 9);
  addTemp(patients[6], 4, 98.2, "nurse", 9);

  // 8. Deceased (history, feeds mortality stat)
  mk("Grace Adeyemi", 72, null, 12, "deceased", { deceasedDate: fmtDate(daysAgo(5)) });
  addTemp(patients[7], 10, 103.1, "nurse", 9);
  addTemp(patients[7], 8, 103.6, "nurse", 9);

  return { patients, nextRoomHint: 7 };
}

/* ---------------- Derived data helpers ---------------- */
function activePatients() { return state.patients.filter(p => p.status === "active"); }
function occupiedCount() { return activePatients().length; }
function dayEntries(p, dateStr) { return p.tempLog.filter(e => e.date === dateStr); }
function hasTempToday(p) { return dayEntries(p, today()).length > 0; }
function hasVisitToday(p) { return p.visitLog.some(v => v.date === today()); }
function todaysMaxTemp(p) {
  const entries = dayEntries(p, today());
  if (!entries.length) return null;
  return Math.max(...entries.map(e => e.value));
}
function isFeverToday(p) {
  const m = todaysMaxTemp(p);
  return m !== null && m >= FEVER_THRESHOLD;
}
function computeStreak(p) {
  // Full fever-free days, counted backward starting yesterday (today isn't "full" yet).
  let streak = 0;
  let d = daysAgo(1);
  while (true) {
    const ds = fmtDate(d);
    if (ds < p.admittedDate) break;
    const entries = dayEntries(p, ds);
    if (!entries.length) break; // unrecorded day = can't confirm fever-free, streak breaks
    const maxV = Math.max(...entries.map(e => e.value));
    if (maxV >= FEVER_THRESHOLD) break;
    streak++;
    d = daysAgo(streak + 1);
  }
  return streak;
}
function isDischargeEligible(p) { return computeStreak(p) >= DISCHARGE_STREAK; }
function nextFreeRoom() {
  const used = new Set(activePatients().map(p => p.room));
  for (let r = 1; r <= MAX_ROOMS; r++) if (!used.has(r)) return r;
  return null;
}
function findPatient(id) { return state.patients.find(p => p.id === Number(id)); }

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------- Modal helpers ---------------- */
function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

/* ---------------- Rendering: shared bits ---------------- */
function statusPillHtml(status) {
  return `<span class="status-pill status-${status}">${status}</span>`;
}

function journalModalHtml(p) {
  const streak = p.status === "active" ? computeStreak(p) : null;
  const rows = [...p.tempLog]
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .map(e => `<tr><td>${prettyDate(e.date)}</td><td>${e.time}</td><td>${e.value.toFixed(1)}°F${e.value >= FEVER_THRESHOLD ? " 🔥" : ""}</td><td>${e.by}</td></tr>`)
    .join("");
  const visits = [...p.visitLog]
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .map(v => `<tr><td>${prettyDate(v.date)}</td><td>${v.time}</td><td>${v.notes ? escapeHtml(v.notes) : "<em>No notes</em>"}</td></tr>`)
    .join("");

  return `
    <h3>${escapeHtml(p.name)}</h3>
    <p class="modal-patient-name">Age ${p.age} · Room ${p.room ?? "—"} · Admitted ${prettyDate(p.admittedDate)} · ${statusPillHtml(p.status)}</p>
    ${streak !== null ? `<div class="journal-meta"><div><b>Fever-free streak:</b> ${streak} day(s)</div><div><b>Discharge eligible:</b> ${streak >= DISCHARGE_STREAK ? "Yes ✅" : "Not yet"}</div></div>` : ""}
    <h4>Temperature Journal</h4>
    <table class="journal-table"><thead><tr><th>Date</th><th>Time</th><th>Reading</th><th>By</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4"><em>No readings recorded yet.</em></td></tr>`}</tbody></table>
    <h4>Doctor Visits</h4>
    <table class="journal-table"><thead><tr><th>Date</th><th>Time</th><th>Notes</th></tr></thead>
    <tbody>${visits || `<tr><td colspan="3"><em>No visits recorded yet.</em></td></tr>`}</tbody></table>
  `;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function openJournal(id) {
  const p = findPatient(id);
  document.getElementById("patientModalBody").innerHTML = journalModalHtml(p);
  openModal("patientModal");
}

/* ---------------- Nurse screen ---------------- */
function renderNurse() {
  const list = document.getElementById("nurseList");
  const pts = activePatients().sort((a, b) => a.room - b.room);
  if (!pts.length) { list.innerHTML = `<p class="screen-sub">No active patients.</p>`; return; }

  list.innerHTML = pts.map(p => {
    const done = hasTempToday(p);
    const fever = isFeverToday(p);
    const cls = fever ? "fever" : done ? "done-today" : "new-admit";
    const badge = fever
      ? `<span class="pc-badge badge-fever">🔥 Fever</span>`
      : done
      ? `<span class="pc-badge badge-done">✅ Checked today</span>`
      : `<span class="pc-badge badge-pending">⏳ Not checked</span>`;
    const last = todaysMaxTemp(p);
    return `
      <div class="patient-card ${cls}">
        <div class="pc-head">
          <div><div class="pc-name">${escapeHtml(p.name)}</div><div class="pc-room">Room ${p.room} · Age ${p.age}</div></div>
          ${badge}
        </div>
        <div class="pc-row"><span>Today's reading</span><b>${last !== null ? last.toFixed(1) + "°F" : "—"}</b></div>
        <div class="pc-actions">
          <button class="btn btn-primary btn-small" data-action="add-temp" data-id="${p.id}">${done ? "Add another reading" : "Record Temperature"}</button>
        </div>
        <button class="pc-link" data-action="view-journal" data-id="${p.id}">View full journal</button>
      </div>`;
  }).join("");
}

/* ---------------- Doctor screen ---------------- */
function renderDoctor() {
  const list = document.getElementById("doctorList");
  const pts = activePatients().sort((a, b) => a.room - b.room);
  if (!pts.length) { list.innerHTML = `<p class="screen-sub">No active patients.</p>`; return; }

  list.innerHTML = pts.map(p => {
    const tempDone = hasTempToday(p);
    const visitDone = hasVisitToday(p);
    const fever = isFeverToday(p);
    const streak = computeStreak(p);
    const eligible = streak >= DISCHARGE_STREAK;
    const cls = fever ? "fever" : visitDone ? "done-today" : "new-admit";

    let badge;
    if (visitDone) badge = `<span class="pc-badge badge-done">✅ Visited today</span>`;
    else if (!tempDone) badge = `<span class="pc-badge badge-pending">⚠ No temp yet</span>`;
    else badge = `<span class="pc-badge badge-pending">⏳ Awaiting visit</span>`;

    return `
      <div class="patient-card ${cls}">
        <div class="pc-head">
          <div><div class="pc-name">${escapeHtml(p.name)}</div><div class="pc-room">Room ${p.room} · Age ${p.age}</div></div>
          ${badge}
        </div>
        <div class="pc-row"><span>Today's reading</span><b>${todaysMaxTemp(p) !== null ? todaysMaxTemp(p).toFixed(1) + "°F" : "Not taken"}</b></div>
        <div class="pc-streak ${eligible ? "ready" : ""}">${eligible ? "✅ Eligible for discharge" : `Fever-free streak: ${streak}/${DISCHARGE_STREAK} day(s)`}${p.dischargeRequested ? " · Flagged for admin" : ""}</div>
        <div class="pc-actions">
          <button class="btn btn-primary btn-small" data-action="record-visit" data-id="${p.id}" ${visitDone ? "disabled" : ""}>${visitDone ? "Visit logged" : "Log Visit"}</button>
        </div>
        <button class="pc-link" data-action="view-journal" data-id="${p.id}">View full journal</button>
      </div>`;
  }).join("");
}

/* ---------------- Admin screen ---------------- */
function mortalityRate() {
  const discharged = state.patients.filter(p => p.status === "discharged").length;
  const deceased = state.patients.filter(p => p.status === "deceased").length;
  const resolved = discharged + deceased;
  if (!resolved) return null;
  return (deceased / resolved) * 100;
}
function renderAdmin() {
  const occ = occupiedCount();
  const free = MAX_ROOMS - occ;
  const discharged = state.patients.filter(p => p.status === "discharged").length;
  const deceased = state.patients.filter(p => p.status === "deceased").length;
  const rate = mortalityRate();

  const banner = document.getElementById("alertBanner");
  if (rate !== null && rate > 15) {
    banner.hidden = false;
    banner.textContent = `⚠ Mortality rate is ${rate.toFixed(1)}%, above the 15% expected benchmark. Review treatment protocols.`;
  } else {
    banner.hidden = true;
  }

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-tile"><div class="stat-label">Occupancy</div><div class="stat-value">${occ}/${MAX_ROOMS}</div><div class="stat-sub">${free} room(s) free</div></div>
    <div class="stat-tile"><div class="stat-label">Discharged</div><div class="stat-value">${discharged}</div><div class="stat-sub">Total recovered</div></div>
    <div class="stat-tile"><div class="stat-label">Deceased</div><div class="stat-value">${deceased}</div><div class="stat-sub">Total fatalities</div></div>
    <div class="stat-tile"><div class="stat-label">Mortality rate</div><div class="stat-value ${rate !== null && rate > 15 ? "warn" : ""}">${rate !== null ? rate.toFixed(1) + "%" : "—"}</div><div class="stat-sub">Benchmark: ≤15%</div></div>
  `;

  // Discharge queue
  const queue = activePatients().filter(p => p.dischargeRequested);
  const dq = document.getElementById("dischargeQueue");
  dq.innerHTML = queue.length
    ? queue.map(p => `
      <div class="queue-item">
        <div><div class="qi-name">${escapeHtml(p.name)}</div><div class="qi-meta">Room ${p.room} · Flagged ${prettyDate(p.dischargeRequestedDate)}</div></div>
        <div class="pc-actions">
          <button class="btn btn-secondary btn-small" data-action="confirm-discharge" data-id="${p.id}">Confirm Discharge</button>
        </div>
      </div>`).join("")
    : `<p class="empty-note">No patients currently flagged for discharge.</p>`;

  // Admit form: set room suggestion + disable if full
  const suggestion = nextFreeRoom();
  const admitRoomInput = document.getElementById("admitRoom");
  if (document.activeElement !== admitRoomInput) admitRoomInput.value = suggestion ?? "";
  document.getElementById("admitSubmitBtn").disabled = occ >= MAX_ROOMS;
  const admitError = document.getElementById("admitError");
  if (occ >= MAX_ROOMS) {
    admitError.hidden = false;
    admitError.textContent = `Facility at full capacity (${MAX_ROOMS}/${MAX_ROOMS}). Discharge a patient before admitting another.`;
  } else {
    admitError.hidden = true;
  }

  // All patients table
  const body = document.getElementById("allPatientsBody");
  const rows = [...state.patients].sort((a, b) => a.id - b.id).map(p => {
    const streak = p.status === "active" ? `${computeStreak(p)}/${DISCHARGE_STREAK}` : "—";
    let extraAction = "";
    if (p.status === "active") {
      extraAction = `<button class="link-btn" data-action="mark-deceased" data-id="${p.id}" style="margin-left:10px;color:#c0392b;">Mark deceased</button>`;
    }
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.room ?? "—"}</td>
      <td>${statusPillHtml(p.status)}</td>
      <td>${prettyDate(p.admittedDate)}</td>
      <td>${streak}</td>
      <td><button class="link-btn" data-action="view-journal" data-id="${p.id}">View</button>${extraAction}</td>
    </tr>`;
  }).join("");
  body.innerHTML = rows;
}

/* ---------------- Screen switching ---------------- */
function showScreen(role) {
  currentRole = role;
  document.getElementById("loginScreen").hidden = !!role;
  document.getElementById("topbar").hidden = !role;
  document.getElementById("nurseScreen").hidden = role !== "nurse";
  document.getElementById("doctorScreen").hidden = role !== "doctor";
  document.getElementById("adminScreen").hidden = role !== "admin";
  if (role) {
    document.getElementById("roleBadge").textContent = role;
    renderCurrent();
  }
}
function renderCurrent() {
  if (currentRole === "nurse") renderNurse();
  else if (currentRole === "doctor") renderDoctor();
  else if (currentRole === "admin") renderAdmin();
}

/* ---------------- Action handlers ---------------- */
let activeTempPatientId = null;
let activeVisitPatientId = null;

function handleAddTempClick(id) {
  activeTempPatientId = id;
  const p = findPatient(id);
  document.getElementById("tempModalPatientName").textContent = `${p.name} — Room ${p.room}`;
  const warn = document.getElementById("tempModalWarning");
  if (hasTempToday(p)) {
    const m = todaysMaxTemp(p);
    warn.hidden = false;
    warn.textContent = `⚠ A reading was already recorded today (${m.toFixed(1)}°F). Adding another will create a second entry for today — only do this for a genuine re-check.`;
  } else {
    warn.hidden = true;
  }
  document.getElementById("tempForm").reset();
  openModal("tempModal");
}

function handleRecordVisitClick(id) {
  activeVisitPatientId = id;
  const p = findPatient(id);
  document.getElementById("visitModalPatientName").textContent = `${p.name} — Room ${p.room}`;
  const warn = document.getElementById("visitModalWarning");
  const form = document.getElementById("visitForm");

  const tempDone = hasTempToday(p);
  const eligible = isDischargeEligible(p);

  let extraFieldsHtml = "";
  if (!tempDone) {
    warn.hidden = false;
    warn.textContent = "⚠ Nurse has not recorded a temperature for this patient today. Please take a reading now before completing the visit.";
    extraFieldsHtml = `<label>Temperature taken now (°F)
      <input type="number" id="visitTempValue" step="0.1" min="90" max="112" placeholder="e.g. 99.1" />
    </label>`;
  } else {
    warn.hidden = true;
    const m = todaysMaxTemp(p);
    extraFieldsHtml = `<div class="pc-row" style="margin-bottom:4px;"><span>Today's recorded reading</span><b>${m.toFixed(1)}°F</b></div>`;
  }

  const dischargeHtml = `<label style="flex-direction:row;align-items:center;gap:8px;">
      <input type="checkbox" id="visitDischargeFlag" ${eligible ? "" : "disabled"} />
      <span>Flag ready for discharge ${eligible ? "(3-day fever-free criterion met)" : "(not yet eligible — needs " + DISCHARGE_STREAK + " full fever-free days)"}</span>
    </label>`;

  // Rebuild form body dynamically (temp field + notes + discharge checkbox)
  form.innerHTML = `
    ${extraFieldsHtml}
    <div id="visitFormError" class="form-error" hidden></div>
    <label>Notes (optional)
      <textarea id="visitNotes" rows="3" placeholder="Observations, treatment adjustments..."></textarea>
    </label>
    ${dischargeHtml}
    <button type="submit" class="btn btn-primary">Log Visit</button>
  `;
  openModal("visitModal");
}

function handleConfirmDischarge(id) {
  const p = findPatient(id);
  if (!confirm(`Confirm discharge for ${p.name}? This will free Room ${p.room}.`)) return;
  p.status = "discharged";
  p.dischargedDate = today();
  p.dischargeRequested = false;
  p.room = null;
  saveState();
  renderCurrent();
  toast(`${p.name} discharged.`);
}

function handleMarkDeceased(id) {
  const p = findPatient(id);
  if (!confirm(`Mark ${p.name} as deceased? This action cannot be undone and will affect the mortality rate.`)) return;
  p.status = "deceased";
  p.deceasedDate = today();
  p.dischargeRequested = false;
  p.room = null;
  saveState();
  renderCurrent();
  toast(`${p.name} recorded as deceased.`, true);
}

function handleAdmitSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("admitName").value.trim();
  const age = Number(document.getElementById("admitAge").value);
  const room = Number(document.getElementById("admitRoom").value);
  const errEl = document.getElementById("admitError");

  if (occupiedCount() >= MAX_ROOMS) {
    errEl.hidden = false; errEl.textContent = `Facility at full capacity (${MAX_ROOMS}/${MAX_ROOMS}).`;
    return;
  }
  if (!name || !age || !room) {
    errEl.hidden = false; errEl.textContent = "All fields are required.";
    return;
  }
  if (room < 1 || room > MAX_ROOMS) {
    errEl.hidden = false; errEl.textContent = `Room must be between 1 and ${MAX_ROOMS}.`;
    return;
  }
  if (activePatients().some(p => p.room === room)) {
    errEl.hidden = false; errEl.textContent = `Room ${room} is already occupied.`;
    return;
  }
  errEl.hidden = true;

  const newId = Math.max(0, ...state.patients.map(p => p.id)) + 1;
  state.patients.push({
    id: newId, name, age, room,
    admittedDate: today(), status: "active",
    tempLog: [], visitLog: [],
    dischargeRequested: false, dischargeRequestedDate: null,
    dischargedDate: null, deceasedDate: null,
  });
  saveState();
  document.getElementById("admitForm").reset();
  renderCurrent();
  toast(`${name} admitted to Room ${room}.`);
}

function handleTempSubmit(e) {
  e.preventDefault();
  const val = Number(document.getElementById("tempValue").value);
  const p = findPatient(activeTempPatientId);
  if (!p || !val) return;
  const now = new Date();
  p.tempLog.push({ date: fmtDate(now), time: fmtTime(now), value: val, by: "nurse" });
  saveState();
  closeModal("tempModal");
  renderCurrent();
  toast(`Temperature ${val.toFixed(1)}°F recorded for ${p.name}.${val >= FEVER_THRESHOLD ? " Fever detected." : ""}`, val >= FEVER_THRESHOLD);
}

function handleVisitSubmit(e) {
  e.preventDefault();
  const p = findPatient(activeVisitPatientId);
  if (!p) return;

  const tempInput = document.getElementById("visitTempValue");
  const errEl = document.getElementById("visitFormError");
  if (tempInput) {
    const val = Number(tempInput.value);
    if (!tempInput.value || !val || val < 90 || val > 112) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "Please enter a valid temperature (90–112°F) before logging the visit."; }
      return;
    }
    const now = new Date();
    p.tempLog.push({ date: fmtDate(now), time: fmtTime(now), value: val, by: "doctor" });
  }
  if (errEl) errEl.hidden = true;

  const notes = document.getElementById("visitNotes").value.trim();
  const dischargeChk = document.getElementById("visitDischargeFlag");
  const now = new Date();
  p.visitLog.push({ date: fmtDate(now), time: fmtTime(now), notes });

  if (dischargeChk && dischargeChk.checked && isDischargeEligible(p)) {
    p.dischargeRequested = true;
    p.dischargeRequestedDate = fmtDate(now);
  }

  saveState();
  closeModal("visitModal");
  renderCurrent();
  toast(`Visit logged for ${p.name}.${p.dischargeRequested ? " Flagged for discharge." : ""}`);
}

/* ---------------- Event wiring ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  state = loadState();
  saveState();

  document.querySelectorAll(".role-card").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.role));
  });
  document.getElementById("logoutBtn").addEventListener("click", () => showScreen(null));
  document.getElementById("resetDemoBtn").addEventListener("click", () => {
    if (!confirm("Reset all demo data? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    saveState();
    toast("Demo data reset.");
  });

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.hidden = true; });
  });

  document.getElementById("admitForm").addEventListener("submit", handleAdmitSubmit);
  document.getElementById("tempForm").addEventListener("submit", handleTempSubmit);
  document.getElementById("visitForm").addEventListener("submit", handleVisitSubmit);

  // Delegated click handling for dynamically rendered cards/tables
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case "add-temp": handleAddTempClick(id); break;
      case "record-visit": handleRecordVisitClick(id); break;
      case "view-journal": openJournal(id); break;
      case "confirm-discharge": handleConfirmDischarge(id); break;
      case "mark-deceased": handleMarkDeceased(id); break;
    }
  });

  showScreen(null);
});
