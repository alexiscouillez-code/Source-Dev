import { fillPreview, HAIR_OPTIONS, JERSEY_LABELS, JERSEYS, runnerBadge, SKIN_LABELS, SKINS } from "./avatar.ts";
import { coachComment } from "./comments.ts";
import { drawMinimap, drawWorld } from "./draw.ts";
import { escapeHtml, formatInt, formatKm } from "./format.ts";
import { buildProfile, describeSegment, sparklinePath } from "./profile.ts";
import { applyOuting, clearedDistance } from "./progress.ts";
import {
  finishTown,
  PUBLISHED_TOTALS,
  raceById,
  RACES,
  totalElevation,
  totalKm,
} from "./races.ts";
import { clearSave, loadSave, sanitizeSave, writeSave } from "./save.ts";
import type { Avatar, Hair, Race, RaceId, Save } from "./types.ts";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("Application introuvable");
const app: HTMLElement = appRoot;

let draftRaceId: RaceId | null = null;
let draft: Avatar = { name: "", skin: 1, hair: "court", jersey: 0 };
let save: Save | null = null;
let animToken = 0;
let animating = false;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

boot();

function boot(): void {
  const stored = loadSave();
  if (stored) {
    showTrail(stored);
    return;
  }
  showRaces();
}

function showRaces(): void {
  document.title = "Le Profil";
  app.innerHTML = `
    <section class="sheet" data-screen="races">
      <header class="intro">
        ${brand()}
        <h1>Le Profil</h1>
        <p class="deck">Trois courses autour du Mont-Blanc. Tu avances tronçon par tronçon, en kilomètres et en dénivelé positif.</p>
      </header>
      <div class="cards">
        ${RACES.map((race) => raceCard(race)).join("")}
      </div>
      <p class="fine">${escapeHtml(publishedNote())}</p>
    </section>
  `;
  for (const race of RACES) {
    document
      .querySelector<HTMLButtonElement>(`[data-race="${race.id}"]`)
      ?.addEventListener("click", () => {
        draftRaceId = race.id;
        draft = { name: "", skin: 1, hair: "court", jersey: 0 };
        showAvatar();
      });
  }
}

function showAvatar(): void {
  if (!draftRaceId) {
    showRaces();
    return;
  }
  const race = raceById(draftRaceId);
  document.title = "Ton coureur — Le Profil";
  app.innerHTML = `
    <section class="sheet" data-screen="avatar">
      <header class="intro">
        ${brand()}
        <p class="eyebrow">${escapeHtml(race.short)} · ${escapeHtml(race.name)}</p>
        <h1>Ton coureur</h1>
        <p class="deck">Un nom, un maillot. Il courra de profil sur le dessin de la course.</p>
      </header>
      <form id="avatar-form" class="avatar-layout">
        <div class="avatar-fields">
          <label class="field">
            <span>Nom</span>
            <input id="name" name="name" maxlength="18" required autocomplete="nickname" placeholder="Camille" value="${escapeHtml(draft.name)}" />
          </label>
          <fieldset>
            <legend>Teint</legend>
            <div class="choices">${SKINS.map(
              (color, index) => `
                <label class="swatch">
                  <input type="radio" name="skin" value="${index}" ${draft.skin === index ? "checked" : ""} />
                  <span style="background:${color}" aria-label="${SKIN_LABELS[index] ?? ""}"></span>
                </label>`,
            ).join("")}</div>
          </fieldset>
          <fieldset>
            <legend>Cheveux</legend>
            <div class="choices text-choices">${HAIR_OPTIONS.map(
              (option) => `
                <label class="chip">
                  <input type="radio" name="hair" value="${option.id}" ${draft.hair === option.id ? "checked" : ""} />
                  <span>${option.label}</span>
                </label>`,
            ).join("")}</div>
          </fieldset>
          <fieldset>
            <legend>Maillot</legend>
            <div class="choices">${JERSEYS.map(
              (color, index) => `
                <label class="swatch">
                  <input type="radio" name="jersey" value="${index}" ${draft.jersey === index ? "checked" : ""} />
                  <span style="background:${color}" aria-label="${JERSEY_LABELS[index] ?? ""}"></span>
                </label>`,
            ).join("")}</div>
          </fieldset>
          <p id="avatar-error" class="form-error" role="alert"></p>
          <div class="row-actions">
            <button type="button" class="ghost" id="back">Retour aux courses</button>
            <button type="submit" class="primary">C'est parti</button>
          </div>
        </div>
        <div class="preview-card">
          <svg id="preview" viewBox="0 0 280 220" role="img" aria-label="Aperçu du coureur"></svg>
          <p id="preview-name">Ton coureur</p>
        </div>
      </form>
    </section>
  `;
  const form = byId<HTMLFormElement>("avatar-form");
  const name = byId<HTMLInputElement>("name");
  const preview = byId<SVGSVGElement>("preview");
  const previewName = byId<HTMLElement>("preview-name");
  const error = byId<HTMLElement>("avatar-error");

  const refresh = () => {
    draft.name = name.value;
    const skin = Number(selected("skin") ?? draft.skin);
    const hair = (selected("hair") ?? draft.hair) as Hair;
    const jersey = Number(selected("jersey") ?? draft.jersey);
    draft = { ...draft, skin, hair, jersey };
    fillPreview(preview, { ...draft, name: draft.name || "Coureur" });
    previewName.textContent = draft.name.trim() || "Ton coureur";
  };

  form.addEventListener("change", refresh);
  name.addEventListener("input", refresh);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const trimmed = name.value.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      error.textContent = "Choisis un nom pour ton coureur.";
      name.focus();
      return;
    }
    if (!draftRaceId) return;
    error.textContent = "";
    const next: Save = {
      v: 1,
      raceId: draftRaceId,
      avatar: { ...draft, name: trimmed.slice(0, 18) },
      segmentIndex: 0,
      kmFilled: 0,
      elevationFilled: 0,
      outings: 0,
      lastComment: null,
    };
    showTrail(next);
  });
  byId<HTMLButtonElement>("back").addEventListener("click", () => showRaces());
  refresh();
  name.focus();
}

function showTrail(next: Save): void {
  save = sanitizeSave(next);
  writeSave(save);
  const race = raceById(save.raceId);
  document.title = `${race.short} — Le Profil`;
  app.innerHTML = `
    <section class="trail" data-screen="trail">
      <header class="topbar">
        <div class="brand-lockup">
          ${brandMark()}
          <div>
            <p class="brand-name">Le Profil</p>
            <p class="brand-race">${escapeHtml(race.short)} · ${escapeHtml(race.name)}</p>
          </div>
        </div>
        <div class="who">
          <span id="who-avatar"></span>
          <span id="who-name"></span>
        </div>
        <button type="button" id="reset">Recommencer</button>
      </header>
      <div class="trail-body">
        <div class="stage">
          <div class="world-wrap">
            <svg id="world" viewBox="0 0 960 420" preserveAspectRatio="xMidYMid slice"></svg>
          </div>
          <svg id="minimap" viewBox="0 0 960 72" preserveAspectRatio="none"></svg>
        </div>
        <aside class="panel">
          <p id="segment-kicker" class="eyebrow"></p>
          <h2 id="segment-title"></h2>
          <p id="segment-meta" class="meta"></p>
          <p id="race-progress" class="meta"></p>
          <div id="gauges">
            <div class="meter">
              <div class="meter-top"><span>Kilomètres</span><strong id="km-label"></strong></div>
              <div id="km-gauge" class="gauge" role="meter" aria-label="Kilomètres du tronçon">
                <span id="km-fill"></span>
              </div>
            </div>
            <div class="meter">
              <div class="meter-top"><span>Dénivelé +</span><strong id="elev-label"></strong></div>
              <div id="elev-gauge" class="gauge elev" role="meter" aria-label="Dénivelé positif du tronçon">
                <span id="elev-fill"></span>
              </div>
            </div>
          </div>
          <p class="rule">Le coureur avance seulement si le tronçon a tous ses kilomètres et tout son D+.</p>
          <div id="arrival" class="arrival" hidden></div>
          <form id="outing-form">
            <h3>Sortie du jour</h3>
            <div class="fields">
              <label class="field">
                <span>Distance (km)</span>
                <input id="km" inputmode="decimal" autocomplete="off" placeholder="12" />
              </label>
              <label class="field">
                <span>Dénivelé + (m)</span>
                <input id="elev" inputmode="numeric" autocomplete="off" placeholder="600" />
              </label>
            </div>
            <p id="grade-hint" class="hint"></p>
            <p id="form-error" class="form-error" role="alert"></p>
            <button type="submit" class="primary">Enregistrer la sortie</button>
            <p id="outing-count" class="hint"></p>
          </form>
          <div id="coach" class="coach is-empty">
            <p class="kicker">Le coach</p>
            <p id="coach-line" aria-live="polite"></p>
          </div>
          <p class="fine">Profil schématique, pas le tracé officiel.</p>
        </aside>
      </div>
    </section>
  `;
  byId<HTMLElement>("who-avatar").append(runnerBadge(save.avatar));
  byId<HTMLElement>("who-name").textContent = save.avatar.name;
  byId<HTMLButtonElement>("reset").addEventListener("click", resetRun);
  byId<HTMLFormElement>("outing-form").addEventListener("submit", onOuting);
  byId<HTMLInputElement>("km").addEventListener("input", () => {
    clearFormError();
    updateGrade();
  });
  byId<HTMLInputElement>("elev").addEventListener("input", () => {
    clearFormError();
    updateGrade();
  });
  syncPanel();
  paint(clearedDistance(race.segments, save.segmentIndex), false);
  if (save.segmentIndex < race.segments.length) {
    byId<HTMLInputElement>("km").focus();
  }
}

function onOuting(event: Event): void {
  event.preventDefault();
  if (!save || animating) return;
  const race = raceById(save.raceId);
  if (save.segmentIndex >= race.segments.length) return;
  const kmRaw = byId<HTMLInputElement>("km").value;
  const elevRaw = byId<HTMLInputElement>("elev").value;
  const kmValue = parseLoose(kmRaw);
  const elevValue = parseLoose(elevRaw);
  const error = byId<HTMLElement>("form-error");
  if (kmValue === null) {
    error.textContent = "Indique la distance en kilomètres, entre 0,1 et 80.";
    return;
  }
  const km = Math.round(kmValue * 10) / 10;
  if (km < 0.1 || km > 80) {
    error.textContent = "Indique la distance en kilomètres, entre 0,1 et 80.";
    return;
  }
  if (elevValue === null) {
    error.textContent = "Indique le dénivelé positif en mètres, entre 0 et 4 000.";
    return;
  }
  const elevation = Math.round(elevValue);
  if (elevation < 0 || elevation > 4000) {
    error.textContent = "Indique le dénivelé positif en mètres, entre 0 et 4 000.";
    return;
  }
  if (elevation / km > 400) {
    error.textContent = "Trop de dénivelé pour cette distance.";
    return;
  }
  error.textContent = "";

  const fromKm = clearedDistance(race.segments, save.segmentIndex);
  const result = applyOuting(
    race.segments,
    {
      segmentIndex: save.segmentIndex,
      kmFilled: save.kmFilled,
      elevationFilled: save.elevationFilled,
    },
    km,
    elevation,
  );
  const current = result.finished
    ? null
    : race.segments[result.progress.segmentIndex];
  const gateIndex = result.progress.segmentIndex - 1;
  const gate = race.segments[gateIndex]?.to ?? null;
  const comment = coachComment({
    finished: result.finished,
    finishTown: finishTown(race),
    segmentsCleared: result.segmentsCleared,
    gate,
    kmApplied: result.kmApplied,
    elevationApplied: result.elevationApplied,
    segmentKm: current?.km ?? 0,
    segmentElevation: current?.elevation ?? 0,
    kmFull: current ? result.progress.kmFilled >= current.km - 0.0005 : false,
    elevationFull: current
      ? result.progress.elevationFilled >= current.elevation
      : false,
    kmRemaining: current
      ? Math.max(0, current.km - result.progress.kmFilled)
      : 0,
    elevationRemaining: current
      ? Math.max(0, current.elevation - result.progress.elevationFilled)
      : 0,
  });
  save = {
    ...save,
    segmentIndex: result.progress.segmentIndex,
    kmFilled: result.progress.kmFilled,
    elevationFilled: result.progress.elevationFilled,
    outings: save.outings + 1,
    lastComment: comment,
  };
  writeSave(save);
  byId<HTMLInputElement>("km").value = "";
  byId<HTMLInputElement>("elev").value = "";
  byId<HTMLElement>("grade-hint").textContent = "";
  syncPanel();
  const toKm = clearedDistance(race.segments, save.segmentIndex);
  animate(fromKm, toKm);
}

function syncPanel(): void {
  if (!save) return;
  const race = raceById(save.raceId);
  const finished = save.segmentIndex >= race.segments.length;
  const segment = race.segments[save.segmentIndex];
  const kicker = byId<HTMLElement>("segment-kicker");
  const title = byId<HTMLElement>("segment-title");
  const meta = byId<HTMLElement>("segment-meta");
  const progress = byId<HTMLElement>("race-progress");
  const arrival = byId<HTMLElement>("arrival");
  const form = byId<HTMLFormElement>("outing-form");
  const gauges = byId<HTMLElement>("gauges");
  const coach = byId<HTMLElement>("coach");
  const coachLine = byId<HTMLElement>("coach-line");

  const covered = coveredTotals(save, race);
  progress.textContent = `Course : ${formatKm(covered.km)} / ${formatKm(totalKm(race))} km · ${formatInt(covered.elevation)} / ${formatInt(totalElevation(race))} m D+`;

  if (finished || !segment) {
    kicker.textContent = "Arrivée";
    title.textContent = finishTown(race);
    meta.textContent = "Tous les tronçons sont couverts.";
    gauges.hidden = true;
    form.hidden = true;
    arrival.hidden = false;
    arrival.textContent = `${save.avatar.name} est à ${finishTown(race)}.`;
  } else {
    gauges.hidden = false;
    form.hidden = false;
    arrival.hidden = true;
    kicker.textContent = `Tronçon ${save.segmentIndex + 1} sur ${race.segments.length}`;
    title.textContent = `${segment.from} → ${segment.to}`;
    meta.textContent = describeSegment(segment);
    setMeter(
      "km",
      save.kmFilled,
      segment.km,
      `${formatKm(save.kmFilled)} / ${formatKm(segment.km)} km`,
    );
    setMeter(
      "elev",
      save.elevationFilled,
      segment.elevation,
      `${formatInt(save.elevationFilled)} / ${formatInt(segment.elevation)} m`,
    );
  }

  byId<HTMLElement>("outing-count").textContent =
    save.outings === 0
      ? "Aucune sortie enregistrée."
      : `Sorties enregistrées : ${save.outings}`;

  if (save.lastComment) {
    coach.classList.remove("is-empty");
    coachLine.textContent = save.lastComment;
  } else {
    coach.classList.add("is-empty");
    coachLine.textContent = "Le coach parlera après la première sortie.";
  }
}

function setMeter(kind: "km" | "elev", filled: number, need: number, label: string): void {
  const pct = need <= 0 ? 0 : Math.min(100, (filled / need) * 100);
  byId<HTMLElement>(`${kind}-label`).textContent = label;
  byId<HTMLElement>(`${kind}-fill`).style.width = `${pct}%`;
  const gauge = byId<HTMLElement>(`${kind}-gauge`);
  gauge.setAttribute("aria-valuemin", "0");
  gauge.setAttribute("aria-valuemax", String(need));
  gauge.setAttribute("aria-valuenow", String(Math.round(filled * 10) / 10));
}

function paint(visualKm: number, moving: boolean): void {
  if (!save) return;
  const race = raceById(save.raceId);
  const points = buildProfile(race);
  drawWorld(byId<SVGSVGElement>("world"), race, points, visualKm, save.avatar, moving);
  drawMinimap(byId<SVGSVGElement>("minimap"), race, points, visualKm);
}

function animate(fromKm: number, toKm: number): void {
  if (Math.abs(toKm - fromKm) < 0.01 || reduceMotion) {
    animating = false;
    setFormLocked(false);
    paint(toKm, false);
    return;
  }
  const token = ++animToken;
  animating = true;
  setFormLocked(true);
  const duration = Math.min(2400, Math.max(700, Math.abs(toKm - fromKm) * 70));
  const started = performance.now();
  const step = (now: number) => {
    if (token !== animToken) return;
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - t) ** 3;
    paint(fromKm + (toKm - fromKm) * eased, true);
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    animating = false;
    setFormLocked(false);
    paint(toKm, false);
  };
  requestAnimationFrame(step);
}

function setFormLocked(locked: boolean): void {
  const button = document.querySelector<HTMLButtonElement>("#outing-form button");
  if (button) button.disabled = locked;
}

function updateGrade(): void {
  const hint = byId<HTMLElement>("grade-hint");
  const km = parseLoose(byId<HTMLInputElement>("km").value);
  const elevation = parseLoose(byId<HTMLInputElement>("elev").value);
  if (km === null || elevation === null || km <= 0) {
    hint.textContent = "";
    hint.classList.remove("is-error");
    return;
  }
  const grade = elevation / km;
  if (grade > 400) {
    hint.textContent = "Trop raide pour être enregistrée.";
    hint.classList.add("is-error");
    return;
  }
  const kind = grade < 25 ? "plutôt plate" : grade > 70 ? "plutôt raide" : "mixte";
  hint.textContent = `Environ ${formatInt(grade)} m de D+ par km — sortie ${kind}.`;
  hint.classList.remove("is-error");
}

function clearFormError(): void {
  const error = document.getElementById("form-error");
  if (error) error.textContent = "";
}

function resetRun(): void {
  if (!window.confirm("Recommencer efface la partie en cours. Continuer ?")) return;
  animToken += 1;
  animating = false;
  clearSave();
  save = null;
  showRaces();
}

function coveredTotals(current: Save, race: Race): { km: number; elevation: number } {
  let km = 0;
  let elevation = 0;
  for (let i = 0; i < current.segmentIndex && i < race.segments.length; i += 1) {
    km += race.segments[i]?.km ?? 0;
    elevation += race.segments[i]?.elevation ?? 0;
  }
  if (current.segmentIndex < race.segments.length) {
    km += current.kmFilled;
    elevation += current.elevationFilled;
  }
  return { km, elevation };
}

function raceCard(race: Race): string {
  const points = buildProfile(race);
  const d = sparklinePath(points, 220, 48);
  return `
    <button type="button" class="race-card" data-race="${race.id}">
      <p class="eyebrow">${escapeHtml(race.lengthLabel)}</p>
      <h2>${escapeHtml(race.short)}</h2>
      <p class="race-name">${escapeHtml(race.name)}</p>
      <p class="stats">${formatKm(totalKm(race))} km · ${formatInt(totalElevation(race))} m D+</p>
      <svg class="spark" viewBox="0 0 220 48" aria-hidden="true">
        <path d="${d}" />
      </svg>
      <p class="blurb">${escapeHtml(race.blurb)} ${race.segments.length} tronçons.</p>
      <span class="choose">Choisir</span>
    </button>
  `;
}

function publishedNote(): string {
  const bits = RACES.map((race) => {
    const totals = PUBLISHED_TOTALS[race.id];
    return `${race.short} ${formatKm(totals.km)} km / ${formatInt(totals.elevation)} m`;
  });
  return `Distances et dénivelés positifs : ordres de grandeur publics de l'édition 2025 (${bits.join(", ")}). Le profil dessiné est schématique : ce n'est pas le tracé officiel.`;
}

function brand(): string {
  return `<p class="brand-inline">${brandMark()} <span>Le Profil</span></p>`;
}

function brandMark(): string {
  return `<svg class="mark" viewBox="0 0 48 24" aria-hidden="true"><path d="M1 20 L12 8 L18 14 L29 3 L36 12 L47 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function selected(name: string): string | null {
  const node = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return node?.value ?? null;
}

function parseLoose(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function byId<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément manquant : ${id}`);
  return node as unknown as T;
}
