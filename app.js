/* Vereinsdatenbank mobil – TTV Werragrund 08 (nur Ansicht).
 *
 * Die App rechnet nichts selbst: das PC-Programm schreibt beim Beenden die Datei Handy-App/mobil_daten.json.gz in
 * den Datenordner (Google Drive). Die App liest sie mit Google-Anmeldung (Leserecht, drive.readonly) und hält den
 * letzten Stand in IndexedDB, damit er auch ohne Netz lesbar ist. Ändern geht nur am PC.
 */
"use strict";

const CFG = Object.assign({ googleClientId: "", dateiName: "mobil_daten.json.gz", ordnerName: "Handy-App" },
  window.APP_CONFIG || {});
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const VERSION_APP = "1.0";

// ===================================================================================================== Helfer
const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function datum(iso) { if (!iso) return null; const [j, m, t] = String(iso).slice(0, 10).split("-").map(Number); return new Date(j, m - 1, t); }
function heute() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isoTag(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function tageBis(iso) { const d = datum(iso); return d ? Math.round((d - heute()) / 86400000) : null; }
function dmy(iso, jahr = true) {
  const d = datum(iso); if (!d) return "";
  const s = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  return jahr ? s + d.getFullYear() : s;
}
function wtDatum(iso) { const d = datum(iso); return d ? `${WT[d.getDay()]} ${dmy(iso, false)}` : ""; }
function eur(x) { return x == null ? "–" : x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function initialen(vor, nach) { return ((vor || "")[0] || "") + ((nach || "")[0] || ""); }
function farbIndex(t) { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 6; }
function relZeit(isoZeit) {
  if (!isoZeit) return "";
  const d = new Date(isoZeit); const t = heute(); const tag = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((t - tag) / 86400000);
  const uhr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return diff === 0 ? `heute ${uhr}` : diff === 1 ? `gestern ${uhr}` : `${dmy(isoZeit)} ${uhr}`;
}
function pille(text, art = "") { return `<span class="pille ${art}">${esc(text)}</span>`; }
function ergebnisArt(e) { if (!e) return ""; return e[0] > e[1] ? "gruen" : e[0] < e[1] ? "rot" : ""; }
function proz(a, b) { return a + b ? Math.round((100 * a) / (a + b)) : 0; }
function bal(s, u, n) {
  const t = s + u + n || 1;
  return `<div class="balken"><div class="s" style="width:${(100 * s) / t}%"></div><div class="u" style="width:${(100 * u) / t}%"></div><div class="n" style="width:${(100 * n) / t}%"></div></div>`;
}
function norm(t) { return String(t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss").replace(/\s+/g, " ").trim(); }

const ICON = {
  start: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  mitglieder: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.3c2.1.6 3.5 2.8 3.5 5.7"/>',
  kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  spiele: '<circle cx="9" cy="10" r="6"/><path d="M13.2 14.2l6.3 6.3"/><circle cx="19" cy="5" r="2"/>',
  mehr: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  org: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  leben: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  fin: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  dok: '<path d="M3 7h6l2 2h10v10H3z"/>',
  pdf: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  chevunten: '<path d="M6 9l6 6 6-6"/>',
  zurueck: '<path d="M15 5l-7 7 7 7"/>',
  suche: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  schloss: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  wolke: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M12 11v5M9.5 13.5L12 16l2.5-2.5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  mond: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  neu: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  bild: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
};
function ic(name, groesse = 20, extra = "") {
  return `<svg width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[name] || ""}</svg>`;
}
const CHEV = `<span style="color:var(--chev);display:flex">${ic("chev", 18)}</span>`;

function toast(text, ms = 2600) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ===================================================================================================== Speicher (IndexedDB)
const DB = {
  _db: null,
  oeffne() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, fehler) => {
      const r = indexedDB.open("ttv08", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this._db = r.result; ok(this._db); };
      r.onerror = () => fehler(r.error);
    });
  },
  async hole(k) {
    const db = await this.oeffne();
    return new Promise((ok, fehler) => { const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error); });
  },
  async setze(k, v) {
    const db = await this.oeffne();
    return new Promise((ok, fehler) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => ok(); t.onerror = () => fehler(t.error); });
  },
  async leeren() {
    const db = await this.oeffne();
    return new Promise((ok) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").clear(); t.oncomplete = () => ok(); });
  },
};

async function entpacke(puffer) {
  const b = new Uint8Array(puffer);
  if (b[0] === 0x1f && b[1] === 0x8b) { // gzip
    if (!("DecompressionStream" in window)) throw new Error("Dieses Gerät ist zu alt (iOS 16.4 oder neuer nötig).");
    const strom = new Blob([puffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(strom).text());
  }
  return JSON.parse(new TextDecoder().decode(puffer));
}

// ===================================================================================================== Google (nur lesen)
const Google = {
  token() {
    try {
      const t = JSON.parse(localStorage.getItem("g_token") || "null");
      return t && t.ablauf > Date.now() + 60000 ? t.wert : null;
    } catch (e) { return null; }
  },
  angemeldet() { return localStorage.getItem("g_angemeldet") === "1"; },
  // Anmeldung über Weiterleitung (funktioniert auch in der App vom Home-Bildschirm, ohne Pop-up)
  anmelden(still = false) {
    if (!CFG.googleClientId) { toast("Google ist noch nicht eingerichtet (config.js)."); return; }
    const zustand = Math.random().toString(36).slice(2);
    localStorage.setItem("g_zustand", zustand);
    localStorage.setItem("g_ziel", location.hash && !location.hash.includes("access_token") ? location.hash : "#/start");
    const p = new URLSearchParams({
      client_id: CFG.googleClientId, redirect_uri: location.origin + location.pathname, response_type: "token",
      scope: SCOPE, include_granted_scopes: "true", state: zustand,
    });
    const hint = localStorage.getItem("g_email");
    if (hint) p.set("login_hint", hint);
    if (still) p.set("prompt", "none"); else if (Google.token()) p.set("prompt", "select_account");
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
  },
  // Rückkehr von Google: #access_token=…&expires_in=…&state=…
  rueckkehr() {
    if (!location.hash.includes("access_token=") && !location.hash.includes("error=")) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const ziel = localStorage.getItem("g_ziel") || "#/start";
    const erwartet = localStorage.getItem("g_zustand");
    localStorage.removeItem("g_zustand");
    if (erwartet && p.get("state") !== erwartet) {
      sessionStorage.setItem("g_fehler", "Sicherheitsprüfung fehlgeschlagen – bitte noch einmal anmelden");
      history.replaceState(null, "", location.pathname + ziel); return false;
    }
    if (p.get("access_token")) {
      localStorage.setItem("g_token", JSON.stringify({ wert: p.get("access_token"), ablauf: Date.now() + Number(p.get("expires_in") || 3600) * 1000 }));
      localStorage.setItem("g_angemeldet", "1");
      sessionStorage.setItem("g_frisch", "1");
    } else if (p.get("error")) {
      const fehlerText = { access_denied: "Zugriff nicht erlaubt (abgebrochen oder Konto nicht als Testnutzer eingetragen)",
        interaction_required: "bitte neu anmelden", login_required: "bitte neu anmelden", consent_required: "bitte neu anmelden" };
      sessionStorage.setItem("g_fehler", fehlerText[p.get("error")] || p.get("error"));
      if (["interaction_required", "login_required", "consent_required"].includes(p.get("error"))) localStorage.removeItem("g_angemeldet");
    }
    history.replaceState(null, "", location.pathname + ziel);
    return true;
  },
  async api(pfad, optionen = {}) {
    const t = this.token(); if (!t) throw Object.assign(new Error("Anmeldung abgelaufen"), { abgelaufen: true });
    const r = await fetch("https://www.googleapis.com/drive/v3/" + pfad, { headers: { Authorization: "Bearer " + t } });
    if (r.status === 401) { localStorage.removeItem("g_token"); throw Object.assign(new Error("Anmeldung abgelaufen"), { abgelaufen: true }); }
    if (!r.ok) throw new Error(`Google Drive meldet ${r.status}`);
    return optionen.roh ? r : r.json();
  },
  async suche(q, felder = "files(id,name,modifiedTime,parents,mimeType,webViewLink,thumbnailLink,size)") {
    const p = new URLSearchParams({ q, fields: felder, pageSize: "50", supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives", orderBy: "modifiedTime desc" });
    return (await this.api("files?" + p.toString())).files || [];
  },
  async benutzer() { try { return (await this.api("about?fields=user(displayName,emailAddress)")).user; } catch (e) { return null; } },
  // Die Datei der App finden: Ordner „Handy-App“ -> mobil_daten.json.gz (neueste, falls mehrere)
  async findeDatei() {
    const name = CFG.dateiName.replace(/'/g, "\\'");
    const treffer = await this.suche(`name = '${name}' and trashed = false`);
    for (const f of treffer) {
      for (const eltern of f.parents || []) {
        const o = await this.api(`files/${eltern}?fields=id,name,parents&supportsAllDrives=true`);
        if (o.name === CFG.ordnerName) return { datei: f, wurzel: (o.parents || [])[0] };
      }
    }
    return treffer[0] ? { datei: treffer[0], wurzel: null } : null;
  },
  async lade(id) { return (await this.api(`files/${id}?alt=media&supportsAllDrives=true`, { roh: true })).arrayBuffer(); },
  // Datei über ihren Pfad im Datenordner finden („Dokumente/Satzung und Ordnungen/…pdf“)
  _ordner: {},
  async dateiZuPfad(pfad) {
    const wurzel = localStorage.getItem("g_wurzel");
    if (!wurzel || !pfad) return null;
    const teile = pfad.split("/").filter(Boolean);
    let eltern = wurzel;
    for (let i = 0; i < teile.length; i++) {
      const schluessel = eltern + "/" + teile[i];
      if (i < teile.length - 1 && this._ordner[schluessel]) { eltern = this._ordner[schluessel]; continue; }
      const name = teile[i].replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const f = (await this.suche(`name = '${name}' and '${eltern}' in parents and trashed = false`))[0];
      if (!f) return null;
      if (i < teile.length - 1) { this._ordner[schluessel] = f.id; eltern = f.id; } else return f;
    }
    return null;
  },
};

// ===================================================================================================== Zustand
const S = {
  daten: null,          // was die App zeigt: mobil_daten.json, ergänzt um frische Tabellen/Spielpläne (live.json)
  roh: null,            // mobil_daten.json wie vom PC geschrieben
  live: null,           // live.json: Tabellen und Spielpläne, die GitHub alle paar Stunden von mytischtennis.de holt
  geladen: null,        // wann vom Server geholt (ISO)
  quelle: null,         // "google" | "datei"
  laedt: false,
  fehler: "",
  benutzer: null,       // {displayName, emailAddress}
  ansicht: {},          // Filter je Seite (Saison, Suche …)
  verlauf: [],          // besuchte Seiten [{hash, titel}] – „Zurück“ führt zur Seite, von der man kam
};
const ansicht = (seite, vorgabe = {}) => (S.ansicht[seite] = S.ansicht[seite] || { ...vorgabe });

async function ladeAusSpeicher() {
  try {
    const e = await DB.hole("daten");
    if (e && e.puffer) {
      S.roh = await entpacke(e.puffer); S.geladen = e.geladen; S.quelle = e.quelle; S.benutzer = e.benutzer || null;
      try { S.live = (await DB.hole("live")) || null; } catch (err) { S.live = null; }
      anwenden();
      return true;
    }
  } catch (err) { console.warn(err); }
  return false;
}

async function speichere(puffer, quelle) {
  S.geladen = new Date().toISOString(); S.quelle = quelle;
  try { await DB.setze("daten", { puffer, geladen: S.geladen, quelle, benutzer: S.benutzer }); } catch (e) { console.warn(e); }
}

async function ladeVonGoogle({ leise = false } = {}) {
  if (!navigator.onLine) { if (!leise) toast("Keine Verbindung – es bleibt der gespeicherte Stand."); return; }
  if (!Google.token()) { if (Google.angemeldet()) Google.anmelden(true); else zeige(); return; }
  S.laedt = true; S.fehler = ""; zeige();
  try {
    if (!S.benutzer) {
      S.benutzer = await Google.benutzer();
      if (S.benutzer?.emailAddress) localStorage.setItem("g_email", S.benutzer.emailAddress);
    }
    const f = await Google.findeDatei();
    if (!f) throw new Error(`Die Datei „${CFG.ordnerName}/${CFG.dateiName}“ ist für dieses Google-Konto nicht zu finden. Entweder hat das Programm am PC sie noch nicht in den Datenordner geschrieben (Datei → „Handy-App jetzt aktualisieren“), oder der Datenordner ist für dieses Konto nicht freigegeben.`);
    if (f.wurzel) localStorage.setItem("g_wurzel", f.wurzel);
    const puffer = await Google.lade(f.datei.id);
    S.roh = await entpacke(puffer); anwenden();
    await speichere(puffer, "google");
    ladeLive();
    if (!leise) toast("Aktualisiert – Stand " + relZeit(S.daten.meta.erzeugt));
  } catch (e) {
    if (e.abgelaufen) { Google.anmelden(true); return; }
    S.fehler = e.message || String(e);
  } finally {
    S.laedt = false; zeige();
  }
}

async function ladeDatei(datei) {
  try {
    const puffer = await datei.arrayBuffer();
    const roh = await entpacke(puffer);
    if (!roh.meta) throw new Error("Das ist keine Datei der Vereinsdatenbank.");
    S.roh = roh; anwenden(); ladeLive();
    await speichere(puffer, "datei");
    location.hash = "#/start"; zeige();
  } catch (e) { toast("Datei nicht lesbar: " + e.message, 4000); }
}

async function abmelden() {
  const t = Google.token();
  if (t) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + t, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }); } catch (e) { /* offline */ } }
  ["g_token", "g_angemeldet", "g_wurzel", "g_email"].forEach((k) => localStorage.removeItem(k));
  await DB.leeren();
  S.daten = null; S.roh = null; S.live = null; S.benutzer = null; S.geladen = null; S.quelle = null;
  location.hash = "#/"; zeige();
  toast("Abgemeldet – die Daten sind von diesem Gerät gelöscht.");
}

// ===================================================================================================== Frische Tabellen und Spielpläne
// GitHub holt alle paar Stunden die öffentlichen Tabellen und Spielpläne von mytischtennis.de (live.json neben der App).
// Sind sie neuer als die Datei vom PC, ersetzen sie dort Tabellen und Spieltermine. Spielberichte, eigene Termine und
// alles andere kommen weiter vom PC.
// Seit 17.11.2026 abgeschaltet: mytischtennis.de sperrt Abrufe von GitHub (HTTP 429). Tabellen, Spielpläne und die
// Formanalyse kommen jetzt mit der Datei vom PC (Spielplan wird dort täglich mit der Tabelle geladen).
const LIVE_URLS = [];
async function ladeLive() {
  if (!navigator.onLine || !S.roh) return;
  let bestes = null;
  for (const url of LIVE_URLS) {
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) continue;
      const l = await r.json();
      if (l && l.format === 1 && (!bestes || `${l.erzeugt}|${l.geprueft}` > `${bestes.erzeugt}|${bestes.geprueft}`)) bestes = l;
    } catch (e) { /* nicht erreichbar */ }
  }
  if (!bestes || (S.live && `${S.live.erzeugt}|${S.live.geprueft}` >= `${bestes.erzeugt}|${bestes.geprueft}`)) return;
  S.live = bestes;
  try { await DB.setze("live", bestes); } catch (e) { /* egal */ }
  anwenden(); zeige();
}
function anwenden() {
  if (!S.roh) { S.daten = null; return; }
  const d = typeof structuredClone === "function" ? structuredClone(S.roh) : JSON.parse(JSON.stringify(S.roh));
  const l = S.live;
  d.liveInfo = null;
  if (l && d.spielbetrieb) {
    const pcZeit = d.meta?.erzeugt || "";
    // Tabellen: Ligen aus live.json ersetzen gleichnamige, wenn sie neuer sind als der Stand vom PC
    let tabellenNeu = false;
    for (const [saison, lt] of Object.entries(l.tabellen || {})) {
      const t = (d.spielbetrieb.tabellen = d.spielbetrieb.tabellen || {})[saison] || { stand: "", ligen: [] };
      if ((t.stand || "") > (lt.stand || "")) continue;
      for (const liga of lt.ligen) {
        const i = t.ligen.findIndex((x) => norm(x.liga) === norm(liga.liga));
        if (i >= 0) t.ligen[i] = liga; else t.ligen.push(liga);
      }
      t.stand = lt.stand; t.live = true; d.spielbetrieb.tabellen[saison] = t; tabellenNeu = true;
    }
    // Spieltermine: je Mannschaft der Spielplan aus live.json statt des Stands vom PC (wenn neuer)
    const spieleNeu = (l.erzeugt || "") > pcZeit && (l.spiele || []).length;
    if (spieleNeu && d.kalender) {
      const nr = new Set(l.spiele.map((s) => s.mannschaft).filter(Boolean));
      const farbe = {};
      for (const t of d.kalender.termine) if (t.spiel && t.mannschaft) farbe[t.mannschaft] = t.farbe;
      d.kalender.termine = d.kalender.termine.filter((t) => !(t.spiel && nr.has(t.mannschaft)))
        .concat(l.spiele.filter((s) => nr.has(s.mannschaft)).map((s) => ({
          datum: s.datum, bis: null, uhrzeit: s.uhrzeit, titel: s.titel, text: s.text, ort: s.ort, bereich: "Spielbetrieb",
          frist: false, status: datum(s.datum) < heute() ? "vorbei" : "", spiel: true, abo: true, mannschaft: s.mannschaft,
          farbe: farbe[s.mannschaft] || d.kalender.bereiche?.Spielbetrieb || "#2563a8", heim: s.heim, gegner: s.gegner, team: s.team })))
        .sort((a, b) => (a.datum + (a.uhrzeit || "")).localeCompare(b.datum + (b.uhrzeit || "")));
    }
    if (tabellenNeu || spieleNeu) d.liveInfo = { geprueft: l.geprueft, erzeugt: l.erzeugt, spiele: !!spieleNeu };
  }
  S.daten = d;
}

// Datei aus dem Datenordner öffnen (PDF in Google Drive, Bilder in der App)
async function oeffneDatei(pfad) {
  if (!pfad) { toast("Keine Datei hinterlegt."); return; }
  if (S.quelle !== "google") { toast("Dateien öffnen geht nur mit Google-Anmeldung."); return; }
  if (!navigator.onLine) { toast("Ohne Netz lassen sich Dateien nicht öffnen."); return; }
  const fenster = window.open("", "_blank"); // sofort öffnen (sonst blockiert Safari das Fenster)
  try {
    const f = await Google.dateiZuPfad(pfad);
    if (!f) { fenster && fenster.close(); toast("Datei im Drive nicht gefunden."); return; }
    const ziel = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
    if (fenster) fenster.location.href = ziel; else location.href = ziel;
  } catch (e) {
    fenster && fenster.close();
    if (e.abgelaufen) { toast("Anmeldung abgelaufen – bitte oben „Aktualisieren“ tippen."); return; }
    toast("Datei nicht erreichbar: " + e.message);
  }
}

// Bilder (Vereinsleben, Fotos): Vorschaubild von Google; die Datei selbst nur, wenn nötig (Betrachter)
const dateiCache = new Map();
function driveDatei(pfad) {
  if (!dateiCache.has(pfad)) dateiCache.set(pfad, Google.dateiZuPfad(pfad).catch(() => null));
  return dateiCache.get(pfad);
}
const blobCache = new Map();
async function bildVoll(pfad) {
  if (blobCache.has(pfad)) return blobCache.get(pfad);
  const f = await driveDatei(pfad); if (!f) return null;
  const r = await Google.api(`files/${f.id}?alt=media&supportsAllDrives=true`, { roh: true });
  const url = URL.createObjectURL(await r.blob()); blobCache.set(pfad, url); return url;
}
// <span data-bild="pfad" data-groesse="400"> nach dem Zeichnen mit dem Bild füllen
function bilderNachladen(wurzel) {
  if (S.quelle !== "google" || !navigator.onLine) return;
  wurzel.querySelectorAll("[data-bild]").forEach(async (el) => {
    const pfad = el.dataset.bild; el.removeAttribute("data-bild");
    const groesse = Number(el.dataset.groesse || 400);
    const f = await driveDatei(pfad); if (!f) return;
    const img = new Image(); img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    let versuchtVoll = false;
    img.onerror = async () => { // Vorschau nicht erreichbar: die Datei selbst laden
      if (versuchtVoll) return; versuchtVoll = true;
      try { const u = await bildVoll(pfad); if (u) img.src = u; } catch (e) { /* bleibt leer */ }
    };
    img.onload = () => { el.innerHTML = ""; el.appendChild(img); };
    if (f.thumbnailLink) img.src = f.thumbnailLink.replace(/=s\d+$/, "=s" + groesse);
    else img.onerror();
  });
}

// ===================================================================================================== Navigation
const REITER = [
  { id: "start", titel: "Start", icon: "start", seiten: ["start"] },
  { id: "mitglieder", titel: "Mitglieder", icon: "mitglieder", seiten: ["mitglieder", "mitglied"] },
  { id: "kalender", titel: "Kalender", icon: "kalender", seiten: ["kalender"] },
  { id: "spiele", titel: "Spiele", icon: "spiele", seiten: ["spiele", "spiel", "gegner", "spieler", "form"] },
  { id: "mehr", titel: "Mehr", icon: "mehr", seiten: ["mehr", "organisation", "versammlung", "vereinsleben", "eintrag", "dokumente"] },
];
// Seitenleiste auf dem iPad: alles direkt erreichbar
const NAV_GROSS = [
  { hash: "#/start", titel: "Start", icon: "start", seiten: ["start"] },
  { hash: "#/mitglieder", titel: "Mitglieder", icon: "mitglieder", seiten: ["mitglieder", "mitglied"] },
  { hash: "#/kalender", titel: "Kalender", icon: "kalender", seiten: ["kalender"] },
  { hash: "#/spiele", titel: "Spielbetrieb", icon: "spiele", seiten: ["spiele", "spiel", "gegner", "spieler", "form"] },
  { hash: "#/vereinsleben", titel: "Vereinsleben", icon: "leben", seiten: ["vereinsleben", "eintrag"] },
  { hash: "#/organisation", titel: "Organisation", icon: "org", seiten: ["organisation", "versammlung"] },
  { hash: "#/dokumente", titel: "Dokumente", icon: "dok", seiten: ["dokumente"] },
  { hash: "#/mehr", titel: "Einstellungen", icon: "mehr", seiten: ["mehr"] },
];

function route() {
  const teile = (location.hash || "#/start").replace(/^#\/?/, "").split("/");
  return { seite: teile[0] || "start", param: teile.slice(1).map(decodeURIComponent) };
}
function geh(hash) { location.hash = hash; }
const istVorstand = () => (S.daten?.meta?.rolle || "vorstand") === "vorstand";

const SEITEN = {};      // seite -> (param) => {titel, kopf, inhalt, zurueck}
const TEILE = {};       // Teilbereiche, die sich ohne Neuzeichnen der Seite ändern (Suche)
const AKTIONEN = {};    // data-akt -> Funktion(element)
const scrollPos = {};

function kopfStand(kompakt = false) {
  const m = S.daten?.meta || {};
  let punkt = "", text = `Stand: ${esc(relZeit(m.erzeugt))}${m.von ? " · gespeichert von " + esc(m.von) : ""}`;
  if (S.laedt) { punkt = "alt"; text = "Wird aktualisiert …"; }
  else if (!navigator.onLine) punkt = "offline";
  else if (S.quelle === "datei") punkt = "alt";
  const knopf = S.quelle === "google" || Google.angemeldet()
    ? `<button class="knopf klein ${kompakt ? "nur-gross" : ""}" data-akt="aktualisieren" ${S.laedt ? "disabled" : ""} aria-label="Aktualisieren">${ic("neu", 15)}<span class="nur-gross">Aktualisieren</span></button>` : "";
  const ziehen = kompakt && S.quelle === "google" && !S.laedt ? `<span class="nur-handy"> · zum Aktualisieren nach unten ziehen</span>` : "";
  return `<div class="ladezeile"><span class="punkt ${punkt}"></span><span style="flex:1">${text}${!navigator.onLine ? " · offline" : ""}${ziehen}</span>${knopf}</div>`
    + (S.fehler ? `<div class="pille rot" style="white-space:normal">${esc(S.fehler)}</div>` : "");
}

function zeige() {
  const app = $("#app");
  const alteRoute = app.dataset.route, inhaltAlt = $(".inhalt", app);
  if (inhaltAlt && alteRoute) scrollPos[alteRoute] = inhaltAlt.scrollTop;
  const listeAlt = $(".liste-spalte", app), listeScroll = listeAlt ? listeAlt.scrollTop : 0; // iPad: Liste links behält ihre Position
  if (!S.daten) { app.innerHTML = anmeldeSeite(); app.dataset.route = ""; return; }
  const r = route();
  const fn = SEITEN[r.seite] || SEITEN.start;
  const hier = location.hash || "#/start", v = S.verlauf;
  if (!v.length || v[v.length - 1].hash !== hier) {
    if (v.length > 1 && v[v.length - 2].hash === hier) v.pop(); else v.push({ hash: hier, titel: "" });
  }
  let s;
  try { s = fn(r.param); } catch (e) { console.error(e); s = { titel: "Fehler", inhalt: `<div class="karte"><p>Diese Ansicht konnte nicht angezeigt werden.</p><p class="hinweis">${esc(e.message)}</p></div>` }; }
  const reiter = REITER.find((t) => t.seiten.includes(r.seite)) || REITER[0];
  const navGross = NAV_GROSS.find((t) => t.seiten.includes(r.seite));
  const m = S.daten.meta;
  const seitenleiste = `<nav class="seitenleiste">
    <button class="marke" data-go="#/start"><img class="marke-logo" src="wappen.png" alt=""><div class="marke-text"><b>${esc(m.verein_kurz || "Verein")}</b><span>Nur Ansicht</span></div></button>
    ${NAV_GROSS.filter((n) => !n.vorstand || istVorstand()).map((n) => `<button class="nav-eintrag ${n === navGross ? "aktiv" : ""}" data-go="${n.hash}">${ic(n.icon)}${n.titel}</button>`).join("")}
    <div class="nav-fuss">Stand: ${esc(relZeit(m.erzeugt))}<br>gespeichert von ${esc(m.von || "–")}<br>${S.quelle === "google" ? "offline verfügbar" : "Testmodus (Datei)"}</div>
  </nav>`;
  v[v.length - 1].titel = s.verlaufTitel || s.titel || "";
  // Zurück: zur Seite, von der man gekommen ist; sonst (direkt geöffnet) zur übergeordneten Seite
  const vorher = s.zurueck && v.length > 1 ? v[v.length - 2] : null;
  const zurueck = vorher ? `<button class="zurueck" data-akt="zurueck">${ic("zurueck", 22)}${esc(vorher.titel || "Zurück")}</button>`
    : s.zurueck ? `<button class="zurueck" data-go="${s.zurueck[0]}">${ic("zurueck", 22)}${esc(s.zurueck[1])}</button>` : "";
  const kopf = s.nurZurueck ? `<header class="kopf">${zurueck}</header>` : s.kopfGanz != null ? s.kopfGanz : `<header class="kopf">${zurueck}<div class="kopf-zeile"><h1>${esc(s.titel)}</h1>${s.rechts ? `<span class="rechts">${s.rechts}</span>` : ""}</div>${s.kopf || ""}</header>`;
  const leiste = `<nav class="reiterleiste">${REITER.map((t) => `<button class="reiter ${t === reiter ? "aktiv" : ""}" data-go="#/${t.id}">${ic(t.icon, 24)}${t.titel}</button>`).join("")}</nav>`;
  app.innerHTML = `${seitenleiste}<div class="hauptbereich">${kopf}<main class="inhalt"><div class="inhalt-innen">${s.inhalt}</div></main>${leiste}</div>`;
  const schluessel = location.hash;
  app.dataset.route = schluessel;
  const inhalt = $(".inhalt", app);
  if (alteRoute === schluessel && scrollPos[schluessel] != null) inhalt.scrollTop = scrollPos[schluessel];
  else if (scrollPos[schluessel] != null && sessionStorage.getItem("zurueck") === "1") inhalt.scrollTop = scrollPos[schluessel];
  sessionStorage.removeItem("zurueck");
  const listeNeu = $(".liste-spalte", app); if (listeNeu && listeAlt) listeNeu.scrollTop = listeScroll;
  bilderNachladen(app);
  document.title = (s.titel ? s.titel + " – " : "") + (m.verein_kurz || "Verein");
}

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); const z = go.dataset.go;
    if (go.closest(".reiterleiste, .seitenleiste")) S.verlauf = []; // neuer Bereich: Verlauf beginnt neu
    if (go.classList.contains("zurueck")) sessionStorage.setItem("zurueck", "1"); if (location.hash === z) zeige(); else geh(z); return; }
  const akt = e.target.closest("[data-akt]");
  if (akt && AKTIONEN[akt.dataset.akt]) { e.preventDefault(); AKTIONEN[akt.dataset.akt](akt); return; }
  const datei = e.target.closest("[data-datei]");
  if (datei) { e.preventDefault(); oeffneDatei(datei.dataset.datei); }
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-feld]");
  if (!el) return;
  const [seite, feld] = el.dataset.feld.split(".");
  ansicht(seite)[feld] = el.value;
  if (el.dataset.teil && TEILE[el.dataset.teil]) {
    const ziel = document.querySelector(`[data-teil-ziel="${el.dataset.teil}"]`);
    if (ziel) { ziel.innerHTML = TEILE[el.dataset.teil](); bilderNachladen(ziel); return; }
  }
  zeige();
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("select[data-feld]");
  if (!el) return;
  const [seite, feld] = el.dataset.feld.split(".");
  if (seite === "spiele" && feld === "saisonhs") { const [sa, hs] = el.value.split("|"); Object.assign(ansicht("spiele"), { saison: sa, hs: hs || "" }); zeige(); return; }
  ansicht(seite)[feld] = el.value; zeige();
});
AKTIONEN.setze = (el) => { const [seite, feld] = el.dataset.feld.split("."); ansicht(seite)[feld] = el.dataset.wert; zeige(); };
AKTIONEN.umschalten = (el) => { const [seite, feld] = el.dataset.feld.split("."); const a = ansicht(seite); a[feld] = a[feld] === el.dataset.wert ? "" : el.dataset.wert; zeige(); };
AKTIONEN.aktualisieren = () => { ladeVonGoogle(); ladeLive(); };
AKTIONEN.zurueck = () => { sessionStorage.setItem("zurueck", "1"); history.back(); };
AKTIONEN.anmelden = () => { S.anmeldeFehler = ""; Google.anmelden(false); };
AKTIONEN.dateiWaehlen = () => $("#dateiwahl").click();
AKTIONEN.abmelden = () => { if (confirm("Abmelden und alle Vereinsdaten von diesem Gerät löschen?")) abmelden(); };
AKTIONEN.darstellung = (el) => { localStorage.setItem("darstellung", el.dataset.wert); thema(); zeige(); };

function thema() {
  const w = localStorage.getItem("darstellung") || "auto";
  const dunkel = w === "dunkel" || (w === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dunkel ? "dunkel" : "hell";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dunkel ? "#202225" : "#ffffff";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", thema);

// Bausteine
function segmente(seite, feld, werte, aktiv) {
  return `<div class="segmente" style="grid-template-columns:repeat(${werte.length},minmax(0,1fr))">${werte.map(([w, t]) =>
    `<button class="segment ${w === aktiv ? "aktiv" : ""}" data-akt="setze" data-feld="${seite}.${feld}" data-wert="${esc(w)}">${esc(t)}</button>`).join("")}</div>`;
}
function chips(seite, feld, werte, aktiv) {
  return `<div class="chips">${werte.map(([w, t]) =>
    `<button class="chip ${w === aktiv ? "aktiv" : ""}" data-akt="setze" data-feld="${seite}.${feld}" data-wert="${esc(w)}">${esc(t)}</button>`).join("")}</div>`;
}
function suchfeld(seite, feld, platzhalter, teil) {
  return `<label class="suche">${ic("suche", 16)}<input type="search" placeholder="${esc(platzhalter)}" aria-label="${esc(platzhalter)}" value="${esc(ansicht(seite)[feld] || "")}" data-feld="${seite}.${feld}" ${teil ? `data-teil="${teil}"` : ""} autocomplete="off" autocorrect="off" spellcheck="false"></label>`;
}
function kartenTitel(titel, link = "", ziel = "") { return `<div class="karte-titel"><h2>${esc(titel)}</h2>${link ? `<a data-go="${ziel}">${esc(link)} ›</a>` : ""}</div>`; }
function abschnitt(titel, link = "", ziel = "") { return `<div class="abschnitt"><h3>${esc(titel)}</h3>${link ? `<a class="link" data-go="${ziel}">${esc(link)} ›</a>` : ""}</div>`; }
function pdfZeile(d, meta = "PDF") {
  if (!d) return "";
  return `<button class="zeile" data-datei="${esc(d.datei || "")}" style="padding-left:0;padding-right:0;border-bottom:0;min-height:40px"><span style="color:var(--danger);display:flex">${ic("pdf")}</span><span class="haupt"><span style="font-size:14px">${esc(d.titel)}</span></span><span class="gedimmt klein">${esc(meta || (d.datum ? dmy(d.datum) : ""))}</span></button>`;
}
function datumsblock(iso) { const d = datum(iso); return d ? `<div class="datumsblock"><span>${WT[d.getDay()]}</span><b>${d.getDate()}</b></div>` : ""; }
function avatar(vor, nach, klasse = "") { return `<div class="avatar f${farbIndex(nach + vor)} ${klasse}">${esc(initialen(vor, nach).toUpperCase())}</div>`; }

// ===================================================================================================== Anmeldung
function anmeldeSeite() {
  const g = !!CFG.googleClientId;
  if (sessionStorage.getItem("g_fehler")) { S.anmeldeFehler = sessionStorage.getItem("g_fehler"); sessionStorage.removeItem("g_fehler"); }
  const fehler = S.anmeldeFehler || "";
  return `<div class="hauptbereich"><div class="anmeldung">
    <img class="logo-gross" src="wappen.png" alt="Wappen TTV Werragrund 08">
    <h1>TTV Werragrund 08</h1>
    <p>Vereinsdatenbank zum Ansehen. Die Daten kommen aus dem Datenordner in Google Drive – geändert wird nur im Programm am PC.</p>
    ${fehler ? `<span class="pille rot" style="white-space:normal">Anmeldung nicht abgeschlossen: ${esc(fehler)}</span>` : ""}
    ${S.laedt ? `<span class="pille blau">Suche die Vereinsdaten in Google Drive …</span>` : ""}
    ${S.fehler && !S.laedt ? `<div class="karte" style="max-width:340px;text-align:left;gap:6px"><b style="color:var(--danger)">Keine Daten geladen</b><span style="font-size:14px">${esc(S.fehler)}</span>${S.benutzer ? `<span class="klein gedimmt">Angemeldet als ${esc(S.benutzer.displayName || "")} (${esc(S.benutzer.emailAddress || "")})</span>` : ""}</div>` : ""}
    ${g ? (Google.token() && !S.laedt ? `<button class="knopf primaer" data-akt="aktualisieren">Erneut suchen</button><button class="knopf" data-akt="anmelden">Mit anderem Google-Konto anmelden</button>`
      : `<button class="knopf primaer" data-akt="anmelden" ${S.laedt ? "disabled" : ""}>Mit Google anmelden</button>`) : `<span class="pille gelb">Google-Anmeldung ist noch nicht eingerichtet</span>`}
    <button class="knopf" data-akt="dateiWaehlen">Datei vom Gerät öffnen (Testmodus)</button>
    <input type="file" id="dateiwahl" accept=".gz,.json,application/gzip,application/json" hidden onchange="this.files[0] && ladeDatei(this.files[0])">
    <p class="klein">Nur Leserecht: Die App kann in deinem Google Drive nichts ändern oder löschen.</p>
  </div></div>`;
}

// ===================================================================================================== Start
function teamName(nr) { return (S.daten.spielbetrieb?.mannschaften || []).find((m) => m.nr === nr)?.team || (nr ? `Mannschaft ${nr}` : ""); }
function gruss() {
  const h = new Date().getHours();
  const g = h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
  const name = (S.benutzer?.displayName || "").split(" ")[0];
  return name ? `${g}, ${name}` : g;
}
function offeneFristen(tage = 30) {
  const t = heute(), bis = new Date(t.getTime() + tage * 86400000);
  return (S.daten.kalender?.termine || []).filter((x) => x.frist && !["erledigt", "vorbei"].includes(x.status) && datum(x.datum) <= bis
    && (datum(x.datum) >= t || x.status === "überfällig" || datum(x.datum) >= new Date(t.getTime() - 60 * 86400000)))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}
function terminZeile(t, mitDatum = true) {
  const tg = tageBis(t.datum);
  let p = "";
  if (t.frist) {
    p = t.status === "erledigt" ? pille("erledigt", "gruen") : tg < 0 ? pille("überfällig", "rot") : tg <= 14 ? pille(tg === 0 ? "heute" : `in ${tg} Tagen`, "gelb") : pille("Frist", "gelb");
  }
  const meta = [t.uhrzeit, t.ort ? t.ort.split(",")[0] : "", t.text && !t.spiel ? t.text : t.bereich].filter(Boolean).join(" · ");
  return `<div class="zeile" style="padding-left:0;padding-right:0;gap:12px">${mitDatum ? datumsblock(t.datum) : ""}
    <div class="streifen" style="background:${esc(t.farbe || "var(--accent)")}"></div>
    <div class="haupt"><span class="titel" style="font-size:14px">${esc(t.titel)}</span><span class="unter">${esc(meta)}</span></div>${p}</div>`;
}
function ergebnisZeile(e) {
  return `<button class="zeile" data-go="#/spiel/${encodeURIComponent(e.key)}">
    <div class="streifen" style="background:var(--${e.ergebnis[0] > e.ergebnis[1] ? "bar-sieg" : e.ergebnis[0] < e.ergebnis[1] ? "bar-nl" : "bar-remis"})"></div>
    <div class="haupt"><span class="titel" style="font-size:14px">${esc(e.begegnung)}</span><span class="unter">${esc(wtDatum(e.datum))} · ${esc(e.liga)}</span></div>
    ${pille(e.stand || `${e.ergebnis[0]}:${e.ergebnis[1]}`, ergebnisArt(e.ergebnis) + " gross")}</button>`;
}

SEITEN.start = () => {
  const d = S.daten, st = d.start || {}, m = d.meta, t = heute();
  const k = st.mitglieder || {};
  const fristen = offeneFristen();
  const a = ansicht("start", { offen: "" });
  const kacheln = `<div class="kacheln zwei">
    <button class="kachel" data-go="#/mitglieder"><span class="k">Mitglieder</span><span class="w">${k.gesamt ?? "–"}</span></button>
    <button class="kachel" data-go="#/kalender/fristen"><span class="k">Fristen offen</span><span class="w" style="${fristen.length ? "color:var(--p-gelb)" : ""}">${fristen.length}</span></button></div>`;

  // Nächste Spiele: zwei Zeilen je Mannschaft; Antippen klappt Bilanz und letzte Begegnungen auf
  const spiele = naechsteSpiele().map((s) => {
    const b = s.bilanz || {};
    const offen = a.offen === String(s.mannschaft);
    const einord = s.einordnung ? pille(s.einordnung.replace("Duell auf Augenhöhe", "Augenhöhe"), s.einordnung === "Spitzenspiel" ? "blau" : s.einordnung === "Kellerduell" ? "rot" : s.einordnung === "Favorit" ? "gruen" : s.einordnung === "Außenseiter" ? "gelb" : "") : "";
    const plaetze = s.platz ? ` · wir ${s.platz}. · Gegner ${s.platz_gegner ? s.platz_gegner + "." : "–"}` : "";
    const details = offen ? `<div class="aufklapp-inhalt" style="padding:10px 14px 12px;display:flex;flex-direction:column;gap:8px">
        <span class="klein gedimmt">${esc(WT_LANG[datum(s.datum).getDay()])}, ${dmy(s.datum)}${s.uhrzeit ? " · " + esc(s.uhrzeit) : ""}${s.ort ? " · " + esc(s.ort.split(",")[0]) : ""}</span>
        ${s.analyse ? formBlock(s) : ""}
        ${b.begegnungen ? `<div style="display:flex;align-items:center;gap:10px"><div class="snu"><span class="s">${b.siege} S</span><span class="u">${b.unentschieden} U</span><span class="n">${b.niederlagen} N</span></div><div style="flex:1">${bal(b.siege, b.unentschieden, b.niederlagen)}</div></div>
          <span class="klein gedimmt">${b.begegnungen} Begegnung${b.begegnungen === 1 ? "" : "en"} seit ${esc(b.seit)}${b.bester ? ` · beste Einzelbilanz: ${esc(b.bester[0])} ${b.bester[1]}:${b.bester[2]}` : ""}</span>
          ${(b.letzte || []).map((x) => `<button class="zeile" style="padding:6px 0;min-height:34px;border:0" data-go="#/spiel/${encodeURIComponent(x.key)}"><span class="haupt"><span style="font-size:14px">${esc(x.halbserie === "Rückrunde" ? "RR" : "VR")} ${esc(x.saison)} · ${x.heim ? "Heim" : "auswärts"}</span></span>${pille(`${x.ergebnis[0]}:${x.ergebnis[1]}`, ergebnisArt(x.ergebnis))}</button>`).join("")}`
        : `<span class="klein gedimmt">Noch keine Begegnung in den Spielberichten.</span>`}
        <a class="link" data-go="#/gegner/${encodeURIComponent(gegnerVerein(s.gegner))}">Alle Spiele gegen ${esc(gegnerVerein(s.gegner))} ›</a></div>` : "";
    return `<div class="eintrag"><button class="zeile" style="gap:12px" data-akt="umschalten" data-feld="start.offen" data-wert="${s.mannschaft}">${datumsblock(s.datum)}
      <div class="haupt"><span class="titel">${s.heim ? "gegen" : "bei"} ${esc(s.gegner)}</span><span class="unter">${esc(s.team)}${esc(plaetze)}</span></div>${einord}</button>${details}</div>`;
  }).join("");

  const termine = (d.kalender?.termine || []).filter((x) => x.bereich !== "Geburtstage" && !x.spiel && !["erledigt", "vorbei"].includes(x.status)
    && (datum(x.datum) >= t || (x.bis && datum(x.bis) >= t) || (x.frist && x.status === "überfällig"))).slice(0, 3);
  const terminZeileKurz = (x) => {
    const tg = tageBis(x.datum);
    const rechts = x.frist ? (tg < 0 ? pille("überfällig", "rot") : tg === 0 ? "heute" : tg <= 14 ? `in ${tg} Tagen` : wtDatum(x.datum)) : wtDatum(x.datum);
    const datumRechts = !x.frist || (tg > 14);
    const unter = [datumRechts ? "" : wtDatum(x.datum), x.uhrzeit, x.ort ? x.ort.split(",")[0] : ""].filter(Boolean).join(" · ");
    return `<button class="zeile" data-go="#/kalender"><div class="haupt"><span class="titel">${esc(x.titel)}</span>${unter ? `<span class="unter">${esc(unter)}</span>` : ""}</div><span class="gedimmt" style="font-size:14px;white-space:nowrap">${rechts}</span>${CHEV}</button>`;
  };
  const ergebnisse = (st.letzte_ergebnisse || []).slice(0, 3).map((e) => `<button class="zeile" data-go="#/spiel/${encodeURIComponent(e.key)}">
    <div class="haupt"><span class="titel">${esc(teamName(e.mannschaft) || e.team)} ${e.heim ? "gegen" : "bei"} ${esc(e.gegner)}</span><span class="unter">${esc(wtDatum(e.datum))}</span></div>
    ${pille(`${e.ergebnis[0]}:${e.ergebnis[1]}`, ergebnisArt(e.ergebnis))}${CHEV}</button>`).join("");
  const geb = (d.kalender?.termine || []).filter((x) => x.bereich === "Geburtstage" && tageBis(x.datum) >= 0 && tageBis(x.datum) <= 7);
  const liveHinweis = d.liveInfo ? `<span class="hinweis">Tabellenplätze${d.liveInfo.spiele ? " und Spielplan" : ""} von mytischtennis.de, zuletzt geprüft ${esc(dmy(d.liveInfo.geprueft))}</span>` : "";

  const kopfGanz = `<header class="kopf start-kopf">
    <div class="kopf-zeile" style="gap:14px"><img class="wappen nur-handy" src="wappen.png" alt="Wappen TTV Werragrund 08">
      <div style="display:flex;flex-direction:column;flex:1;min-width:0"><span class="vereinsname">${esc(m.verein_kurz)}</span><span class="gedimmt" style="font-size:15px">${esc(gruss())}</span></div></div>
    ${kopfStand(true)}</header>`;
  const links = `${abschnitt("Nächste Spiele")}<div class="karte dicht">${spiele || `<div class="zeile"><span class="leer">Keine Spiele in den nächsten Wochen.</span></div>`}</div>${liveHinweis}
    ${abschnitt("Letzte Ergebnisse", "Alle", "#/spiele")}<div class="karte dicht">${ergebnisse || `<div class="zeile"><span class="leer">Noch keine Spielberichte.</span></div>`}</div>`;
  const rechts = `${abschnitt("Termine", "Alle", "#/kalender")}<div class="karte dicht">${termine.map(terminZeileKurz).join("") || `<div class="zeile"><span class="leer">Keine anstehenden Termine.</span></div>`}</div>
    ${geb.map((x) => `<div style="display:flex;align-items:center;gap:8px;padding:2px 4px">${pille(tageBis(x.datum) === 0 ? "heute" : tageBis(x.datum) === 1 ? "morgen" : wtDatum(x.datum), "rosa")}<span style="font-size:14px">${esc(x.name || x.titel)} wird ${x.alter ?? ""}</span></div>`).join("")}`;
  return {
    titel: "Start", kopfGanz,
    inhalt: `${kacheln}<div style="display:grid;gap:12px" class="start-raster"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${links}</div><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${rechts}</div></div>`,
  };
};
// Je Mannschaft das nächste Spiel ab heute – mit Tabellenplätzen aus der neuesten Tabelle und der Bilanz gegen den Verein
function naechsteSpiele() {
  const d = S.daten, t = heute(), ex = d.start?.naechste_spiele || [], gesehen = new Set();
  const kandidaten = d.liveInfo?.spiele
    ? (d.kalender?.termine || []).filter((k) => k.spiel && k.mannschaft && k.gegner).map((k) => ({
      datum: k.datum, uhrzeit: k.uhrzeit, ort: k.ort, mannschaft: k.mannschaft, team: k.team || teamName(k.mannschaft),
      gegner: k.gegner, heim: k.heim, begegnung: k.titel }))
    : ex;
  const saison = SB().aktuelle_saison;
  return kandidaten.filter((s) => datum(s.datum) >= t && !gesehen.has(s.mannschaft) && gesehen.add(s.mannschaft)).map((s) => {
    const alt = ex.find((x) => x.mannschaft === s.mannschaft && norm(x.gegner) === norm(s.gegner)) || {};
    const tp = tabellenPlatz(saison, s.mannschaft);
    let platzGegner = alt.platz_gegner ?? null, anzahl = alt.anzahl ?? null;
    if (tp) {
      const liga = (SB().tabellen?.[saison]?.ligen || []).find((l) => l.liga === tp.liga);
      const g = norm(s.gegner);
      const z = liga && (liga.zeilen.find((r) => norm(r.name) === g) || liga.zeilen.find((r) => !r.eigen && g && (norm(r.name).includes(g) || g.includes(norm(r.name)))));
      anzahl = liga ? liga.zeilen.length : anzahl; platzGegner = z ? z.platz : platzGegner;
    }
    const platz = tp ? tp.platz : alt.platz ?? null;
    return { ...alt, ...s, liga: tp?.liga || alt.liga || "", platz, platz_gegner: platzGegner, anzahl,
      einordnung: einordnung(platz, platzGegner, anzahl), bilanz: alt.bilanz || bilanzGegen(s.gegner) };
  });
}
function einordnung(eigen, gegner, anzahl) { // wie im Programm (Startseitenmodul.einordnung)
  if (!eigen || !gegner || !anzahl) return "";
  if (eigen <= 3 && gegner <= 3) return "Spitzenspiel";
  if (eigen >= anzahl - 2 && gegner >= anzahl - 2) return "Kellerduell";
  if (gegner - eigen >= 4) return "Favorit";
  if (eigen - gegner >= 4) return "Außenseiter";
  return Math.abs(eigen - gegner) <= 1 ? "Duell auf Augenhöhe" : "";
}
function bilanzGegen(gegner) {
  const v = norm(gegnerVerein(gegner));
  const x = gegnerbilanz(SB().spiele).find((z) => norm(z.verein) === v);
  if (!x) return { begegnungen: 0, siege: 0, unentschieden: 0, niederlagen: 0, seit: "", bester: null, letzte: [] };
  const letzte = x.spiele.sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 3)
    .map((s) => ({ datum: s.datum, key: s.key, ergebnis: s.ergebnis, heim: s.heim, saison: s.saison, halbserie: s.halbserie }));
  return { begegnungen: x.beg, siege: x.s, unentschieden: x.u, niederlagen: x.n, seit: x.seit, bester: null, letzte };
}
// ===================================================================================================== Formanalyse
// Aus dem Spielplan von mytischtennis.de (vom PC berechnet: spielbetrieb.ligen_analyse, start.naechste_spiele[].analyse)
const FORM_ART = { S: "gruen", U: "gelb", N: "rot" };
function formPunkte(liste) {
  return liste && liste.length ? `<span class="form" aria-label="Form ${esc(liste.join(" "))}">${liste.map((x) => `<span class="f ${FORM_ART[x] || ""}">${esc(x)}</span>`).join("")}</span>`
    : `<span class="klein gedimmt">noch keine Spiele</span>`;
}
function bilanzKurz(b) { return b && b.begegnungen ? `${b.s}-${b.u}-${b.n} · ${b.punkte[0]}:${b.punkte[1]} Punkte` : "noch keine Spiele"; }
function formBlock(s) {
  const a = s.analyse, vg = a.vergleich, b = s.heim ? a.auswaerts : a.heim;
  return `<div class="formblock">
    <div class="fz"><span class="k">Form Gegner</span>${formPunkte(a.form)}</div>
    <div class="fz"><span class="k">Unsere Form</span>${formPunkte(a.wir_form)}</div>
    ${a.serie || a.wir_serie ? `<span class="klein gedimmt">${[a.serie ? `Gegner: ${esc(a.serie)}` : "", a.wir_serie ? `Wir: ${esc(a.wir_serie)}` : ""].filter(Boolean).join(" · ")}</span>` : ""}
    <span class="klein gedimmt">Gegner ${s.heim ? "auswärts" : "zu Hause"}: ${esc(bilanzKurz(b))}</span>
    ${vg ? `<span class="klein gedimmt">Gemeinsame Gegner (${vg.gegner}): wir ${vg.punkte[0]}, Gegner ${vg.punkte[1]} Punkte</span>` : ""}
    <a class="link" data-go="#/form/${encodeURIComponent(a.liga)}/${encodeURIComponent(a.name)}">Formanalyse ›</a></div>`;
}
function ligaAnalyse(liga, saison) {
  const alle = SB().ligen_analyse || [];
  return alle.find((x) => norm(x.liga) === norm(liga) && (!saison || x.saison === saison)) || null;
}
const staende = (liste) => liste.map((e) => `${e.eigen}:${e.gegen}`).join(" ");
SEITEN.form = ([liga, team]) => {
  const an = (SB().ligen_analyse || []).find((x) => x.liga === liga) || null;
  const t = an?.teams?.[team];
  if (!t) return { titel: "Formanalyse", zurueck: ["#/spiele", "Spielbetrieb"], inhalt: `<div class="karte"><span class="leer">Für diese Mannschaft gibt es keinen Spielplan.</span></div>` };
  const platz = (an.tabellen.gesamt || []).find((z) => z.name === team)?.platz;
  const letzte = t.letzte.slice().reverse().map((e) => `<div class="zeile"><span class="gedimmt" style="width:52px;font-size:14px">${dmy(e.datum).slice(0, 6)}</span>
    <div class="haupt"><span class="titel" style="font-size:14px">${e.heim ? "gegen" : "bei"} ${esc(e.gegner)}</span>${e.kampflos ? `<span class="unter">kampflos</span>` : ""}</div>${pille(`${e.eigen}:${e.gegen}`, FORM_ART[e.art])}</div>`).join("");
  const vergleich = Object.entries(t.vergleich || {}).map(([nr, vg]) => {
    const wir = teamName(Number(nr));
    return `${abschnitt(`Gemeinsame Gegner mit ${wir}`)}<div class="karte dicht">
      <div class="zeile" style="min-height:40px"><span class="klein gedimmt" style="flex:1">${vg.gegner} gemeinsame Gegner</span><span class="fett">wir ${vg.punkte[0]} · sie ${vg.punkte[1]} Punkte</span></div>
      ${vg.zeilen.map((z) => `<div class="zeile" style="font-size:14px"><span style="flex:1;min-width:0">${esc(z.gegner)}</span><span class="zahl" style="width:64px;text-align:right">${esc(staende(z.wir))}</span><span class="zahl gedimmt" style="width:64px;text-align:right">${esc(staende(z.sie))}</span></div>`).join("")}</div>
      <span class="hinweis">Links unsere Ergebnisse, rechts die von ${esc(team)} – jeweils aus eigener Sicht.</span>`;
  }).join("");
  const rest = t.rest?.spiele || [];
  return {
    titel: team, verlaufTitel: "Formanalyse", zurueck: ["#/spiele", "Spielbetrieb"],
    inhalt: `<div class="karte" style="gap:10px"><span class="klein gedimmt">${esc(an.liga)} ${esc(an.saison)}${platz ? ` · Platz ${platz} (aus dem Spielplan berechnet)` : ""}</span>
        <div class="fz"><span class="k">Form</span>${formPunkte(t.form)}${t.serie ? `<span class="klein gedimmt">${esc(t.serie)}</span>` : ""}</div>
        <div class="raster4" style="grid-template-columns:1fr 1fr"><div class="wert"><span class="k">Heim</span><span class="w" style="font-size:15px">${esc(bilanzKurz(t.heim))}</span></div><div class="wert"><span class="k">Auswärts</span><span class="w" style="font-size:15px">${esc(bilanzKurz(t.auswaerts))}</span></div></div></div>
      ${letzte ? `${abschnitt("Letzte Spiele")}<div class="karte dicht">${letzte}</div>` : ""}
      ${vergleich}
      ${rest.length ? `${abschnitt(`Restprogramm${t.rest.runde ? " " + t.rest.runde : ""}`)}<div class="karte dicht">${rest.slice(0, 10).map((x) => `<div class="zeile"><span class="gedimmt" style="width:52px;font-size:14px">${dmy(x.datum).slice(0, 6)}</span><div class="haupt"><span class="titel" style="font-size:14px">${x.heim ? "gegen" : "bei"} ${esc(x.gegner)}</span></div>${x.platz ? `<span class="klein gedimmt">${x.platz}.</span>` : ""}</div>`).join("")}</div>
        ${t.rest.schnitt ? `<span class="hinweis">Gegner im Schnitt auf Platz ${String(t.rest.schnitt).replace(".", ",")}</span>` : ""}` : ""}
      <span class="hinweis">Aus dem Spielplan von mytischtennis.de berechnet${an.zeit ? `, Stand ${esc(dmy(an.zeit.slice(0, 10)))}` : ""}.</span>`,
  };
};

function gegnerVerein(name) { return String(name || "").replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/u, "").trim(); }

// ===================================================================================================== Mitglieder
const mitgliedId = (m) => encodeURIComponent(`${m.nachname}|${m.vorname}`);
function findeMitglied(id) { return (S.daten.mitglieder || []).find((m) => `${m.nachname}|${m.vorname}` === id); }
function mitgliederGefiltert() {
  const a = ansicht("mitglieder", { filter: "alle", suche: "" });
  const q = norm(a.suche);
  return (S.daten.mitglieder || []).filter((m) =>
    (a.filter === "alle" || (a.filter === "aktiv" && m.aktiv) || (a.filter === "passiv" && !m.aktiv) || (a.filter === "jugend" && m.alter != null && m.alter < 18)
      || (a.filter === "spieler" && m.mannschaft))
    && (!q || norm(`${m.vorname} ${m.nachname} ${m.nachname} ${m.ort} ${m.mannschaft?.name || ""}`).includes(q)));
}
function mitgliedUnter(m) {
  if (m.mannschaft) return `${teamName(m.mannschaft.mannschaft)} · Platz ${m.mannschaft.platz}`;
  return m.alter != null ? `${m.alter} Jahre${m.ort ? " · " + m.ort : ""}` : m.ort || "";
}
TEILE.mitgliederliste = () => {
  const liste = mitgliederGefiltert();
  const gewaehlt = route().seite === "mitglied" ? route().param[0] : null;
  return liste.map((m) => `<button class="zeile ${gewaehlt === `${m.nachname}|${m.vorname}` ? "ausgewaehlt" : ""}" data-go="#/mitglied/${mitgliedId(m)}">${avatar(m.vorname, m.nachname)}
    <div class="haupt"><span class="titel">${esc(m.nachname)}, ${esc(m.vorname)}</span><span class="unter">${esc(mitgliedUnter(m))}</span></div>
    ${pille(m.aktiv ? "aktiv" : "passiv", m.aktiv ? "gruen" : "")}</button>`).join("") || `<div class="zeile"><span class="leer">Niemand gefunden.</span></div>`;
};
function mitgliederKopf() {
  const a = ansicht("mitglieder", { filter: "alle", suche: "" });
  return `${suchfeld("mitglieder", "suche", "Name, Ort oder Mannschaft", "mitgliederliste")}
    ${chips("mitglieder", "filter", [["alle", "Alle"], ["aktiv", "Aktiv"], ["passiv", "Passiv"], ["spieler", "In Mannschaften"], ["jugend", "Jugend"]], a.filter)}`;
}
SEITEN.mitglieder = () => {
  const k = S.daten.start?.mitglieder || {};
  return {
    titel: "Mitglieder", rechts: `${k.gesamt ?? ""} · ${k.aktiv ?? ""} aktiv`, kopf: mitgliederKopf(),
    inhalt: `<div class="zweispaltig"><div class="karte dicht liste-spalte" data-teil-ziel="mitgliederliste">${TEILE.mitgliederliste()}</div>
      <div class="karte nur-gross" style="align-items:center;justify-content:center;min-height:240px;color:var(--muted)">Mitglied auswählen</div></div>`,
  };
};
function beitragPille(b) {
  if (!b) return "";
  const art = { bezahlt: "gruen", teilweise: "gelb", offen: "rot", zuviel: "blau" }[b.status] || "";
  return pille(b.status || "–", art);
}
function mitgliedDetail(m) {
  const sp = m.spieler && S.daten.spielbetrieb?.spieler?.[m.spieler];
  const adresse = [m.strasse, [m.plz, m.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const kv = [
    ["Geburtstag", m.geb ? `${dmy(m.geb)}${m.alter != null ? ` (${m.alter})` : ""}` : ""],
    ["Mitglied seit", m.beitritt ? dmy(m.beitritt) : ""],
    ["Anschrift", adresse], ["Telefon", m.telefon], ["E-Mail", m.email],
  ].filter(([, w]) => w);
  const fotoBox = m.foto ? `<div class="avatar f${farbIndex(m.nachname + m.vorname)}" data-bild="${esc(m.foto)}" data-groesse="300">${esc(initialen(m.vorname, m.nachname).toUpperCase())}</div>` : avatar(m.vorname, m.nachname);
  return `<div class="karte"><div class="mitglied-kopf">${fotoBox}<h2>${esc(m.vorname)} ${esc(m.nachname)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${pille(m.aktiv ? "aktiv" : "passiv", m.aktiv ? "gruen" : "")}${m.mannschaft ? pille(`${teamName(m.mannschaft.mannschaft)} · Platz ${m.mannschaft.platz}`, "blau") : ""}</div></div></div>
    ${kv.length ? `<div class="karte dicht">${kv.map(([k, w]) => `<div class="kv"><span class="k">${k}</span><span class="w">${esc(w)}</span></div>`).join("")}</div>` : ""}
    ${istVorstand() && m.beitrag ? `<div class="karte">${kartenTitel(`Beitrag ${m.beitrag.jahr}`)}
      <div style="display:flex;align-items:center;gap:10px"><span style="flex:1;font-size:14px">Satz ${esc(m.beitrag.satz)} · ${eur(m.beitrag.soll)}${m.beitrag.anteilig ? " (anteilig)" : ""}</span>${beitragPille(m.beitrag)}</div>
      ${m.beitrag.bezahlt != null && m.beitrag.status !== "bezahlt" ? `<span class="klein gedimmt">bisher bezahlt: ${eur(m.beitrag.bezahlt)}</span>` : ""}</div>` : ""}
    ${sp || m.qttr ? `<div class="karte"><div class="karte-titel"><h2>Spielerprofil</h2>${sp ? `<a data-go="#/spieler/${encodeURIComponent(m.spieler)}">Gegenspieler, Doppelpartner ›</a>` : ""}</div>
      <div class="kacheln drei" style="gap:8px">
        <div class="wert"><span class="k">Q-TTR</span><span class="w">${m.qttr?.wert ?? "–"}</span></div>
        <div class="wert"><span class="k">Einzel</span><span class="w">${sp ? sp.einzel.join(" : ") : "–"}</span></div>
        <div class="wert"><span class="k">Doppel</span><span class="w">${sp ? sp.doppel.join(" : ") : "–"}</span></div></div></div>` : ""}
    ${m.dokumente?.length ? `<div class="karte">${kartenTitel("Dokumente")}${m.dokumente.map((x) => pdfZeile(x, x.datum ? dmy(x.datum) : "PDF")).join("")}</div>` : ""}`;
}
SEITEN.mitglied = ([id]) => {
  const m = findeMitglied(id);
  if (!m) return { titel: "Mitglied", zurueck: ["#/mitglieder", "Mitglieder"], inhalt: `<div class="karte"><span class="leer">Nicht gefunden.</span></div>` };
  const breit = matchMedia("(min-width: 1000px)").matches;
  if (breit) {
    const k = S.daten.start?.mitglieder || {};
    return { titel: "Mitglieder", rechts: `${k.gesamt ?? ""} · ${k.aktiv ?? ""} aktiv`, kopf: mitgliederKopf(),
      inhalt: `<div class="zweispaltig"><div class="karte dicht liste-spalte" data-teil-ziel="mitgliederliste">${TEILE.mitgliederliste()}</div><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${mitgliedDetail(m)}</div></div>`, verlaufTitel: `${m.vorname} ${m.nachname}` };
  }
  return { titel: `${m.vorname} ${m.nachname}`, zurueck: ["#/mitglieder", "Mitglieder"], nurZurueck: true, inhalt: mitgliedDetail(m) };
};
function lebenZeile(e) {
  return `<button class="zeile" data-go="#/eintrag/${encodeURIComponent(e.id)}"><div class="vorschau" ${e.titelbild ? `data-bild="${esc(e.titelbild)}" data-groesse="200"` : ""}></div>
    <div class="haupt"><span class="titel">${esc(e.titel)}</span><span class="unter">${esc(wtDatum(e.datum))} · ${esc(e.art)}${e.bilder?.length ? ` · ${e.bilder.length} Bilder` : ""}</span></div>${CHEV}</button>`;
}

// ===================================================================================================== Kalender
SEITEN.kalender = ([vorfilter]) => {
  const a = ansicht("kalender", { filter: "alle", vergangene: "", geb: "" });
  if (vorfilter && a._vor !== vorfilter) { a.filter = vorfilter; a._vor = vorfilter; }
  const alle = S.daten.kalender?.termine || [];
  const t = heute();
  const passt = (x) => (x.bereich !== "Geburtstage" || a.geb || a.filter === "Geburtstage")
    && (a.filter === "alle" ? true : a.filter === "spiele" ? x.spiel : a.filter === "fristen" ? x.frist : x.bereich === a.filter);
  const liste = alle.filter((x) => passt(x) && (a.vergangene ? datum(x.datum) < t : (datum(x.datum) >= t || (x.bis && datum(x.bis) >= t) || (x.frist && x.status === "überfällig"))));
  if (a.vergangene) liste.reverse();
  const bereiche = [...new Set(alle.map((x) => x.bereich))].filter((b) => b !== "Spielbetrieb" && b !== "Geburtstage");
  let html = "", monat = "";
  for (const x of liste) {
    const d = datum(x.datum), mk = `${MONATE[d.getMonth()]} ${d.getFullYear()}`;
    if (mk !== monat) { if (monat) html += "</div>"; html += `<div class="monat">${mk}</div><div class="karte" style="padding-top:2px;padding-bottom:2px;gap:0">`; monat = mk; }
    html += terminZeile(x);
  }
  if (monat) html += "</div>";
  return {
    titel: "Kalender",
    kopf: `<div class="chips">${[["alle", "Alle"], ["spiele", "Spiele"], ["fristen", "Fristen"], ...bereiche.map((b) => [b, b])].map(([w, t]) =>
      `<button class="chip ${w === a.filter ? "aktiv" : ""}" data-akt="setze" data-feld="kalender.filter" data-wert="${esc(w)}">${esc(t)}</button>`).join("")}
      <button class="chip ${a.geb ? "aktiv" : ""}" data-akt="umschalten" data-feld="kalender.geb" data-wert="1">${a.geb ? "Geburtstage ausblenden" : "Geburtstage einblenden"}</button></div>`,
    inhalt: `${html || `<div class="karte"><span class="leer">${a.vergangene ? "Keine vergangenen Termine (60 Tage)." : "Keine anstehenden Termine."}</span></div>`}
      <button class="knopf" data-akt="umschalten" data-feld="kalender.vergangene" data-wert="1">${a.vergangene ? "Kommende Termine zeigen" : "Vergangene Termine zeigen"}</button>
      <span class="hinweis">Termine, Fristen, Spiele aus den Kalender-Abos und Geburtstage – wie im Vereinskalender am PC.</span>`,
  };
};

// ===================================================================================================== Spielbetrieb: Rechnen
const SB = () => S.daten.spielbetrieb || { spiele: [], spieler: {}, mannschaften: [], saisons: [] };
function spieleFilter({ saison = "*", hs = "", team = "" } = {}) {
  return SB().spiele.filter((s) => (saison === "*" || s.saison === saison) && (!hs || s.halbserie === hs) && (!team || String(s.mannschaft) === String(team)));
}
function mannschaftsbilanz(spiele) {
  const z = {};
  for (const s of spiele) {
    if (!s.ergebnis) continue;
    const m = (z[s.mannschaft] = z[s.mannschaft] || { nr: s.mannschaft, liga: s.liga, beg: 0, s: 0, u: 0, n: 0, sp: [0, 0], pk: [0, 0] });
    const [e, g] = s.ergebnis;
    m.beg++; e > g ? m.s++ : e < g ? m.n++ : m.u++;
    m.sp[0] += e; m.sp[1] += g; m.pk[0] += e > g ? 2 : e === g ? 1 : 0; m.pk[1] += e < g ? 2 : e === g ? 1 : 0;
  }
  return Object.values(z).sort((a, b) => (a.nr || 99) - (b.nr || 99));
}
function spielerName(pid, fallback = "") {
  const p = SB().spieler[pid];
  return p ? `${p.nachname}, ${p.vorname}` : fallback;
}
function spielerbilanz(spiele) {
  const z = {};
  for (const s of spiele) {
    for (const a of s.aufstellung || []) { const p = (z[a.pid] = z[a.pid] || { pid: a.pid, name: a.name, e: [0, 0], d: [0, 0], saetze: [0, 0], beg: new Set(), teams: {} }); p.beg.add(s.key); p.teams[s.mannschaft] = (p.teams[s.mannschaft] || 0) + 1; }
    for (const p of s.partien || []) {
      if (!p.gespielt) continue;
      p.eigene.forEach((pid, i) => {
        const x = (z[pid] = z[pid] || { pid, name: p.eigene_namen[i], e: [0, 0], d: [0, 0], saetze: [0, 0], beg: new Set(), teams: {} });
        (p.art === "Einzel" ? x.e : x.d)[p.sieg ? 0 : 1]++;
        x.saetze[0] += p.satzstand[0]; x.saetze[1] += p.satzstand[1]; x.beg.add(s.key);
        x.teams[s.mannschaft] = (x.teams[s.mannschaft] || 0) + 0.01;
      });
    }
  }
  return Object.values(z).filter((x) => x.e[0] + x.e[1] + x.d[0] + x.d[1] > 0).map((x) => ({
    ...x, name: spielerName(x.pid, x.name), beg: x.beg.size, team: Number(Object.entries(x.teams).sort((a, b) => b[1] - a[1])[0]?.[0]) || null,
  })).sort((a, b) => b.e[0] - a.e[0] || a.e[1] - b.e[1] || b.d[0] - a.d[0] || a.name.localeCompare(b.name, "de"));
}
function doppelbilanz(spiele) {
  const z = {};
  for (const s of spiele) for (const p of s.partien || []) {
    if (!p.gespielt || p.art === "Einzel" || p.eigene.length !== 2) continue;
    const reihen = p.eigene.map((pid, i) => ({ pid, name: p.eigene_namen[i] })).sort((a, b) => a.pid.localeCompare(b.pid));
    const k = reihen.map((r) => r.pid).join("+");
    const x = (z[k] = z[k] || { a: reihen[0], b: reihen[1], d: [0, 0], saetze: [0, 0] });
    x.d[p.sieg ? 0 : 1]++; x.saetze[0] += p.satzstand[0]; x.saetze[1] += p.satzstand[1];
  }
  return Object.values(z).sort((a, b) => b.d[0] - a.d[0] || a.d[1] - b.d[1]);
}
function gegnerbilanz(spiele) {
  const z = {};
  for (const s of spiele) {
    if (!s.ergebnis || !s.gegner_verein) continue;
    const k = norm(s.gegner_verein);
    const x = (z[k] = z[k] || { verein: s.gegner_verein, beg: 0, s: 0, u: 0, n: 0, sp: [0, 0], saisons: new Set(), letztes: "", spiele: [] });
    const [e, g] = s.ergebnis;
    x.beg++; e > g ? x.s++ : e < g ? x.n++ : x.u++; x.sp[0] += e; x.sp[1] += g; x.saisons.add(s.saison);
    if (s.datum > x.letztes) x.letztes = s.datum;
    x.spiele.push(s);
  }
  return Object.values(z).map((x) => ({ ...x, seit: [...x.saisons].sort()[0] || "" }));
}
const quote = (x) => (x.beg ? (x.s + 0.5 * x.u) / x.beg : 0);
function tabellenPlatz(saison, nr) {
  for (const l of SB().tabellen?.[saison]?.ligen || []) {
    const z = l.zeilen.find((r) => r.eigen && r.mannschaft === nr);
    if (z) return { platz: z.platz, von: l.zeilen.length, liga: l.liga, punkte: z.punkte };
  }
  return null;
}

// ===================================================================================================== Spielbetrieb: Seiten
function spieleAnsicht() {
  const sb = SB();
  return ansicht("spiele", { tab: "ergebnisse", saison: sb.aktuelle_saison || sb.saisons[0] || "*", hs: "", team: "" });
}
function saisonKnopf(a, mitAlle, mitHalbserie = true) {
  if (!mitAlle && a.saison === "*") a.saison = SB().aktuelle_saison || SB().saisons[0];
  const hs = mitHalbserie ? a.hs : "";
  const opt = [];
  if (mitAlle) opt.push(["*|", "Alle Saisons"], ["*|Vorrunde", "Alle Saisons · Vorrunden"], ["*|Rückrunde", "Alle Saisons · Rückrunden"]);
  for (const s of SB().saisons) {
    opt.push([`${s}|`, `${s} · ganze Saison`]);
    if (mitHalbserie) opt.push([`${s}|Vorrunde`, `${s} · Vorrunde`], [`${s}|Rückrunde`, `${s} · Rückrunde`]);
  }
  const wert = `${a.saison}|${hs}`;
  return `<label class="saisonknopf"><select data-feld="spiele.saisonhs" aria-label="Saison und Halbserie">${opt.map(([w, t]) => `<option value="${esc(w)}" ${w === wert ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>${ic("chevunten", 14)}</label>`;
}
function saisonAuswahl(a, mitAlle) {
  const opt = (mitAlle ? [["*", "Alle Saisons"]] : []).concat(SB().saisons.map((s) => [s, s]));
  if (!mitAlle && a.saison === "*") a.saison = SB().aktuelle_saison || SB().saisons[0];
  return `<select class="auswahl" data-feld="spiele.saison" aria-label="Saison">${opt.map(([w, t]) => `<option value="${esc(w)}" ${w === a.saison ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <select class="auswahl" data-feld="spiele.hs" aria-label="Halbserie">${[["", "Ganze Saison"], ["Vorrunde", "Vorrunde"], ["Rückrunde", "Rückrunde"]].map(([w, t]) => `<option value="${w}" ${w === a.hs ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}
SEITEN.spiele = () => {
  const a = spieleAnsicht();
  const tabs = [["ergebnisse", "Ergebnisse"], ["tabellen", "Tabellen"], ["bilanzen", "Bilanzen"], ["aufstellung", "Aufstellung"]];
  const inhalt = { ergebnisse: tabErgebnisse, tabellen: tabTabellen, bilanzen: tabBilanzen, aufstellung: tabAufstellung }[a.tab](a);
  return {
    titel: "Spielbetrieb", rechts: saisonKnopf(a, a.tab === "bilanzen", a.tab !== "tabellen"),
    kopf: segmente("spiele", "tab", tabs, a.tab),
    inhalt,
  };
};
function tabErgebnisse(a) {
  const saison = a.saison === "*" ? SB().aktuelle_saison : a.saison;
  const spiele = spieleFilter({ saison, hs: a.hs }).filter((s) => s.ergebnis);
  const bil = mannschaftsbilanz(spiele);
  const kacheln = bil.length ? `<div class="kacheln zwei">${bil.map((m) => {
    const tp = tabellenPlatz(saison, m.nr);
    return `<div class="kachel" style="cursor:default"><span class="k">${esc(teamName(m.nr))}</span><span class="w">${tp ? tp.platz + ". Platz" : `${m.s}/${m.u}/${m.n}`}</span><span class="u">${m.pk[0]}:${m.pk[1]} Punkte</span></div>`;
  }).join("")}</div>` : "";
  const nachTeam = {};
  for (const s of spiele) (nachTeam[s.mannschaft] = nachTeam[s.mannschaft] || []).push(s);
  const listen = Object.keys(nachTeam).sort((x, y) => x - y).map((nr) => `${abschnitt(teamName(Number(nr)))}<div class="karte dicht">
    ${nachTeam[nr].map((s) => `<button class="zeile" data-go="#/spiel/${encodeURIComponent(s.key)}"><div class="haupt"><span class="titel">${s.heim ? "gegen" : "bei"} ${esc(s.gegner)}</span><span class="unter">${esc(wtDatum(s.datum))}${s.nur_ergebnis ? " · ohne Spielbericht" : ""}</span></div>
      ${pille(`${s.ergebnis[0]}:${s.ergebnis[1]}`, ergebnisArt(s.ergebnis))}${CHEV}</button>`).join("")}</div>`).join("");
  return `${kacheln}${listen || `<div class="karte"><span class="leer">Für diese Auswahl sind keine Spielberichte eingelesen.</span></div>`}`;
}
const ZEICHEN = { auf: "▲", rel_auf: "△", ab: "▼", rel_ab: "▽", zurueck: "✕" };
function tabTabellen(a) {
  const saison = a.saison === "*" ? SB().aktuelle_saison : a.saison;
  const t = SB().tabellen?.[saison];
  const art = a.tart || "tabelle";
  const hatAnalyse = (SB().ligen_analyse || []).some((x) => x.saison === saison);
  const auswahl = hatAnalyse ? `<div class="chips">${[["tabelle", "Tabelle"], ["form", "Form"], ["heim", "Heim"], ["auswaerts", "Auswärts"]].map(([w, txt]) =>
    `<button class="chip ${w === art ? "aktiv" : ""}" data-akt="setze" data-feld="spiele.tart" data-wert="${w}">${txt}</button>`).join("")}</div>` : "";
  if (art !== "tabelle" && hatAnalyse) {
    return auswahl + (SB().ligen_analyse || []).filter((x) => x.saison === saison).map((an) => `<div class="karte" style="padding:12px 4px 4px">
      <div style="padding:0 10px">${kartenTitel(an.liga)}</div>
      <table class="tabelle"><thead><tr><th>Pl.</th><th>Mannschaft</th><th>Sp.</th><th>Punkte</th><th>Form</th></tr></thead><tbody>
      ${(an.tabellen[art] || []).map((z) => `<tr class="${z.eigen ? "eigen" : ""}" data-go="#/form/${encodeURIComponent(an.liga)}/${encodeURIComponent(z.name)}" style="cursor:pointer"><td>${z.platz}</td><td>${esc(z.name)}</td><td>${z.begegnungen}</td><td>${z.punkte.join(":")}</td><td class="formzelle">${formPunkte(z.form.slice(-5))}</td></tr>`).join("")}
      </tbody></table></div>`).join("") + `<span class="hinweis">${art === "form" ? "Nur die letzten fünf Spiele je Mannschaft." : art === "heim" ? "Nur Heimspiele." : "Nur Auswärtsspiele."} Aus dem Spielplan von mytischtennis.de berechnet · Mannschaft antippen: Formanalyse</span>`;
  }
  if (!t) return auswahl + `<div class="karte"><span class="leer">Für ${esc(saison)} ist keine Tabelle eingelesen.</span></div>`;
  return auswahl + t.ligen.filter((l) => l.zeilen.some((z) => z.eigen)).concat(t.ligen.filter((l) => !l.zeilen.some((z) => z.eigen))).map((l) => `<div class="karte" style="padding:12px 4px 4px">
    <div style="padding:0 10px">${kartenTitel(l.liga)}</div>
    <table class="tabelle"><thead><tr><th>Pl.</th><th>Mannschaft</th><th>Sp.</th><th>Spiele</th><th>Punkte</th></tr></thead><tbody>
    ${l.zeilen.map((z) => { const an = ligaAnalyse(l.liga, saison); const tn = an && Object.keys(an.teams).find((n) => norm(n) === norm(z.name) || (z.eigen && an.eigene[n] === z.mannschaft));
      return `<tr class="${z.eigen ? "eigen" : ""}"${tn ? ` data-go="#/form/${encodeURIComponent(an.liga)}/${encodeURIComponent(tn)}" style="cursor:pointer"` : ""}><td>${z.platz ?? ""}</td><td>${esc(z.name)} ${z.zeichen && ZEICHEN[z.zeichen] ? `<span class="zeichen" style="color:${z.zeichen.includes("ab") || z.zeichen === "zurueck" ? "var(--p-rot)" : "var(--p-gruen)"}">${ZEICHEN[z.zeichen]}</span>` : ""}</td><td>${z.beg ?? ""}</td><td>${z.spiele ? z.spiele.join(":") : ""}</td><td>${z.punkte ? z.punkte.join(":") : ""}</td></tr>`; }).join("")}
    </tbody></table></div>`).join("") + `<span class="hinweis">Stand der Tabelle: ${esc(dmy(t.stand))}${t.live ? " (von mytischtennis.de, automatisch abgerufen)" : ""}. ▲ Aufstieg · △ Relegation · ▼ Abstieg</span>`;
}
function tabBilanzen(a) {
  const unter = a.bil || "spieler";
  const reiter = `<div class="chips">${[["mannschaften", "Mannschaften"], ["spieler", "Spieler"], ["doppel", "Doppel"], ["gegner", "Gegner"]].map(([w, t]) =>
    `<button class="chip ${w === unter ? "aktiv" : ""}" data-akt="setze" data-feld="spiele.bil" data-wert="${w}">${t}</button>`).join("")}</div>`;
  const teile = tabBilanzTeile(a);
  return reiter + teile[unter];
}
function tabBilanzTeile(a) {
  const spiele = spieleFilter({ saison: a.saison, hs: a.hs });
  const mb = mannschaftsbilanz(spiele);
  const sp = spielerbilanz(spiele);
  const dp = doppelbilanz(spiele);
  const alleGegner = gegnerbilanz(SB().spiele);
  const top = (arr, f) => arr.filter(f.filter).sort(f.sort)[0];
  const siege = top(alleGegner, { filter: (x) => x.s, sort: (x, y) => y.s - x.s || quote(y) - quote(x) });
  const nl = top(alleGegner, { filter: (x) => x.n, sort: (x, y) => y.n - x.n || quote(x) - quote(y) });
  const meist = top(alleGegner, { filter: () => true, sort: (x, y) => y.beg - x.beg });
  const ersteSaison = SB().saisons[SB().saisons.length - 1] || "";
  const zeigeAlle = ansicht("spiele").alleSpieler, zeigeAlleD = ansicht("spiele").alleDoppel;
  return { mannschaften: `
    <div class="karte dicht">${mb.map((m) => `<div style="padding:12px 14px;border-bottom:1px solid var(--gitter);display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-weight:700;flex:1">${esc(teamName(m.nr))}</span><span class="klein gedimmt">${esc(m.liga)}</span></div>
      <div class="raster4"><div class="wert"><span class="k">Beg.</span><span class="w">${m.beg}</span></div><div class="wert"><span class="k">S / U / N</span><span class="w">${m.s} / ${m.u} / ${m.n}</span></div><div class="wert"><span class="k">Spiele</span><span class="w">${m.sp[0]} : ${m.sp[1]}</span></div><div class="wert"><span class="k">Punkte</span><span class="w">${m.pk[0]} : ${m.pk[1]}</span></div></div>
      ${bal(m.s, m.u, m.n)}
      <a class="link" style="display:flex;justify-content:space-between;min-height:30px;align-items:center" data-akt="gegnerTeam" data-wert="${m.nr}"><span>Bilanz gegen alle Gegner</span><span>›</span></a></div>`).join("") || `<div class="zeile"><span class="leer">Keine Spiele in dieser Auswahl.</span></div>`}</div>
`,
    spieler: `
    <div class="karte dicht">${(zeigeAlle ? sp : sp.slice(0, 8)).map((p) => `<button class="zeile" ${SB().spieler[p.pid] ? `data-go="#/spieler/${encodeURIComponent(p.pid)}"` : ""}>
      ${avatar(p.name.split(", ")[1] || "", p.name.split(", ")[0])}
      <div class="haupt" style="gap:4px"><div style="display:flex;align-items:baseline;gap:6px"><span class="titel" style="font-size:14px;flex:1">${esc(p.name)}</span><span class="unter">${p.team ? esc(teamName(p.team)) : ""}</span></div>
        <div class="balken" style="height:5px"><div class="a" style="width:${proz(p.e[0], p.e[1])}%"></div></div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;width:70px"><span class="fett zahl">${p.e[0]} : ${p.e[1]}</span><span class="klein gedimmt">Doppel ${p.d[0]} : ${p.d[1]}</span></div></button>`).join("") || `<div class="zeile"><span class="leer">Keine Einzel in dieser Auswahl.</span></div>`}
      ${sp.length > 8 ? `<button class="zeile" data-akt="umschalten" data-feld="spiele.alleSpieler" data-wert="1" style="justify-content:center;color:var(--accent);font-weight:600">${zeigeAlle ? "Weniger zeigen" : `Alle ${sp.length} Spieler zeigen`}</button>` : ""}</div>
`,
    doppel: `
    <div class="karte dicht">${(zeigeAlleD ? dp : dp.slice(0, 5)).map((x) => `<div class="zeile"><div class="haupt" style="gap:4px"><span class="titel" style="font-size:14px">${esc(spielerName(x.a.pid, x.a.name).split(",")[0])} / ${esc(spielerName(x.b.pid, x.b.name).split(",")[0])}</span>
        <div class="balken" style="height:5px"><div class="a" style="width:${proz(x.d[0], x.d[1])}%"></div></div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;width:78px"><span class="fett zahl">${x.d[0]} : ${x.d[1]}</span><span class="klein gedimmt">Sätze ${x.saetze[0]} : ${x.saetze[1]}</span></div></div>`).join("") || `<div class="zeile"><span class="leer">Keine Doppel in dieser Auswahl.</span></div>`}
      ${dp.length > 5 ? `<button class="zeile" data-akt="umschalten" data-feld="spiele.alleDoppel" data-wert="1" style="justify-content:center;color:var(--accent);font-weight:600">${zeigeAlleD ? "Weniger zeigen" : `Alle ${dp.length} Doppel zeigen`}</button>` : ""}</div>
`,
    gegner: `<span class="hinweis">Alle Saisons seit ${esc(ersteSaison)}</span>
    <div class="karte dicht">
      ${siege ? `<button class="zeile" data-go="#/gegner/${encodeURIComponent(siege.verein)}"><div class="haupt"><span class="unter">Meiste Siege</span><span class="titel" style="font-size:14px">${esc(siege.verein)}</span></div>${pille(`${siege.s} Siege`, "gruen")}</button>` : ""}
      ${nl ? `<button class="zeile" data-go="#/gegner/${encodeURIComponent(nl.verein)}"><div class="haupt"><span class="unter">Meiste Niederlagen</span><span class="titel" style="font-size:14px">${esc(nl.verein)}</span></div>${pille(`${nl.n} Niederlagen`, "rot")}</button>` : ""}
      ${meist ? `<button class="zeile" data-go="#/gegner/${encodeURIComponent(meist.verein)}"><div class="haupt"><span class="unter">Meiste Begegnungen</span><span class="titel" style="font-size:14px">${esc(meist.verein)}</span></div>${pille(`${meist.beg} Spiele`, "blau")}</button>` : ""}
    </div><a class="knopf" data-go="#/gegner">Alle Gegnerbilanzen</a>`,
  };
}
AKTIONEN.gegnerTeam = (el) => { const g = ansicht("gegner", { team: "", suche: "", sort: "beg", offen: "" }); g.team = el.dataset.wert; g.offen = ""; geh("#/gegner"); };
function tabAufstellung(a) {
  const sb = SB();
  const saison = a.saison === "*" ? sb.aktuelle_saison : a.saison;
  let hs = a.hs;
  if (!hs) hs = saison === sb.aktuelle_saison ? sb.aktuelle_halbserie : (sb.aufstellungen?.[`${saison}|Rückrunde`] ? "Rückrunde" : "Vorrunde");
  const teams = sb.aufstellungen?.[`${saison}|${hs}`] || [];
  if (!teams.length) return `<div class="karte"><span class="leer">Für ${esc(saison)} ${esc(hs)} ist keine Aufstellung erfasst.</span></div>`;
  return teams.map((t) => `<div class="karte dicht"><div class="gruppe-kopf">${esc(t.team || t.name)}<span>${esc(t.liga)}${t.fuehrer ? " · MF " + esc(t.fuehrer) : ""}</span></div>
    ${t.spieler.map((p, i) => `<button class="zeile" ${sb.spieler[p.pid] ? `data-go="#/spieler/${encodeURIComponent(p.pid)}"` : ""}><span class="gedimmt" style="width:30px;font-size:13px">${t.nr}.${i + 1}</span>
      <div class="haupt"><span class="titel" style="font-size:14px">${esc(p.nachname)}, ${esc(p.vorname)}</span>${p.bem ? `<span class="unter">${esc(p.bem)}</span>` : ""}</div>
      ${p.status ? pille(p.status, "gelb") : ""}<span class="zahl gedimmt" style="width:44px;text-align:right">${(Array.isArray(p.qttr) ? p.qttr[0] : p.qttr) ?? ""}</span></button>`).join("")}</div>`).join("")
    + `<span class="hinweis">${esc(saison)} · ${esc(hs)} · Zahlen rechts: Q-TTR zum Stichtag der Halbserie.</span>`;
}

SEITEN.spiel = ([key]) => {
  const s = SB().spiele.find((x) => x.key === key);
  if (!s) return { titel: "Spiel", zurueck: ["#/spiele", "Spielbetrieb"], inhalt: `<div class="karte"><span class="leer">Spiel nicht gefunden.</span></div>` };
  const wir = teamName(s.mannschaft);
  const [h, g] = s.heim ? [wir, s.gegner] : [s.gegner, wir];
  const e = s.ergebnis || [0, 0];
  const stand = s.heim ? `${e[0]} : ${e[1]}` : `${e[1]} : ${e[0]}`;
  const partien = s.partien.map((p) => `<div class="partie"><span class="lbl">${esc(p.label.split("-")[0])}</span>
    <div class="namen"><span>${p.eigene.map((pid, i) => esc(spielerName(pid, p.eigene_namen[i]))).join(" / ")}</span><span class="gg">${esc(p.gegner.join(" / "))}</span>${p.saetze ? `<span class="saetze">${esc(p.saetze)}</span>` : ""}</div>
    ${p.gespielt ? pille(`${p.satzstand[0]}:${p.satzstand[1]}`, p.sieg ? "gruen" : "rot") : pille("nicht gespielt")}</div>`).join("");
  return {
    titel: "Spiel", zurueck: ["#/spiele", "Spielbetrieb"],
    inhalt: `<div class="karte"><span class="klein gedimmt" style="text-align:center">${esc(WT_LANG[datum(s.datum).getDay()])}, ${dmy(s.datum)}${s.uhrzeit ? " · " + esc(s.uhrzeit) : ""} · ${esc(s.liga)}</span>
        <div class="spiel-kopf"><span class="team">${esc(h)}</span><span class="stand" style="color:var(--${ergebnisArt(e) === "gruen" ? "p-gruen" : ergebnisArt(e) === "rot" ? "p-rot" : "text"})">${stand}</span><span class="team">${esc(g)}</span></div>
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">${pille(s.saison + " · " + s.halbserie)}${s.saetze ? pille(`Sätze ${s.saetze[0]}:${s.saetze[1]}`) : ""}${s.baelle ? pille(`Bälle ${s.baelle[0]}:${s.baelle[1]}`) : ""}${s.genehmigt ? pille("genehmigt", "gruen") : ""}</div>
        ${s.pdf ? `<button class="knopf" data-datei="${esc(s.pdf)}">${ic("pdf", 18)}Spielbericht öffnen</button>` : ""}</div>
      ${s.nur_ergebnis ? `<div class="karte"><span style="font-weight:600">Spielbericht noch nicht verfügbar</span><span class="klein gedimmt">Das Ergebnis kommt aus dem Spielplan von mytischtennis.de${s.kampflos ? " (kampflos)" : ""}. Sobald der Bericht veröffentlicht ist, lädt ihn das Programm am PC selbst – dann stehen hier Einzel, Doppel und Aufstellung.</span></div>
      <a class="link" style="text-align:center;padding:6px" data-go="#/gegner/${encodeURIComponent(s.gegner_verein)}">Alle Spiele gegen ${esc(s.gegner_verein)} ›</a>` : `
      ${abschnitt("Einzel und Doppel")}<div class="karte dicht">${partien || `<div class="zeile"><span class="leer">Keine Partien im Bericht.</span></div>`}</div>
      ${abschnitt("Aufstellung")}<div class="karte dicht" style="display:grid;grid-template-columns:1fr 1fr">
        <div>${s.aufstellung.map((x) => `<div class="zeile" style="font-size:13.5px"><span class="gedimmt" style="width:24px">${esc(x.rang)}</span>${SB().spieler[x.pid] ? `<a data-go="#/spieler/${encodeURIComponent(x.pid)}">${esc(x.name)}</a>` : esc(x.name)}</div>`).join("")}</div>
        <div style="border-left:1px solid var(--gitter)">${s.aufstellung_gegner.map((x) => `<div class="zeile" style="font-size:13.5px"><span class="gedimmt" style="width:24px">${esc(x.rang)}</span>${esc(x.name)}</div>`).join("")}</div></div>
      <a class="link" style="text-align:center;padding:6px" data-go="#/gegner/${encodeURIComponent(s.gegner_verein)}">Alle Spiele gegen ${esc(s.gegner_verein)} ›</a>`}`,
  };
};

TEILE.gegnerliste = () => {
  const a = ansicht("gegner", { team: "", suche: "", sort: "beg", offen: "" });
  const q = norm(a.suche);
  let liste = gegnerbilanz(spieleFilter({ team: a.team })).filter((x) => !q || norm(x.verein).includes(q));
  const sorts = { beg: (x, y) => y.beg - x.beg, s: (x, y) => y.s - x.s || quote(y) - quote(x), n: (x, y) => y.n - x.n || quote(x) - quote(y), name: (x, y) => x.verein.localeCompare(y.verein, "de"), letzt: (x, y) => y.letztes.localeCompare(x.letztes) };
  liste.sort(sorts[a.sort] || sorts.beg);
  if (a.offen) { const i = liste.findIndex((x) => norm(x.verein) === norm(a.offen)); if (i > 0) liste.unshift(liste.splice(i, 1)[0]); }
  return liste.map((x) => {
    const offen = a.offen && norm(a.offen) === norm(x.verein);
    const spiele = offen ? x.spiele.sort((p, q2) => q2.datum.localeCompare(p.datum)) : [];
    return `<div style="border-bottom:1px solid var(--gitter)"><button class="aufklapp" data-akt="umschalten" data-feld="gegner.offen" data-wert="${esc(x.verein)}">
      <div style="display:flex;align-items:center;gap:8px;width:100%"><div style="display:flex;flex-direction:column;flex:1;min-width:0"><span style="font-weight:600">${esc(x.verein)}</span><span class="klein gedimmt">${x.beg} Begegnung${x.beg === 1 ? "" : "en"} seit ${esc(x.seit)} · Spiele ${x.sp[0]}:${x.sp[1]}</span></div>
        <div class="snu"><span class="s">${x.s} S</span><span class="u">${x.u} U</span><span class="n">${x.n} N</span></div><span style="color:var(--chev);display:flex">${ic(offen ? "chevunten" : "chev", 18)}</span></div>${bal(x.s, x.u, x.n)}</button>
      ${offen ? `<div class="aufklapp-inhalt">${spiele.map((s) => `<button class="zeile" style="padding-left:28px;border-bottom:0;min-height:40px" data-go="#/spiel/${encodeURIComponent(s.key)}"><div class="haupt"><span style="font-size:13.5px;font-weight:600">${esc(s.halbserie === "Rückrunde" ? "RR" : "VR")} ${esc(s.saison)} · ${esc(teamName(s.mannschaft))}</span><span class="unter">${esc(WT[datum(s.datum).getDay()])} ${dmy(s.datum)} · ${s.heim ? "Heimspiel" : "auswärts"} · ${esc(s.gegner)}</span></div>${pille(`${s.ergebnis[0]}:${s.ergebnis[1]}`, ergebnisArt(s.ergebnis))}</button>`).join("")}</div>` : ""}</div>`;
  }).join("") || `<div class="zeile"><span class="leer">Kein Gegner gefunden.</span></div>`;
};
SEITEN.gegner = ([verein]) => {
  const a = ansicht("gegner", { team: "", suche: "", sort: "beg", offen: "" });
  if (verein && a._vor !== verein) { a.offen = verein; a._vor = verein; a.team = ""; }
  const teams = [["", "Alle Mannschaften"], ...SB().mannschaften.map((m) => [String(m.nr), m.team])];
  return {
    titel: "Gegnerbilanzen", zurueck: ["#/spiele", "Spielbetrieb"],
    kopf: `<div style="display:flex;gap:8px">${suchfeld("gegner", "suche", "Gegner suchen", "gegnerliste")}
      <select class="auswahl" style="height:38px" data-feld="gegner.sort" aria-label="Sortierung">${[["beg", "Begegnungen"], ["s", "Siege"], ["n", "Niederlagen"], ["letzt", "Zuletzt"], ["name", "Name"]].map(([w, t]) => `<option value="${w}" ${w === a.sort ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      ${chips("gegner", "team", teams, a.team)}`,
    inhalt: `<div class="karte dicht" data-teil-ziel="gegnerliste">${TEILE.gegnerliste()}</div>
      <span class="hinweis">Alle eingelesenen Spielberichte aller Saisons – wie am PC unter Saisonergebnisse → Gegner. Antippen klappt die Spiele auf.</span>`,
  };
};

SEITEN.spieler = ([pid]) => {
  const p = SB().spieler[pid];
  const m = (S.daten.mitglieder || []).find((x) => x.spieler === pid);
  const zurueck = m ? [`#/mitglied/${mitgliedId(m)}`, `${m.vorname} ${m.nachname}`] : ["#/spiele", "Spielbetrieb"];
  if (!p) return { titel: "Spielerprofil", zurueck, inhalt: `<div class="karte"><span class="leer">Keine Spielberichte zu diesem Spieler.</span></div>` };
  const a = ansicht("spieler", { gegen: "", partner: "" });
  const q = p.qttr || [];
  const delta = q.length > 1 ? q[0].wert - q[1].wert : null;
  const hsZeilen = p.halbserien.filter((h) => h.einzel[0] + h.einzel[1] > 0).slice(0, 8).map((h) => `<div style="display:flex;align-items:center;gap:10px">
    <span class="gedimmt" style="font-size:13px;width:92px">${h.halbserie === "Rückrunde" ? "RR" : "VR"} ${esc(h.saison)}</span>
    <div class="balken" style="flex:1;height:8px"><div class="a" style="width:${proz(h.einzel[0], h.einzel[1])}%"></div></div>
    <span class="fett zahl" style="font-size:13px;width:44px;text-align:right">${h.einzel[0]} : ${h.einzel[1]}</span></div>`).join("");
  const nachName = (liste, name) => liste.find((x) => x.name === name);
  const rang = (titel, namen, liste, wert) => namen && namen.length ? `<div class="rang"><span class="klein fett gedimmt">${titel}</span>${namen.map((n, i) => { const x = nachName(liste, n); return `<div class="r"><span class="nr">${i + 1}</span><span style="flex:1">${esc(n)}</span><b class="zahl" style="font-size:13px">${x ? wert(x) : ""}</b></div>`; }).join("")}</div>` : "";
  const alleGegen = a.gegen ? `<div class="rang">${p.gegenspieler.filter((x) => x.einzel[0] + x.einzel[1]).sort((x, y) => (y.einzel[0] + y.einzel[1]) - (x.einzel[0] + x.einzel[1])).map((x) => `<div class="r"><span style="flex:1;min-width:0">${esc(x.name)}<br><span class="klein gedimmt">${esc(x.verein)}</span></span><b class="zahl" style="font-size:13px">${x.einzel[0]} : ${x.einzel[1]}</b></div>`).join("")}</div>` : "";
  const allePartner = a.partner ? `<div class="rang">${p.doppelpartner.map((x) => `<div class="r"><span style="flex:1">${esc(x.name)}</span><span class="klein gedimmt">${x.spiele} Doppel</span><b class="zahl" style="font-size:13px;width:44px;text-align:right">${x.doppel[0]} : ${x.doppel[1]}</b></div>`).join("")}</div>` : "";
  return {
    titel: "Spielerprofil", rechts: `${esc(p.vorname)} ${esc(p.nachname)}`, zurueck,
    inhalt: `<div class="kacheln drei">
        <div class="kachel" style="cursor:default"><span class="k">Q-TTR</span><span class="w">${q[0]?.wert ?? "–"}</span><span class="u">${delta != null ? (delta >= 0 ? "+" : "") + delta + " zuletzt" : q[0] ? dmy(q[0].datum) : ""}</span></div>
        <div class="kachel" style="cursor:default"><span class="k">Einzel</span><span class="w">${p.einzel[0]} : ${p.einzel[1]}</span><span class="u">${proz(p.einzel[0], p.einzel[1])} %</span></div>
        <div class="kachel" style="cursor:default"><span class="k">Doppel</span><span class="w">${p.doppel[0]} : ${p.doppel[1]}</span><span class="u">${proz(p.doppel[0], p.doppel[1])} %</span></div></div>
      ${hsZeilen ? `<div class="karte">${kartenTitel("Einzel je Halbserie")}${hsZeilen}</div>` : ""}
      <div class="karte"><div class="karte-titel"><h2>Gegenspieler</h2><a data-akt="umschalten" data-feld="spieler.gegen" data-wert="1">${a.gegen ? "Weniger" : "Alle ›"}</a></div>
        ${a.gegen ? alleGegen : rang("MEISTE SIEGE", p.gegenspieler_top.siege, p.gegenspieler, (x) => `${x.einzel[0]} : ${x.einzel[1]}`) + rang("MEISTE NIEDERLAGEN", p.gegenspieler_top.niederlagen, p.gegenspieler, (x) => `${x.einzel[0]} : ${x.einzel[1]}`) || `<span class="leer">Keine Einzel.</span>`}</div>
      <div class="karte"><div class="karte-titel"><h2>Doppelpartner</h2><a data-akt="umschalten" data-feld="spieler.partner" data-wert="1">${a.partner ? "Weniger" : "Alle ›"}</a></div>
        ${a.partner ? allePartner : rang("MEISTE SIEGE", p.doppelpartner_top.siege, p.doppelpartner, (x) => `${x.doppel[0]} : ${x.doppel[1]}`) + rang("MEISTE DOPPEL", p.doppelpartner_top.spiele, p.doppelpartner, (x) => `${x.spiele} Doppel`) || `<span class="leer">Keine Doppel.</span>`}</div>
      <span class="hinweis">Alle eingelesenen Spielberichte (${p.begegnungen} Begegnungen) – wie das Spielerprofil am PC.</span>`,
  };
};

// ===================================================================================================== Mehr
function menuZeile(ziel, icon, farbe, titel, unter, rechts = CHEV) {
  return `<button class="zeile" data-go="${ziel}"><div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center" class="pille ${farbe}">${ic(icon)}</div>
    <div class="haupt"><span class="titel">${esc(titel)}</span><span class="unter">${esc(unter)}</span></div>${rechts}</button>`;
}
SEITEN.mehr = () => {
  const w = localStorage.getItem("darstellung") || "auto";
  const m = S.daten.meta;
  const name = S.benutzer?.displayName || (S.quelle === "datei" ? "Testmodus (Datei vom Gerät)" : "–");
  return {
    titel: "Mehr",
    inhalt: `<div class="karte dicht nur-handy">
        ${menuZeile("#/organisation", "org", "blau", "Vereinsorganisation", "Versammlungen, Vorstand, Satzung, Finanzamt, Training")}
        ${menuZeile("#/vereinsleben", "leben", "rosa", "Vereinsleben", "Feste, Ausflüge, Turniere mit Bildern")}
        ${menuZeile("#/dokumente", "dok", "gelb", "Dokumente", "Alle PDFs nach Bereich")}</div>
      ${abschnitt("Auf diesem Gerät")}
      <div class="karte dicht">
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--gitter)">
          <div style="display:flex;align-items:center;gap:12px"><div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center" class="pille">${ic("mond")}</div>
            <div class="haupt" style="display:flex;flex-direction:column"><span class="titel" style="font-size:15px;font-weight:600">Darstellung</span><span class="unter klein gedimmt">Automatisch folgt der Einstellung des Geräts</span></div></div>
          <div class="segmente" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[["auto", "Automatisch"], ["hell", "Hell"], ["dunkel", "Dunkel"]].map(([k, t]) => `<button class="segment ${k === w ? "aktiv" : ""}" data-akt="darstellung" data-wert="${k}">${t}</button>`).join("")}</div></div>
        <div class="zeile"><div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center" class="pille">${ic("wolke")}</div>
          <div class="haupt"><span class="titel">Offline verfügbar</span><span class="unter">Geladen ${esc(relZeit(S.geladen))} · Stand vom PC ${esc(relZeit(m.erzeugt))}</span></div>${pille("an", "gruen")}</div>
        <div class="zeile"><div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center" class="pille">${ic("person")}</div>
          <div class="haupt"><span class="titel">${esc(name)}</span><span class="unter">${esc(S.benutzer?.emailAddress || "")}${istVorstand() ? " · sieht alle Bereiche" : " · eingeschränkte Ansicht"}</span></div></div>
      </div>
      ${S.quelle === "google" || Google.angemeldet() ? `<button class="knopf" data-akt="aktualisieren">${ic("neu", 18)}Jetzt aktualisieren</button>` : CFG.googleClientId ? `<button class="knopf primaer" data-akt="anmelden">Mit Google anmelden</button>` : ""}
      <button class="knopf gefahr" data-akt="abmelden">Abmelden und Daten vom Gerät löschen</button>
      <span class="hinweis">Ändern geht nur im Programm am PC. Die App liest den Datenordner in Google Drive nur (App ${VERSION_APP}, Daten aus Programmversion ${esc(m.programmversion)}).${(m.fehler || []).length ? `<br>Beim Erstellen unvollständig: ${esc(m.fehler.join("; "))}` : ""}</span>`,
  };
};

// ===================================================================================================== Organisation
SEITEN.organisation = ([tabParam]) => {
  const o = S.daten.organisation || {};
  const a = { tab: tabParam || "uebersicht" };
  const tabs = [["uebersicht", "Organisation"], ["versammlungen", "Versammlungen"], ["vorstand", "Vorstand und Satzung"], ["finanzamt", "Finanzamt und Register"], ["training", "Training und Spiellokale"], ["berichte", "Tätigkeitsberichte"]];
  const t = heute();
  const vers = o.versammlungen || [];
  const kommend = vers.filter((v) => datum(v.datum) >= t).sort((x, y) => x.datum.localeCompare(y.datum));
  const vergangen = vers.filter((v) => datum(v.datum) < t);
  const versZeile = (v) => {
    const d = datum(v.datum);
    const einl = v.einladung_bis && datum(v.datum) >= t ? pille(`Einladung bis ${dmy(v.einladung_bis, false)}`, tageBis(v.einladung_bis) < 0 ? "rot" : "gelb") : CHEV;
    return `<button class="zeile" style="padding-left:0;padding-right:0" data-go="#/versammlung/${encodeURIComponent(v.id)}"><div class="datumsblock"><span>${MON[d.getMonth()]}</span><b>${d.getDate()}</b></div>
      <div class="haupt"><span class="titel" style="font-size:14px">${esc(v.titel)}</span><span class="unter">${esc(WT[d.getDay()])} ${dmy(v.datum)}${v.uhrzeit ? " · " + esc(v.uhrzeit) : ""}${v.ort ? " · " + esc(v.ort) : ""}</span></div>${einl}</button>`;
  };
  const amt = (x) => `<div style="display:flex;align-items:center;gap:10px">${avatar(x.name.split(" ")[0], x.name.split(" ").slice(-1)[0])}<div style="display:flex;flex-direction:column"><span style="font-size:14px;font-weight:600">${esc(x.name)}</span><span class="klein gedimmt">${esc(x.amt)}${x.im_amt ? "" : ` · ${dmy(x.von)} – ${dmy(x.bis)}`}</span></div></div>`;
  const vorstandJetzt = (o.vorstand || []).filter((x) => x.im_amt);
  const geltend = (o.fassungen || []).filter((f) => f.status === "gilt");
  const e = o.eckdaten || {};
  const wochenplan = (o.wochenplan || []);
  const hallenFarben = ["blau", "tuerkis", "lila", "gelb"];
  const hallenIndex = {}; (o.orte || []).forEach((x, i) => (hallenIndex[x.id] = hallenFarben[i % hallenFarben.length]));
  const wochenKarte = `<div class="karte">${kartenTitel("Training und Spiellokale")}
    ${wochenplan.map((z) => `<div style="display:flex;gap:10px;align-items:center"><span style="width:26px;font-size:13px;font-weight:700" class="gedimmt">${esc(z.tag_text.slice(0, 2))}</span>
      <div class="pille ${hallenIndex[z.ort] || ""}" style="flex:1;justify-content:flex-start;gap:10px;padding:8px 10px;border-radius:10px;font-size:13px"><b style="width:92px">${esc(z.von)}–${esc(z.bis)}</b><span style="font-weight:500;white-space:normal">${esc(z.ort_name)}${z.gruppe ? " · " + esc(z.gruppe) : ""}</span></div></div>`).join("") || `<span class="leer">Kein Wochenplan erfasst.</span>`}
    ${(o.orte || []).map((x) => `<div class="trenner"></div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:600">${esc(x.name)}</span>
      <span class="klein gedimmt">${[x.tische ? x.tische + " Tische" : "", x.adresse, x.antrag_frist ? "Hallenantrag bis " + x.antrag_frist : ""].filter(Boolean).map(esc).join(" · ")}</span>
      ${x.schluessel ? `<span class="klein gedimmt">Schlüssel: ${esc(x.schluessel)}</span>` : ""}
      ${x.ansprechpartner ? `<span class="klein gedimmt">Ansprechpartner: ${esc(x.ansprechpartner)}${x.telefon ? " · " + esc(x.telefon) : ""}</span>` : ""}
      ${(x.dokumente || []).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("")}</div>`).join("")}</div>`;
  const finanzamtKarte = `<div class="karte dicht"><div style="padding:14px 14px 4px">${kartenTitel("Finanzamt und Register")}</div>
    ${e.gemeinnuetzig_bis ? `<div class="kv"><span class="k">Gemeinnützig</span><span class="w">${pille("bis " + dmy(e.gemeinnuetzig_bis), tageBis(e.gemeinnuetzig_bis) < 90 ? "gelb" : "gruen")}</span></div>` : ""}
    ${e.steuererklaerung_bis ? `<div class="kv"><span class="k">Steuererklärung</span><span class="w">fällig bis ${dmy(e.steuererklaerung_bis)}</span></div>` : ""}
    ${e.finanzamt ? `<div class="kv"><span class="k">Finanzamt</span><span class="w">${esc(e.finanzamt)}${e.steuernummer ? " · St.-Nr. " + esc(e.steuernummer) : ""}</span></div>` : ""}
    ${e.registernummer ? `<div class="kv"><span class="k">Vereinsregister</span><span class="w">${esc(e.registergericht)} · ${esc(e.registernummer)}</span></div>` : ""}
    <div style="padding:4px 14px 10px">${o.bescheid?.dokument ? pdfZeile(o.bescheid.dokument, `vom ${dmy(o.bescheid.vom)}`) : ""}${a.tab === "finanzamt" ? (o.akten || []).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("") : ""}</div></div>`;
  const vorstandKarte = (alle) => `<div class="karte">${kartenTitel("Vorstand")}${o.letzte_wahl ? `<span class="klein gedimmt" style="margin-top:-6px">gewählt am ${dmy(o.letzte_wahl)}${o.amtszeit_ende ? ` · Amtszeit bis ${dmy(o.amtszeit_ende)}` : ""}</span>` : ""}
    ${vorstandJetzt.map(amt).join("") || `<span class="leer">Kein Vorstand erfasst.</span>`}
    ${alle ? (() => { const frueher = (o.vorstand || []).filter((x) => !x.im_amt); return frueher.length ? `<div class="trenner"></div><span class="klein fett gedimmt">FRÜHERE AMTSZEITEN</span>${frueher.map(amt).join("")}` : ""; })() : ""}
    <div class="trenner"></div>${(alle ? o.fassungen || [] : geltend).map((f) => f.dokument ? pdfZeile({ ...f.dokument, titel: f.ordnung + (alle ? ` (${f.status})` : "") }, "ab " + dmy(f.gueltig_ab)) : `<span class="klein">${esc(f.ordnung)} ab ${dmy(f.gueltig_ab)}</span>`).join("")}
    ${alle && e.kuendigungsfrist ? `<div class="trenner"></div><div class="karte dicht" style="border:0">${[["Kündigung", e.kuendigungsfrist], ["Beitrag fällig", e.beitragsfaelligkeit], ["Versammlung", e.mitgliederversammlung], ["Zweck", e.satzungszweck]].filter(([, w]) => w).map(([k, w]) => `<div class="kv" style="padding-left:0;padding-right:0"><span class="k">${k}</span><span class="w">${esc(w)}</span></div>`).join("")}</div>` : ""}</div>`;
  const berichteKarte = `<div class="karte">${kartenTitel("Tätigkeitsberichte")}${(o.taetigkeitsberichte || []).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("") || `<span class="leer">Noch keine Tätigkeitsberichte abgelegt.</span>`}</div>`;
  const versKarte = (alle) => `<div class="karte">${kartenTitel("Versammlungen")}${kommend.map(versZeile).join("")}${(alle ? vergangen : vergangen.slice(0, 2)).map(versZeile).join("") || (kommend.length ? "" : `<span class="leer">Keine Versammlungen erfasst.</span>`)}</div>`;
  // Übersicht: eine Zeile je Bereich mit Kurzstatus, Einzelheiten nach Antippen
  const naechste = kommend[0];
  const tage = [...new Set(wochenplan.map((z) => z.tag_text.slice(0, 2)))].join(" · ");
  const bereichZeile = (tab, titel, rechts, unter) => `<button class="zeile" data-go="#/organisation/${tab}"><div class="haupt"><span class="titel">${esc(titel)}</span>${unter ? `<span class="unter">${esc(unter)}</span>` : ""}</div><span class="gedimmt" style="font-size:14px;white-space:nowrap">${rechts}</span>${CHEV}</button>`;
  const uebersicht = `<div class="karte dicht">
    ${bereichZeile("versammlungen", "Versammlungen", naechste ? esc(dmy(naechste.datum, false)) : "", naechste ? "nächste: " + naechste.titel : `${vers.length} erfasst`)}
    ${bereichZeile("vorstand", "Vorstand und Satzung", o.amtszeit_ende ? "bis " + esc(String(o.amtszeit_ende).slice(0, 4)) : "", o.letzte_wahl ? "gewählt am " + dmy(o.letzte_wahl) : "")}
    ${bereichZeile("finanzamt", "Finanzamt und Register", e.gemeinnuetzig_bis ? pille("gemeinnützig", tageBis(e.gemeinnuetzig_bis) < 90 ? "gelb" : "gruen") : "", e.gemeinnuetzig_bis ? "bis " + dmy(e.gemeinnuetzig_bis) : "")}
    ${bereichZeile("training", "Training und Spiellokale", esc(tage), (o.orte || []).map((x) => x.name.split(" ").slice(-1)[0]).join(", "))}
    ${bereichZeile("berichte", "Tätigkeitsberichte", String((o.taetigkeitsberichte || []).length), "")}</div>`;
  const inhalt = {
    uebersicht, versammlungen: versKarte(true), vorstand: vorstandKarte(true), finanzamt: finanzamtKarte, training: wochenKarte, berichte: berichteKarte,
  }[a.tab] || uebersicht;
  const titel = (tabs.find(([w]) => w === a.tab) || [0, "Organisation"])[1];
  return a.tab === "uebersicht" ? { titel: "Organisation", zurueck: ["#/mehr", "Mehr"], inhalt } : { titel, zurueck: ["#/organisation", "Organisation"], inhalt };
};

SEITEN.versammlung = ([id]) => {
  const v = (S.daten.organisation?.versammlungen || []).find((x) => x.id === id);
  if (!v) return { titel: "Versammlung", zurueck: ["#/organisation", "Organisation"], inhalt: `<div class="karte"><span class="leer">Nicht gefunden.</span></div>` };
  const a = ansicht("versammlung", { tab: "kurz" });
  const p = v.protokoll;
  const dok = (rolle) => (v.dokumente || []).filter((d) => d.rolle === rolle);
  let inhalt = "";
  if (a.tab === "kurz") {
    const dauer = p?.beginn && p?.ende ? (() => { const [h1, m1] = p.beginn.split(":").map(Number), [h2, m2] = p.ende.split(":").map(Number); const min = h2 * 60 + m2 - (h1 * 60 + m1); return min > 0 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h` : ""; })() : "";
    inhalt = `${p ? `<div class="kacheln drei"><div class="kachel" style="cursor:default"><span class="k">Stimmberecht.</span><span class="w">${esc(p.stimmberechtigt || "–")}</span></div><div class="kachel" style="cursor:default"><span class="k">Beginn</span><span class="w">${esc(p.beginn || "–")}</span></div><div class="kachel" style="cursor:default"><span class="k">Dauer</span><span class="w">${esc(dauer || "–")}</span></div></div>` : ""}
      <div class="karte">${kartenTitel("Kurzzusammenfassung")}${v.kurzfassung.length ? `<div class="punkt-liste">${v.kurzfassung.map((x, i) => `<div class="p"><span class="nr">${i + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : `<span class="leer">Keine Kurzzusammenfassung eingetragen.</span>`}</div>
      ${v.beschluesse.length ? `<div class="karte">${kartenTitel("Beschlüsse")}<div class="punkt-liste">${v.beschluesse.map((b, i) => `<div class="p"><span class="nr">${i + 1}</span><span style="flex:1">${esc(b.antrag)}</span>${pille(b.dagegen || b.enthaltungen ? `${b.dafuer} : ${b.dagegen}${b.enthaltungen ? ` (${b.enthaltungen} Enth.)` : ""}` : "einstimmig", b.dafuer > b.dagegen ? "gruen" : "rot")}</div>`).join("")}</div></div>` : ""}
      <div class="karte">${kartenTitel("Dokumente")}${(v.dokumente || []).map((d) => pdfZeile({ ...d, titel: d.rolle_titel || d.titel }, d.datum ? dmy(d.datum) : "PDF")).join("") || `<span class="leer">Noch keine Dokumente abgelegt.</span>`}</div>`;
  } else if (a.tab === "einladung") {
    inhalt = `<div class="karte">${kartenTitel("Tagesordnung")}${v.tagesordnung.length ? `<div class="punkt-liste">${v.tagesordnung.map((x, i) => `<div class="p"><span class="nr">${i + 1}</span><span>${esc(x)}</span></div>`).join("")}</div>` : `<span class="leer">Keine Tagesordnung erfasst.</span>`}
      ${v.antragsfrist ? `<span class="klein gedimmt">Anträge bis ${dmy(v.antragsfrist)}</span>` : ""}</div>
      ${dok("einladung").map((d) => `<div class="karte">${pdfZeile({ ...d, titel: "Einladung (PDF)" }, d.datum ? dmy(d.datum) : "")}</div>`).join("")}`;
  } else {
    inhalt = p ? `<div class="karte dicht">${[["Ort", v.ort], ["Zeit", [p.beginn, p.ende].filter(Boolean).join(" – ")], ["Leitung", p.leiter], ["Protokoll", p.fuehrer], ["Stimmberechtigt", p.stimmberechtigt]].filter(([, w]) => w).map(([k, w]) => `<div class="kv"><span class="k">${k}</span><span class="w">${esc(w)}</span></div>`).join("")}</div>
      ${p.punkte.map((x, i) => `<div class="karte"><div class="punkt-liste"><div class="p"><span class="nr">${i + 1}</span><b>${esc(x.titel)}</b></div></div>${x.texte.map((t) => `<div class="vorformatiert">${esc(t)}</div>`).join("") || `<span class="leer">–</span>`}</div>`).join("")}
      ${dok("protokoll").map((d) => `<div class="karte">${pdfZeile({ ...d, titel: "Protokoll (PDF)" }, d.datum ? dmy(d.datum) : "")}</div>`).join("")}`
      : `<div class="karte"><span class="leer">Noch kein Protokoll erfasst.</span>${dok("protokoll").map((d) => pdfZeile({ ...d, titel: "Protokoll (PDF)" })).join("")}</div>`;
  }
  return {
    titel: v.titel, zurueck: ["#/organisation/versammlungen", "Versammlungen"],
    kopf: `<span class="klein gedimmt" style="margin-top:-6px;font-size:13px">${esc(WT_LANG[datum(v.datum).getDay()])}, ${dmy(v.datum)}${v.uhrzeit ? " · " + esc(v.uhrzeit) : ""}${v.ort ? " · " + esc(v.ort) : ""}</span>
      ${segmente("versammlung", "tab", [["kurz", "Kurzfassung"], ["einladung", "Einladung"], ["protokoll", "Protokoll"]], a.tab)}`,
    inhalt,
  };
};

// ===================================================================================================== Vereinsleben
SEITEN.vereinsleben = () => {
  const liste = S.daten.vereinsleben || [];
  const [erst, ...rest] = liste;
  return {
    titel: "Vereinsleben", zurueck: ["#/mehr", "Mehr"],
    inhalt: erst ? `<button class="karte dicht" style="text-align:left;cursor:pointer;color:var(--text)" data-go="#/eintrag/${encodeURIComponent(erst.id)}">
        <div class="titelbild" ${erst.titelbild ? `data-bild="${esc(erst.titelbild)}" data-groesse="900"` : ""}>${erst.titelbild ? ic("bild", 28) : ""}</div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:17px;font-weight:700;flex:1">${esc(erst.titel)}</span>${pille(erst.art, "gelb")}</div>
          <span class="klein gedimmt" style="font-size:13px">${esc(wtDatum(erst.datum))}${erst.uhrzeit ? " · " + esc(erst.uhrzeit) : ""}${erst.ort ? " · " + esc(erst.ort) : ""}</span>
          ${erst.bericht ? `<span style="font-size:14px">${esc(erst.bericht)}</span>` : ""}
          <span class="klein gedimmt">${[erst.bilder.length ? erst.bilder.length + " Bilder" : "", erst.videos.length ? erst.videos.length + " Video" + (erst.videos.length > 1 ? "s" : "") : "", erst.dokumente.length ? erst.dokumente.length + " Dokument" + (erst.dokumente.length > 1 ? "e" : "") : ""].filter(Boolean).join(" · ")}</span></div></button>
      ${rest.length ? `<div class="karte dicht">${rest.map(lebenZeile).join("")}</div>` : ""}` : `<div class="karte"><span class="leer">Noch keine Einträge.</span></div>`,
  };
};
SEITEN.eintrag = ([id]) => {
  const e = (S.daten.vereinsleben || []).find((x) => x.id === id);
  if (!e) return { titel: "Vereinsleben", zurueck: ["#/vereinsleben", "Vereinsleben"], inhalt: `<div class="karte"><span class="leer">Nicht gefunden.</span></div>` };
  return {
    titel: e.titel, zurueck: ["#/vereinsleben", "Vereinsleben"],
    kopf: `<span class="klein gedimmt" style="margin-top:-6px;font-size:13px">${esc(WT_LANG[datum(e.datum).getDay()])}, ${dmy(e.datum)}${e.uhrzeit ? " · " + esc(e.uhrzeit) : ""}${e.ort ? " · " + esc(e.ort) : ""} · ${esc(e.art)}</span>`,
    inhalt: `${e.bericht || e.notizen ? `<div class="karte">${e.bericht ? `<span style="font-size:14px">${esc(e.bericht)}</span>` : ""}${e.notizen ? `<div class="vorformatiert gedimmt">${esc(e.notizen)}</div>` : ""}</div>` : ""}
      ${e.bilder.length ? `<div class="karte">${kartenTitel(`Bilder (${e.bilder.length})`)}
        ${S.quelle === "google" ? `<div class="galerie">${e.bilder.map((b, i) => `<button data-akt="bild" data-eintrag="${esc(e.id)}" data-nr="${i}" aria-label="Bild ${i + 1}" data-bild="${esc(b.datei)}" data-groesse="400"></button>`).join("")}</div>` : `<span class="leer">Bilder gibt es nur mit Google-Anmeldung.</span>`}</div>` : ""}
      ${e.videos.length ? `<div class="karte">${kartenTitel("Videos")}${e.videos.map((v) => `<button class="zeile" style="padding:6px 0;border:0" data-datei="${esc(v)}">${ic("video")}<span class="haupt">${esc(v.split("/").pop())}</span>${CHEV}</button>`).join("")}</div>` : ""}
      ${e.dokumente.length ? `<div class="karte">${kartenTitel("Dokumente")}${e.dokumente.map((d) => pdfZeile(d, "PDF")).join("")}</div>` : ""}
      ${e.teilnehmer.length ? `<div class="karte">${kartenTitel(`Dabei (${e.teilnehmer.length}${e.gaeste ? ` + ${e.gaeste} Gäste` : ""})`)}<span style="font-size:14px;line-height:1.6">${e.teilnehmer.map(esc).join(", ")}</span></div>` : ""}`,
  };
};
// Bildbetrachter mit Wischen
AKTIONEN.bild = (el) => {
  const e = (S.daten.vereinsleben || []).find((x) => x.id === el.dataset.eintrag);
  if (!e) return;
  let nr = Number(el.dataset.nr);
  const b = document.createElement("div"); b.className = "betrachter";
  const zeichne = async () => {
    b.innerHTML = `<div class="leiste"><span>${nr + 1} / ${e.bilder.length}</span><button data-zu>Schließen</button></div><div class="bild"><span class="gedimmt">Lädt …</span></div>
      <div class="pfeile"><button data-zurueck aria-label="Vorheriges Bild">‹</button><button data-vor aria-label="Nächstes Bild">›</button></div>`;
    const ziel = b.querySelector(".bild"), pfad = e.bilder[nr].datei, jetzt = nr;
    try { const url = await bildVoll(pfad); if (url && jetzt === nr) ziel.innerHTML = `<img src="${url}" alt="">`; } catch (err) { ziel.innerHTML = `<span class="gedimmt">Bild nicht erreichbar.</span>`; }
  };
  b.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-zu]")) b.remove();
    else if (ev.target.closest("[data-vor]")) { nr = (nr + 1) % e.bilder.length; zeichne(); }
    else if (ev.target.closest("[data-zurueck]")) { nr = (nr - 1 + e.bilder.length) % e.bilder.length; zeichne(); }
  });
  let x0 = null;
  b.addEventListener("touchstart", (ev) => { x0 = ev.touches.length === 1 ? ev.touches[0].clientX : null; }, { passive: true });
  b.addEventListener("touchend", (ev) => {
    if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { nr = (nr + (dx < 0 ? 1 : -1) + e.bilder.length) % e.bilder.length; zeichne(); }
  });
  document.body.appendChild(b); zeichne();
};

// ===================================================================================================== Dokumente
TEILE.dokumente = () => {
  const a = ansicht("dokumente", { suche: "" });
  const q = norm(a.suche);
  const gruppen = {};
  for (const d of S.daten.dokumente || []) {
    if (q && !norm(`${d.titel} ${d.bereich} ${d.datum}`).includes(q)) continue;
    (gruppen[d.bereich] = gruppen[d.bereich] || []).push(d);
  }
  return Object.entries(gruppen).map(([b, liste]) => `<div class="karte dicht"><div class="gruppe-kopf">${esc(b)}<span>${liste.length}</span></div>
    <div style="padding:0 14px">${liste.sort((x, y) => (y.datum || "").localeCompare(x.datum || "")).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "")).join("")}</div></div>`).join("") || `<div class="karte"><span class="leer">Nichts gefunden.</span></div>`;
};
SEITEN.dokumente = () => ({
  titel: "Dokumente", zurueck: ["#/mehr", "Mehr"], kopf: suchfeld("dokumente", "suche", "Titel oder Bereich", "dokumente"),
  inhalt: `<div style="display:flex;flex-direction:column;gap:12px" data-teil-ziel="dokumente">${TEILE.dokumente()}</div>
    <span class="hinweis">Antippen öffnet das Dokument in Google Drive.</span>`,
});

// ===================================================================================================== Start der App
// Ziehen zum Aktualisieren (oben am Inhalt nach unten ziehen)
(function ziehenZumAktualisieren() {
  let y0 = null, weg = 0, anzeige = null;
  document.addEventListener("touchstart", (e) => {
    const inhalt = e.target.closest(".inhalt");
    y0 = inhalt && inhalt.scrollTop <= 0 && S.daten && !S.laedt && e.touches.length === 1 ? e.touches[0].clientY : null; weg = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    weg = e.touches[0].clientY - y0;
    if (weg > 10) {
      if (!anzeige) { anzeige = document.createElement("div"); anzeige.className = "ziehen"; document.body.appendChild(anzeige); }
      anzeige.textContent = weg > 80 ? "Loslassen zum Aktualisieren" : "Zum Aktualisieren ziehen";
      anzeige.style.opacity = Math.min(1, weg / 80);
    }
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (anzeige) { anzeige.remove(); anzeige = null; }
    if (y0 != null && weg > 80) { if (S.quelle === "google" || Google.angemeldet()) { ladeVonGoogle(); ladeLive(); } else toast("Im Testmodus gibt es nichts zu aktualisieren."); }
    y0 = null; weg = 0;
  });
})();

async function starte() {
  thema();
  const zurueckVonGoogle = Google.rueckkehr();
  await ladeAusSpeicher();
  zeige();
  window.addEventListener("hashchange", zeige);
  window.addEventListener("online", zeige);
  window.addEventListener("offline", zeige);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  // Nach der Anmeldung bzw. beim Öffnen mit gültiger Anmeldung: neuesten Stand holen
  if (Google.token() && (zurueckVonGoogle || sessionStorage.getItem("g_frisch") || !S.daten || S.quelle === "google")) {
    sessionStorage.removeItem("g_frisch");
    const alter = S.geladen ? Date.now() - new Date(S.geladen).getTime() : Infinity;
    if (zurueckVonGoogle || alter > 5 * 60000) ladeVonGoogle({ leise: !zurueckVonGoogle });
  }
  ladeLive();
  // Zurück in die App (vom Home-Bildschirm): nach einer Stunde leise neu laden, wenn die Anmeldung noch gilt
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ladeLive();
    if (document.visibilityState === "visible" && S.quelle === "google" && Google.token() && S.geladen && Date.now() - new Date(S.geladen).getTime() > 3600000) ladeVonGoogle({ leise: true });
  });
}
starte();
