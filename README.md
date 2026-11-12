# CareTrack — Quarantine Facility Patient Management

A working prototype built for the FactWise Junior TPM Campus Assessment (Q2). It digitizes a quarantine/treatment facility's temperature-tracking and discharge workflow, replacing the paper journal process described in the problem statement.

**Live demo:** _add your deployed URL here after pushing (e.g. Vercel/Netlify/GitHub Pages link)_

## Problem it solves

The facility's head doctor described these pain points:
- Nurses jot temperatures in a paper journal — no one knows who's been checked today.
- Temperatures get recorded multiple times some days, zero times on others.
- Doctors sometimes visit before a temperature is taken and have to take it themselves.
- Discharge (3 full fever-free days) is tracked only in the doctor's head, so admin staff aren't informed promptly and patients overstay.
- There's no visibility into the facility's mortality rate against the 85% success benchmark, and no live occupancy view against the 74-room cap.

CareTrack addresses each of these directly (see **Logical constraints** below).

## User roles

| Role | Core actions |
|---|---|
| **Nurse** | View assigned/active patients, see who still needs today's temperature check, record a reading. Warned (not blocked) before recording a second reading on the same day. |
| **Doctor** | View all active patients with today's temp status, log a daily visit, record a temperature on the spot if the nurse hasn't yet, flag a patient as discharge-eligible once the 3-day fever-free streak is met, view full patient journal. |
| **Admin** | View occupancy (vs. 74-room cap), mortality rate (vs. 15% benchmark, with an alert if exceeded), admit new patients (with room-conflict/capacity validation), review and confirm the doctor-flagged discharge queue, view/manage the full patient roster including marking a patient deceased. |

## Tech

Plain **HTML/CSS/JavaScript** — no build step, no framework, no dependencies. State is held in `localStorage` so the prototype is fully interactive and persists between reloads without a backend. This was a deliberate choice to prioritize a fast, deployable, zero-install working prototype over premature architecture, in line with the assessment's "ASAP, nice-to-haves later" instruction.

## Running locally

No install required. Either:

```bash
# Option 1: just open it
open index.html

# Option 2: serve it (avoids any local-file browser restrictions)
python3 -m http.server 8743
# then visit http://localhost:8743
```

## Deploying

Static site, deployable anywhere with zero config:
- **Vercel**: `vercel` (select this folder, framework preset "Other")
- **Netlify**: drag-and-drop this folder onto Netlify's deploy UI
- **GitHub Pages**: enable Pages on this repo, serve from `main` branch root

## Logical constraints implemented

Answers the "what additional logical constraints" question (Q3) in code, not just in writing:

- **Fever-free streak** only counts *full* days with at least one recorded reading below 100.4°F. A day with **no** reading at all breaks the streak rather than silently assuming "no fever" — this directly fixes the "no one knows who's been checked" problem, since a missed check now visibly costs the patient their discharge progress instead of being invisible.
- **Discharge-eligible checkbox** in the doctor's visit form is disabled until the 3-day streak is actually met — a doctor cannot flag a patient early by mistake.
- **Doctor visiting before the nurse** is detected: if no temperature exists for the patient today, the visit form requires the doctor to take one first (inline validation, not a silent failure) before the visit can be logged — this is the "doctor wastes time doing it themselves" scenario from the brief, made explicit instead of invisible.
- **Duplicate temperature entries** are still allowed (a nurse might legitimately recheck), but the nurse is shown a warning once a reading already exists for today, rather than being blocked outright.
- **Room capacity** is enforced: the admit form blocks submission once occupancy hits 74/74, and blocks admitting into a room that's already occupied.
- **Mortality rate** is computed only from *resolved* cases (discharged + deceased) — active in-treatment patients aren't counted — and a visible warning banner appears if the rate exceeds the 15% expected benchmark, directly answering the head doctor's ask to "take measures in case the mortality rate rises."
- **Discharge is a two-step action**: a doctor flags eligibility, but only admin can confirm the actual discharge (freeing the room) — this mirrors the real process (doctor informs admin) while making the handoff explicit instead of relying on someone remembering to mention it.
- **Marking a patient deceased** requires confirmation and immediately feeds the mortality-rate calculation, since outcome tracking was called out as a currently-missing capability.

## Demo data

On first load the app seeds eight demo patients covering every state the reviewer will want to see: a fresh admission with no readings, a normal in-treatment patient, a patient currently running a fever, a patient who has already met the 3-day discharge criterion and been flagged, a patient with a gap day in their journal (missed nurse check), a patient whose doctor would be visiting before today's temperature is taken, one discharged patient, and one deceased patient (so the mortality-rate stat has something to compute). Use **Reset demo data** on the login screen to restore this baseline at any time.
