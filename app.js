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
const VERSION_APP = "2.0 (v10)";

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
  if (!el || el.tagName === "SELECT") return; // Auswahllisten: erst bei „change“ (sonst geht das change-Ereignis am neu gezeichneten Element verloren)
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
function datumsblock(iso) {
  const d = datum(iso); if (!d) return "";
  const t = heute(), anders = d.getMonth() !== t.getMonth() || d.getFullYear() !== t.getFullYear();
  return `<div class="datumsblock"><span>${WT[d.getDay()]}</span><b>${d.getDate()}</b>${anders ? `<small>${MON[d.getMonth()]}${d.getFullYear() !== t.getFullYear() ? " " + String(d.getFullYear()).slice(2) : ""}</small>` : ""}</div>`;
}
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
// ===================================================================================================== Bausteine (seit v10, Stil wie das PC-Programm 4.2.1)
// Kachel mit farbigem Strich: Titel, Wert, Unterzeile mit Sprung „›“ (wie qt_design.Kachel)
function kachel2({ titel, wert, unter = "", farbe = "var(--accent)", ziel = "", akt = "", feld = "", wertArt = "", balken = null, aktiv = false }) {
  const tag = ziel || akt ? "button" : "div";
  const attr = ziel ? `data-go="${ziel}"` : akt ? `data-akt="${akt}" data-feld="${feld}" data-wert="${esc(wert)}"` : "";
  return `<${tag} class="kachel2 ${aktiv ? "aktiv" : ""}" ${attr} style="--k:${farbe}"><span class="strich"></span><span class="ki">
    <span class="k">${esc(titel)}</span><span class="w ${wertArt}">${esc(wert)}</span>${unter ? `<span class="u">${esc(unter)}</span>` : ""}
    ${balken != null ? `<span class="kbalken"><span style="width:${Math.max(0, Math.min(100, balken))}%"></span></span>` : ""}</span></${tag}>`;
}
// Kachel als Filter: Antippen setzt bzw. löst den Filter (data-akt umschalten)
function filterKachel(seite, feld, wert, aktuell, opts) {
  return kachel2({ ...opts, akt: "umschaltenWert", feld: `${seite}.${feld}|${wert}`, aktiv: aktuell === wert });
}
AKTIONEN.umschaltenWert = (el) => {
  const f = el.dataset.feld, i = f.indexOf("|"), pfad = f.slice(0, i), wert = f.slice(i + 1); const [seite, feld] = pfad.split(".");
  const a = ansicht(seite); a[feld] = a[feld] === wert ? "" : wert; zeige();
};
function formKaestchen(liste, klein = false) {
  return liste && liste.length ? `<span class="form ${klein ? "klein" : ""}" aria-label="Form ${esc(liste.join(" "))}">${liste.map((x) => `<span class="f ${FORM_ART[x] || ""}">${esc(x)}</span>`).join("")}</span>` : "";
}
// Mannschaftsfarbe wie im Kalender (Abo-Farbe der Mannschaft)
function teamFarbe(nr) {
  const t = (S.daten.kalender?.termine || []).find((x) => x.spiel && x.mannschaft === nr && x.farbe);
  return t ? t.farbe : ["#2563a8", "#d9622b", "#1d8a88", "#7a4fc0", "#c0397a"][((nr || 1) - 1) % 5];
}
const ROEMISCH = ["", "", "II", "III", "IV", "V", "VI", "VII", "VIII"];
// Eigene Mannschaft wie am PC (ta.anzeige_name): „TTV Werragrund 08“, „TTV Werragrund 08 II“ …
function vereinsTeam(nr) { const v = S.daten.meta?.verein_kurz || "Verein"; return nr > 1 ? `${v} ${ROEMISCH[nr] || nr}` : v; }
function streifen(farbe) { return `<span class="streifen" style="background:${esc(farbe)}"></span>`; }
const EINORDNUNG_ART = { Spitzenspiel: "blau", Kellerduell: "rot", Favorit: "gruen", Außenseiter: "gelb", "Duell auf Augenhöhe": "" };
function einordnungPille(e) { return e ? pille(e.replace("Duell auf Augenhöhe", "Augenhöhe"), EINORDNUNG_ART[e] ?? "") : ""; }
function ohneLiga(name) { return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); }
const isoPlus = (iso, tage) => { const d = datum(iso); d.setDate(d.getDate() + tage); return isoTag(d); };
function wochentagNr(d) { return (d.getDay() + 6) % 7; } // Mo = 0 wie im Wochenplan

// ===================================================================================================== Kommende Spiele
// Alle Spieltermine ab heute (Kalender-Abos), angereichert um Tabellenplätze, Punkte, Form beider Mannschaften und Bilanz
function kommendeSpiele() {
  const d = S.daten, t = isoTag(heute()), ex = d.start?.naechste_spiele || [];
  let liste = (d.kalender?.termine || []).filter((k) => k.spiel && k.mannschaft && k.datum >= t).map((k) => {
    const teile = String(k.titel || "").split(" – ");
    const heim = teile.length === 2 ? norm(teile[0]).startsWith(norm(d.meta?.verein_kurz || "")) : true;
    const gegner = teile.length === 2 ? (heim ? teile[1] : teile[0]) : k.titel;
    return { datum: k.datum, uhrzeit: k.uhrzeit, ort: k.ort, mannschaft: k.mannschaft, team: teamName(k.mannschaft), gegner, heim, farbe: k.farbe };
  });
  if (!liste.length) liste = ex.map((s) => ({ ...s, farbe: teamFarbe(s.mannschaft) }));
  liste.sort((a, b) => (a.datum + (a.uhrzeit || "")).localeCompare(b.datum + (b.uhrzeit || "")));
  return liste.map((s) => spielAnreichern(s, ex.find((x) => x.datum === s.datum && x.mannschaft === s.mannschaft)));
}
function spielAnreichern(s, alt = {}) {
  alt = alt || {};
  const saison = SB().aktuelle_saison, tp = tabellenPlatz(saison, s.mannschaft);
  const liga = tp && (SB().tabellen?.[saison]?.ligen || []).find((l) => l.liga === tp.liga);
  const g = norm(ohneLiga(s.gegner));
  const zg = liga && (liga.zeilen.find((r) => norm(r.name) === g) || liga.zeilen.find((r) => !r.eigen && g && (norm(r.name).includes(g) || g.includes(norm(r.name)))));
  const an = tp ? ligaAnalyse(tp.liga, saison) : null;
  const eigenName = an && Object.keys(an.eigene || {}).find((n) => an.eigene[n] === s.mannschaft);
  const gegnerName = an && (Object.keys(an.teams).find((n) => norm(n) === g) || Object.keys(an.teams).find((n) => !an.eigene[n] && (norm(n).includes(g) || g.includes(norm(n)))));
  const tg = gegnerName ? an.teams[gegnerName] : null, te = eigenName ? an.teams[eigenName] : null;
  const platz = tp ? tp.platz : alt.platz ?? null, platzGegner = zg ? zg.platz : alt.platz_gegner ?? null, anzahl = liga ? liga.zeilen.length : alt.anzahl ?? null;
  const eigeneForm = te?.form?.length ? te.form.slice(-5) : formAusSpielen(s.mannschaft, 5);
  return { ...alt, ...s, gegner: ohneLiga(s.gegner), liga: tp?.liga || alt.liga || "", platz, platz_gegner: platzGegner, anzahl,
    punkte: tp?.punkte || null, punkte_gegner: zg?.punkte || null, form: eigeneForm, form_gegner: tg?.form?.slice(-5) || alt.analyse?.form || [],
    serie_gegner: tg?.serie || "", analyse_gegner: tg, analyse_liga: an, gegner_name: gegnerName,
    vergleich: tg?.vergleich?.[s.mannschaft] || (alt.analyse?.vergleich ?? null),
    einordnung: einordnung(platz, platzGegner, anzahl), bilanz: alt.bilanz?.begegnungen ? alt.bilanz : bilanzGegen(ohneLiga(s.gegner)),
    key: `${s.datum}|${s.mannschaft}` };
}
// Form aus den eigenen Ergebnissen der laufenden Saison (wenn kein Spielplan da ist)
function formAusSpielen(nr, n) {
  const saison = SB().aktuelle_saison;
  return SB().spiele.filter((x) => x.saison === saison && x.mannschaft === nr && x.ergebnis).sort((a, b) => a.datum.localeCompare(b.datum))
    .slice(-n).map((x) => (x.ergebnis[0] > x.ergebnis[1] ? "S" : x.ergebnis[0] < x.ergebnis[1] ? "N" : "U"));
}
// Je Mannschaft das nächste Spiel (für Mitglieder-/Kalender-Hinweise wie bisher)
function naechsteSpiele() {
  const gesehen = new Set();
  return kommendeSpiele().filter((s) => !gesehen.has(s.mannschaft) && gesehen.add(s.mannschaft));
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
function relTag(iso) {
  const tg = tageBis(iso);
  return tg === 0 ? "Heute" : tg === 1 ? "Morgen" : tg === 2 ? "Übermorgen" : `${WT[datum(iso).getDay()]} ${dmy(iso, false)}`;
}
// Das Spiel ausführlich: beide Mannschaften mit Platz, Punkten und Form, dazu Vergleich, letztes Duell, gemeinsame Gegner, Ort
function spielGross(s, mitKopf = true) {
  const seite = (name, platz, pk, form, eigen) => `<div class="sg-team ${eigen ? "" : "rechts"}"><span class="sg-name">${esc(name)}</span>
    <span class="sg-platz">${platz ? platz + "." : "–"}<small> Platz</small></span><span class="klein gedimmt">${pk ? pk.join(":") + " Punkte" : "&nbsp;"}</span>${formKaestchen(form) || `<span class="klein gedimmt">keine Form</span>`}</div>`;
  const b = s.bilanz || {}, l = (b.letzte || [])[0], vg = s.vergleich;
  const info = [
    ["Direkter Vergleich", b.begegnungen ? `${b.siege} S · ${b.unentschieden} U · ${b.niederlagen} N <span class="gedimmt">seit ${esc(b.seit)}</span>` : "noch keine Begegnung"],
    l ? ["Letztes Duell", `<a data-go="#/spiel/${encodeURIComponent(l.key)}">${l.ergebnis[0]}:${l.ergebnis[1]}</a> · ${l.halbserie === "Rückrunde" ? "Rückrunde" : "Vorrunde"} ${esc(l.saison)}`] : null,
    vg ? ["Gemeinsame Gegner", `${vg.gegner} – wir ${vg.punkte[0]}, sie ${vg.punkte[1]} Punkte`] : null,
    s.analyse_gegner ? [`Gegner ${s.heim ? "auswärts" : "zu Hause"}`, esc(bilanzKurz(s.heim ? s.analyse_gegner.auswaerts : s.analyse_gegner.heim))] : null,
    s.ort ? ["Ort", esc(s.ort.split(",").slice(0, 2).join(","))] : null,
  ].filter(Boolean);
  const formLink = s.gegner_name && s.analyse_liga ? `<a class="link" data-go="#/form/${encodeURIComponent(s.analyse_liga.liga)}/${encodeURIComponent(s.gegner_name)}">Formanalyse ${esc(s.gegner)} ›</a>` : "";
  return `${mitKopf ? `<div class="sg-oben"><span class="klein fett" style="color:${esc(s.farbe)}">${esc(s.team)}${s.liga ? " · " + esc(s.liga) : ""}</span><span style="flex:1"></span>${einordnungPille(s.einordnung)}</div>
    <span class="sg-wann">${relTag(s.datum)}${tageBis(s.datum) <= 2 ? `, ${WT[datum(s.datum).getDay()]} ${dmy(s.datum, false)}` : ""}${s.uhrzeit ? " · " + esc(s.uhrzeit) : ""} · ${s.heim ? "Heimspiel" : "auswärts"}</span>` : ""}
    <div class="sg-teams">${seite(vereinsTeam(s.mannschaft), s.platz, s.punkte, s.form, true)}<span class="sg-gegen">gegen</span>${seite(s.gegner, s.platz_gegner, s.punkte_gegner, s.form_gegner, false)}</div>
    <div class="sg-info">${info.map(([k, w]) => `<div class="sg-z"><span class="k">${k}</span><span class="w">${w}</span></div>`).join("")}</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">${formLink}<a class="link" data-go="#/gegner/${encodeURIComponent(gegnerVerein(s.gegner))}">Alle Spiele gegen ${esc(gegnerVerein(s.gegner))} ›</a></div>`;
}

// ===================================================================================================== Die nächsten 7 Tage
function tagesEintraege(iso) {
  const d = S.daten, t = datum(iso), wt = wochentagNr(t);
  const aus = [];
  for (const x of d.kalender?.termine || []) {
    if (x.datum !== iso) continue;
    if (x.bis && x.bis !== x.datum && !x.frist && !x.spiel) continue; // Ferien u. Ä. über mehrere Tage nicht als Tagestermin
    aus.push({ art: x.spiel ? "spiel" : x.frist ? "frist" : x.bereich === "Geburtstage" ? "geburtstag" : "termin", farbe: x.farbe, t: x });
  }
  // Training aus dem Wochenplan, nicht in den Ferien (Ferien stehen als Termin mit „bis“ im Bereich Halle und Training)
  const ferien = (d.kalender?.termine || []).some((x) => x.bis && /ferien/i.test(x.titel) && x.datum <= iso && x.bis >= iso);
  if (!ferien) for (const z of d.organisation?.wochenplan || []) if (z.tag === wt) aus.push({ art: "training", farbe: d.kalender?.bereiche?.["Halle und Training"] || "#6b7280", z });
  const zeit = (e) => e.t?.uhrzeit || e.z?.von || (e.art === "geburtstag" ? "00" : "99");
  return aus.sort((a, b) => zeit(a).localeCompare(zeit(b)));
}
function tagesZeile(e, spiele) {
  if (e.art === "training") return `<div class="zeile kompakt">${streifen(e.farbe)}<div class="haupt"><span class="titel">Training${e.z.gruppe ? " · " + esc(e.z.gruppe) : ""}</span><span class="unter">${esc(e.z.von)}–${esc(e.z.bis)} · ${esc(e.z.ort_name)}</span></div></div>`;
  const x = e.t;
  if (e.art === "spiel") {
    const s = spiele.find((y) => y.datum === x.datum && y.mannschaft === x.mannschaft);
    return `<button class="zeile kompakt" data-go="#/spiele">${streifen(e.farbe)}<div class="haupt"><span class="titel">${s ? `${s.heim ? "gegen" : "bei"} ${esc(s.gegner)}` : esc(x.titel)}</span><span class="unter">${[x.uhrzeit, s ? s.team : "", s?.heim ? "Heimspiel" : "auswärts"].filter(Boolean).map(esc).join(" · ")}</span></div>${s && s.einordnung ? einordnungPille(s.einordnung) : ""}${CHEV}</button>`;
  }
  if (e.art === "geburtstag") return `<div class="zeile kompakt">${streifen(e.farbe)}<div class="haupt"><span class="titel">${esc(x.name || x.titel)}${x.alter ? ` wird ${x.alter}` : ""}</span><span class="unter">Geburtstag</span></div>${x.rund ? pille("rund", "rosa") : ""}</div>`;
  return `<button class="zeile kompakt" data-go="#/kalender">${streifen(e.farbe)}<div class="haupt"><span class="titel">${e.art === "frist" ? "⚑ " : ""}${esc(x.titel)}</span><span class="unter">${esc([x.uhrzeit, x.ort ? x.ort.split(",")[0] : "", x.bereich].filter(Boolean).join(" · "))}</span></div>${e.art === "frist" ? pille(x.status === "erledigt" ? "erledigt" : "Frist", x.status === "erledigt" ? "gruen" : "gelb") : ""}</button>`;
}
function siebenTage(spiele) {
  const a = ansicht("start", { tag: "", offen: "" });
  const t0 = isoTag(heute());
  const tage = Array.from({ length: 7 }, (_, i) => isoPlus(t0, i)).map((iso) => ({ iso, e: tagesEintraege(iso) }));
  const gew = tage.find((x) => x.iso === a.tag) || tage.find((x) => x.e.some((e) => e.art !== "training")) || tage[0];
  const leiste = tage.map(({ iso, e }) => {
    const d = datum(iso), farben = [...new Set(e.map((x) => x.farbe))].slice(0, 3);
    return `<button class="tag ${iso === gew.iso ? "gewaehlt" : ""} ${iso === t0 ? "heute" : ""}" data-akt="setze" data-feld="start.tag" data-wert="${iso}" aria-label="${WT_LANG[d.getDay()]} ${dmy(iso)}">
      <span class="wt">${WT[d.getDay()]}</span><span class="nr">${d.getDate()}</span><span class="striche">${farben.map((f) => `<i style="background:${esc(f)}"></i>`).join("") || `<em>frei</em>`}</span></button>`;
  }).join("");
  const d = datum(gew.iso);
  return `<div class="karte dicht"><div class="tagleiste">${leiste}</div>
    <div class="tag-liste"><span class="tag-titel">${esc(WT_LANG[d.getDay()])}, ${d.getDate()}. ${esc(MONATE[d.getMonth()])}</span>
    ${gew.e.map((e) => tagesZeile(e, spiele)).join("") || `<div class="zeile kompakt"><span class="leer">Nichts geplant.</span></div>`}</div></div>`;
}

// ===================================================================================================== Start
SEITEN.start = () => {
  const d = S.daten, st = d.start || {}, m = d.meta;
  const k = st.mitglieder || {};
  const a = ansicht("start", { tag: "", offen: "" });
  const fristen = offeneFristen();
  const tHeute = isoTag(heute());
  const versTermin = (d.kalender?.termine || []).filter((x) => x.bereich === "Versammlungen" && x.datum >= tHeute)[0]
    || (d.organisation?.versammlungen || []).filter((v) => v.datum >= tHeute).sort((x, y) => x.datum.localeCompare(y.datum))[0];
  const kacheln = `<div class="kachelreihe drei">
    ${kachel2({ titel: "Mitglieder", wert: k.gesamt ?? "–", unter: `${k.aktiv ?? "–"} aktiv ›`, ziel: "#/mitglieder" })}
    ${kachel2({ titel: "Fristen", wert: fristen.length, unter: fristen[0] ? `ab ${dmy(fristen[0].datum, false)} ›` : "keine offen ›", farbe: "#c08a00", wertArt: fristen.length ? "gelb" : "", ziel: "#/kalender/fristen" })}
    ${kachel2({ titel: "Sitzung", wert: versTermin ? dmy(versTermin.datum, false) : "–", unter: versTermin ? `${versTermin.titel} ›` : "keine geplant ›", farbe: "#1e8a4a", ziel: "#/organisation/versammlungen" })}</div>`;

  const spiele = kommendeSpiele();
  const [erstes, ...folgende] = spiele;
  const gross = erstes ? `<div class="karte spielgross">${spielGross(erstes)}</div>` : `<div class="karte"><span class="leer">Keine Spiele angesetzt – Sommerpause.</span></div>`;
  const danach = folgende.slice(0, 4).map((s) => {
    const offen = a.offen === s.key;
    return `<div class="eintrag"><button class="zeile" data-akt="umschaltenWert" data-feld="start.offen|${esc(s.key)}">${datumsblock(s.datum)}${streifen(s.farbe)}
      <div class="haupt"><span class="titel">${s.heim ? "gegen" : "bei"} ${esc(s.gegner)}</span><span class="unter">${esc([s.team, s.uhrzeit, s.platz ? `wir ${s.platz}.` : "", s.platz_gegner ? `Gegner ${s.platz_gegner}.` : ""].filter(Boolean).join(" · "))}</span>${s.einordnung ? `<span class="pillzeile">${einordnungPille(s.einordnung)}</span>` : ""}</div><span style="color:var(--chev);display:flex">${ic(offen ? "chevunten" : "chev", 18)}</span></button>
      ${offen ? `<div class="aufklapp-inhalt spielgross" style="padding:10px 14px 12px">${spielGross(s, false)}</div>` : ""}</div>`;
  }).join("");

  // Mannschaften kompakt: Liga, Platz, Punkte, letzte 3 Spiele
  const saison = SB().aktuelle_saison;
  const teams = SB().mannschaften.map((x) => ({ ...x, tp: tabellenPlatz(saison, x.nr) })).filter((x) => x.tp);
  const mannschaften = teams.map((x, i) => `<button class="zeile" data-go="#/spiele/mannschaften/${x.nr}">${streifen(teamFarbe(x.nr))}
    <div class="haupt"><span class="titel fett">${esc(vereinsTeam(x.nr))}</span><span class="unter">${esc(x.tp.liga)} · ${esc(x.team)}</span></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px"><span style="font-weight:700">${x.tp.platz}.<span class="gedimmt" style="font-weight:500;font-size:13px"> · ${x.tp.punkte ? x.tp.punkte.join(":") : ""}</span></span>${formKaestchen(formAusSpielen(x.nr, 3), true)}</div>${CHEV}</button>`).join("");

  const ergebnisse = (st.letzte_ergebnisse || []).slice(0, 3).map((e) => `<button class="zeile" data-go="#/spiel/${encodeURIComponent(e.key)}">${streifen(teamFarbe(e.mannschaft))}
    <div class="haupt"><span class="titel">${esc(teamName(e.mannschaft) || e.team)} ${e.heim ? "gegen" : "bei"} ${esc(e.gegner)}</span><span class="unter">${esc(wtDatum(e.datum))}${SB().spiele.find((s) => s.key === e.key)?.nur_ergebnis ? " · ohne Spielbericht" : ""}</span></div>
    ${pille(`${e.ergebnis[0]}:${e.ergebnis[1]}`, ergebnisArt(e.ergebnis))}${CHEV}</button>`).join("");

  const geb = (d.kalender?.termine || []).filter((x) => x.bereich === "Geburtstage" && tageBis(x.datum) >= 0 && tageBis(x.datum) <= 7);
  const neu = (d.vereinsleben || [])[0];
  const imVerein = geb.map((x) => `<div class="zeile kompakt">${pille(tageBis(x.datum) === 0 ? "heute" : tageBis(x.datum) === 1 ? "morgen" : wtDatum(x.datum), "rosa")}<span style="font-size:14px;flex:1">${esc(x.name || x.titel)}${x.alter ? ` wird ${x.alter}` : ""}</span></div>`).join("")
    + (neu ? `<button class="zeile" data-go="#/eintrag/${encodeURIComponent(neu.id)}"><div class="vorschau" ${neu.titelbild ? `data-bild="${esc(neu.titelbild)}" data-groesse="200"` : ""}></div>
      <div class="haupt"><span class="unter">Neu im Vereinsleben</span><span class="titel">${esc(neu.titel)}</span><span class="unter">${esc(wtDatum(neu.datum))}${neu.bilder?.length ? ` · ${neu.bilder.length} Bilder` : ""}</span></div>${CHEV}</button>` : "");

  const kopfGanz = `<header class="kopf start-kopf">
    <div class="kopf-zeile" style="gap:14px"><img class="wappen nur-handy" src="wappen.png" alt="Wappen TTV Werragrund 08">
      <div style="display:flex;flex-direction:column;flex:1;min-width:0"><span class="vereinsname">${esc(m.verein_kurz)}</span><span class="gedimmt" style="font-size:14px">${esc(gruss())} · ${esc(WT[heute().getDay()])} ${heute().getDate()}. ${esc(MONATE[heute().getMonth()])}</span></div></div>
    ${kopfStand(true)}</header>`;
  const links = `${abschnitt("Die nächsten 7 Tage", "Kalender", "#/kalender")}${siebenTage(spiele)}
    ${abschnitt("Nächstes Spiel")}${gross}
    ${danach ? `${abschnitt("Danach", "Alle Spiele", "#/spiele")}<div class="karte dicht">${danach}</div>` : ""}`;
  const rechts = `${mannschaften ? `${abschnitt("Mannschaften")}<div class="karte dicht">${mannschaften}</div>` : ""}
    ${abschnitt("Letzte Ergebnisse", "Alle", "#/spiele")}<div class="karte dicht">${ergebnisse || `<div class="zeile"><span class="leer">Noch keine Ergebnisse.</span></div>`}</div>
    ${imVerein ? `${abschnitt("Im Verein")}<div class="karte dicht">${imVerein}</div>` : ""}`;
  return {
    titel: "Start", kopfGanz,
    inhalt: `${kacheln}<div class="start-raster"><div class="spalte">${links}</div><div class="spalte">${rechts}</div></div>`,
  };
};
// ===================================================================================================== Formanalyse
// Aus dem Spielplan von mytischtennis.de (vom PC berechnet: spielbetrieb.ligen_analyse, start.naechste_spiele[].analyse)
const FORM_ART = { S: "gruen", U: "gelb", N: "rot" };
function formPunkte(liste) {
  return liste && liste.length ? `<span class="form" aria-label="Form ${esc(liste.join(" "))}">${liste.map((x) => `<span class="f ${FORM_ART[x] || ""}">${esc(x)}</span>`).join("")}</span>`
    : `<span class="klein gedimmt">noch keine Spiele</span>`;
}
function bilanzKurz(b) { return b && b.begegnungen ? `${b.s}-${b.u}-${b.n} · ${b.punkte[0]}:${b.punkte[1]} Punkte` : "noch keine Spiele"; }
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
  const a = ansicht("mitglieder", { filter: "", team: "", suche: "" });
  const q = norm(a.suche), monat = heute().getMonth() + 1;
  return (S.daten.mitglieder || []).filter((m) =>
    (!a.filter || (a.filter === "aktiv" && m.aktiv) || (a.filter === "passiv" && !m.aktiv) || (a.filter === "offen" && beitragOffen(m))
      || (a.filter === "geburtstag" && m.geb && Number(m.geb.slice(5, 7)) === monat))
    && (!a.team || (a.team === "jugend" ? m.alter != null && m.alter < 18 : String(m.mannschaft?.mannschaft || "") === a.team))
    && (!q || norm(`${m.vorname} ${m.nachname} ${m.nachname} ${m.ort} ${m.telefon || ""} ${m.email || ""}`).includes(q)));
}
function beitragOffen(m) { return istVorstand() && m.beitrag && ["offen", "teilweise"].includes(m.beitrag.status); }
function geburtstagBald(m) {
  if (!m.geb) return null;
  const t = heute(); let g = new Date(t.getFullYear(), Number(m.geb.slice(5, 7)) - 1, Number(m.geb.slice(8, 10)));
  if (g < t) g = new Date(t.getFullYear() + 1, g.getMonth(), g.getDate());
  const tage = Math.round((g - t) / 86400000);
  return tage <= 14 ? { tage, alter: g.getFullYear() - Number(m.geb.slice(0, 4)), iso: isoTag(g) } : null;
}
function mitgliedUnter(m) {
  const teil = [];
  if (m.mannschaft) teil.push(teamName(m.mannschaft.mannschaft) + (m.mannschaft.platz ? ` · ${m.mannschaft.mannschaft}.${m.mannschaft.platz}` : ""));
  else teil.push(m.aktiv ? "aktiv" : "passiv");
  if (m.qttr?.wert) teil.push(`Q-TTR ${m.qttr.wert}`); else if (m.ort) teil.push(m.ort);
  return teil.join(" · ");
}
TEILE.mitgliederliste = () => {
  const liste = mitgliederGefiltert();
  const gewaehlt = route().seite === "mitglied" ? route().param[0] : null;
  return liste.map((m) => {
    const gb = geburtstagBald(m);
    const rechts = beitragOffen(m) ? pille(`offen ${eur((m.beitrag.soll || 0) - (m.beitrag.bezahlt || 0)).replace(",00", "")}`, "rot")
      : gb ? pille(gb.tage === 0 ? "heute Geburtstag" : gb.tage === 1 ? "morgen Geburtstag" : `wird ${gb.alter} · ${dmy(gb.iso, false)}`, "rosa") : "";
    return `<button class="zeile ${gewaehlt === `${m.nachname}|${m.vorname}` ? "ausgewaehlt" : ""}" data-go="#/mitglied/${mitgliedId(m)}">${avatar(m.vorname, m.nachname)}
    <div class="haupt"><span class="titel"><b>${esc(m.nachname)}</b>, ${esc(m.vorname)}</span><span class="unter">${m.mannschaft ? `<i class="punkt-farbe" style="background:${esc(teamFarbe(m.mannschaft.mannschaft))}"></i>` : ""}${esc(mitgliedUnter(m))}</span></div>${rechts}</button>`;
  }).join("") || `<div class="zeile"><span class="leer">Niemand gefunden.</span></div>`;
};
function mitgliederKopf() {
  const a = ansicht("mitglieder", { filter: "", team: "", suche: "" });
  const alle = S.daten.mitglieder || [];
  const teams = [...new Set(alle.map((m) => m.mannschaft?.mannschaft).filter(Boolean))].sort();
  const zahl = (f) => alle.filter(f).length;
  return `${suchfeld("mitglieder", "suche", "Name, Ort oder Telefon", "mitgliederliste")}
    ${chips("mitglieder", "team", [["", `Alle ${alle.length}`], ...teams.map((n) => [String(n), `${teamName(n)} ${zahl((m) => m.mannschaft?.mannschaft === n)}`]), ...(zahl((m) => m.alter != null && m.alter < 18) ? [["jugend", `Jugend ${zahl((m) => m.alter != null && m.alter < 18)}`]] : [])], a.team)}`;
}
function mitgliederKacheln() {
  const a = ansicht("mitglieder", { filter: "", team: "", suche: "" });
  const alle = S.daten.mitglieder || [], k = S.daten.start?.mitglieder || {};
  const monat = heute().getMonth() + 1;
  const offen = alle.filter(beitragOffen);
  const summe = offen.reduce((s, m) => s + (m.beitrag.soll || 0) - (m.beitrag.bezahlt || 0), 0);
  const geb = alle.filter((m) => m.geb && Number(m.geb.slice(5, 7)) === monat);
  return `<div class="kachelreihe vier">
    ${filterKachel("mitglieder", "filter", "aktiv", a.filter, { titel: "Aktiv", wert: k.aktiv ?? alle.filter((m) => m.aktiv).length, unter: k.jugend ? `davon ${k.jugend} Jugend` : "spielen mit" })}
    ${filterKachel("mitglieder", "filter", "passiv", a.filter, { titel: "Passiv", wert: k.passiv ?? alle.filter((m) => !m.aktiv).length, unter: k.vorjahr ? `Vorjahr ${k.vorjahr} gesamt` : "", farbe: "#6b7280" })}
    ${istVorstand() ? filterKachel("mitglieder", "filter", "offen", a.filter, { titel: "Beitrag offen", wert: offen.length, unter: offen.length ? `${eur(summe)} offen` : "alle bezahlt", farbe: "#c2571a", wertArt: offen.length ? "rot" : "" }) : ""}
    ${filterKachel("mitglieder", "filter", "geburtstag", a.filter, { titel: "Geburtstage", wert: geb.length, unter: `im ${MONATE[monat - 1]}`, farbe: "#c0397a" })}</div>`;
}
SEITEN.mitglieder = () => {
  const k = S.daten.start?.mitglieder || {};
  return {
    titel: "Mitglieder", rechts: `${k.gesamt ?? ""} · Ø ${k.durchschnittsalter != null ? String(Math.round(k.durchschnittsalter)) : "–"} Jahre`, kopf: mitgliederKopf(),
    inhalt: `${mitgliederKacheln()}<div class="zweispaltig"><div class="karte dicht liste-spalte" data-teil-ziel="mitgliederliste">${TEILE.mitgliederliste()}</div>
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
// ===================================================================================================== Kalender (Monat | Liste wie am PC)
// Legende = Filter: Mannschaften in ihren Farben, sonst die Bereiche. Ausgeblendetes steht in ansicht.aus (durch | getrennt).
function kalSchluessel(x) { return x.spiel && x.mannschaft ? `M${x.mannschaft}` : x.bereich; }
function kalLegende(alle, a) {
  const eintraege = new Map();
  for (const x of alle) {
    const k = kalSchluessel(x);
    if (!eintraege.has(k)) eintraege.set(k, { k, name: x.spiel && x.mannschaft ? teamName(x.mannschaft) : x.bereich, farbe: x.farbe || S.daten.kalender?.bereiche?.[x.bereich] || "#6b7280" });
  }
  if ((S.daten.organisation?.wochenplan || []).length && !eintraege.has("Halle und Training")) eintraege.set("Halle und Training", { k: "Halle und Training", name: "Halle und Training", farbe: S.daten.kalender?.bereiche?.["Halle und Training"] || "#6b7280" });
  const reihenfolge = (e) => (e.k.startsWith("M") ? "0" + e.k : e.k === "Geburtstage" ? "9" : "5" + e.name);
  const aus = new Set((a.aus || "").split("|").filter(Boolean));
  return `<div class="chips legende">${[...eintraege.values()].sort((x, y) => reihenfolge(x).localeCompare(reihenfolge(y))).map((e) =>
    `<button class="chip ${aus.has(e.k) ? "aus" : ""}" data-akt="kalLegende" data-wert="${esc(e.k)}"><i style="background:${esc(e.farbe)}"></i>${esc(e.name.replace("Halle und Training", "Training"))}</button>`).join("")}</div>`;
}
AKTIONEN.kalLegende = (el) => {
  const a = ansicht("kalender"); const aus = new Set((a.aus || "").split("|").filter(Boolean));
  aus.has(el.dataset.wert) ? aus.delete(el.dataset.wert) : aus.add(el.dataset.wert);
  a.aus = [...aus].join("|"); zeige();
};
AKTIONEN.kalMonat = (el) => {
  const a = ansicht("kalender"); const [j, m] = a.monat.split("-").map(Number);
  const d = new Date(j, m - 1 + Number(el.dataset.wert), 1);
  a.monat = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; a.tag = isoTag(d); zeige();
};
AKTIONEN.kalHeute = () => { const a = ansicht("kalender"); const t = heute(); a.monat = isoTag(t).slice(0, 7); a.tag = isoTag(t); a.ansicht = "monat"; zeige(); };
function kwVon(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - j) / 86400000 + 1) / 7); }
function kalTermineAm(iso, sichtbar) {
  return tagesEintraege(iso).filter((e) => e.art === "training" ? sichtbar("Halle und Training") : sichtbar(kalSchluessel(e.t)));
}
function kalEintragZeile(e) {
  if (e.art === "training") return `<div class="zeile kompakt"><span class="uhr">${esc(e.z.von)}</span>${streifen(e.farbe)}<div class="haupt"><span class="titel">Training${e.z.gruppe ? " · " + esc(e.z.gruppe) : ""}</span><span class="unter">bis ${esc(e.z.bis)} · ${esc(e.z.ort_name)}</span></div></div>`;
  const x = e.t, tg = tageBis(x.datum);
  const p = x.frist ? (x.status === "erledigt" ? pille("erledigt", "gruen") : tg < 0 ? pille("überfällig", "rot") : pille(tg === 0 ? "heute" : `in ${tg} Tagen`, "gelb")) : "";
  const s = x.spiel ? kommendeSpiele().find((y) => y.datum === x.datum && y.mannschaft === x.mannschaft) : null;
  const unter = [x.ort ? x.ort.split(",")[0] : "", x.spiel ? "" : x.bereich, x.text && !x.spiel && !x.abo ? x.text : ""].filter(Boolean).join(" · ");
  return `<div class="zeile kompakt"><span class="uhr">${esc(x.uhrzeit || (x.frist ? "Frist" : ""))}</span>${streifen(x.farbe)}<div class="haupt"><span class="titel">${x.frist ? "⚑ " : ""}${esc(x.titel)}</span>${unter ? `<span class="unter">${esc(unter)}</span>` : ""}</div>${p || (s ? einordnungPille(s.einordnung) : "")}</div>`;
}
SEITEN.kalender = ([vorfilter]) => {
  const t = heute();
  const a = ansicht("kalender", { ansicht: "monat", monat: isoTag(t).slice(0, 7), tag: isoTag(t), aus: "Geburtstage", art: "alles", suche: "", vergangene: "" });
  if (vorfilter && a._vor !== vorfilter) { a._vor = vorfilter; if (vorfilter === "fristen") { a.ansicht = "liste"; a.art = "offen"; } }
  const alle = S.daten.kalender?.termine || [];
  const aus = new Set((a.aus || "").split("|").filter(Boolean));
  const sichtbar = (k) => !aus.has(k);
  const kopf = `${segmente("kalender", "ansicht", [["monat", "Monat"], ["liste", "Liste"]], a.ansicht)}${kalLegende(alle, a)}`;
  const rechts = `<button class="knopf klein" data-akt="kalHeute">Heute</button>`;
  return { titel: "Kalender", rechts, kopf, inhalt: a.ansicht === "liste" ? kalListe(a) : kalMonat(a, sichtbar) };
};
function kalMonat(a, sichtbar) {
  const [j, m] = a.monat.split("-").map(Number);
  const erster = new Date(j, m - 1, 1);
  const start = new Date(j, m - 1, 1 - wochentagNr(erster));
  const tHeute = isoTag(heute());
  if (!a.tag || a.tag.slice(0, 7) !== a.monat) a.tag = tHeute.slice(0, 7) === a.monat ? tHeute : isoTag(erster);
  let wochen = "";
  for (let w = 0; w < 6; w++) {
    const wStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * w);
    if (w > 0 && wStart.getMonth() !== m - 1) break;
    let zellen = `<span class="kw">${kwVon(wStart)}</span>`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + i), iso = isoTag(d);
      const im = d.getMonth() === m - 1;
      const e = im ? kalTermineAm(iso, sichtbar) : [];
      const farben = [...new Set(e.filter((x) => x.art !== "frist").map((x) => x.farbe))].slice(0, 3);
      const frist = e.some((x) => x.art === "frist" && x.t.status !== "erledigt");
      zellen += `<button class="mz ${im ? "" : "fremd"} ${i >= 5 ? "we" : ""} ${iso === tHeute ? "heute" : ""} ${iso === a.tag ? "gewaehlt" : ""}" ${im ? `data-akt="setze" data-feld="kalender.tag" data-wert="${iso}"` : "disabled"} aria-label="${dmy(iso)}">
        <span class="nr">${d.getDate()}</span><span class="striche">${farben.map((f) => `<i style="background:${esc(f)}"></i>`).join("")}</span>${frist ? `<span class="fl"></span>` : ""}</button>`;
    }
    wochen += `<div class="mw">${zellen}</div>`;
  }
  const blatt = `<div class="karte dicht monatsblatt">
    <div class="mb-kopf"><button class="pfeil" data-akt="kalMonat" data-wert="-1" aria-label="Voriger Monat">${ic("zurueck", 20)}</button><b>${MONATE[m - 1]} ${j}</b><button class="pfeil" data-akt="kalMonat" data-wert="1" aria-label="Nächster Monat">${ic("chev", 20)}</button></div>
    <div class="mw kopfzeile"><span class="kw">KW</span>${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((x) => `<span>${x}</span>`).join("")}</div>${wochen}</div>`;
  const dT = datum(a.tag);
  const tagE = kalTermineAm(a.tag, sichtbar);
  const tagKarte = `<div class="karte dicht"><span class="tag-titel">${esc(WT_LANG[dT.getDay()])}, ${dT.getDate()}. ${esc(MONATE[dT.getMonth()])}</span>${tagE.map(kalEintragZeile).join("") || `<div class="zeile kompakt"><span class="leer">Nichts eingetragen.</span></div>`}</div>`;
  const fr = offeneFristen(30);
  const fristKarte = `<div class="karte dicht"><div class="karte-titel" style="padding:12px 14px 8px"><h2>⚑ Fristen – nächste 30 Tage</h2><a data-akt="kalFristen">Alle ›</a></div>
    ${fr.slice(0, 5).map((x) => { const tg = tageBis(x.datum); return `<div class="zeile kompakt"><span class="kasten" aria-hidden="true"></span><div class="haupt"><span class="titel">${esc(x.titel)}</span><span class="unter">${esc(wtDatum(x.datum))} · ${esc(x.bereich)}</span></div>${pille(tg < 0 ? "überfällig" : tg === 0 ? "heute" : `in ${tg} Tagen`, tg < 0 ? "rot" : tg <= 14 ? "gelb" : "")}</div>`; }).join("") || `<div class="zeile kompakt"><span class="leer">Keine offenen Fristen.</span></div>`}</div>`;
  return `<div class="kal-raster"><div class="spalte">${blatt}</div><div class="spalte">${tagKarte}${fristKarte}</div></div>
    <span class="hinweis">Abhaken geht am PC – die App zeigt den Stand vom ${esc(relZeit(S.daten.meta.erzeugt))}.</span>`;
}
AKTIONEN.kalFristen = () => { const a = ansicht("kalender"); a.ansicht = "liste"; a.art = "offen"; zeige(); };
function kalListe(a) {
  return `${suchfeld("kalender", "suche", "Termine durchsuchen", "kalliste")}
    ${segmente("kalender", "art", [["alles", "Alles"], ["fristen", "Fristen"], ["offen", "Offen"]], a.art)}
    <div style="display:flex;flex-direction:column;gap:12px" data-teil-ziel="kalliste">${TEILE.kalliste()}</div>
    <button class="knopf" data-akt="umschalten" data-feld="kalender.vergangene" data-wert="1">${a.vergangene ? "Kommende Termine zeigen" : "Vergangene Termine zeigen"}</button>
    <span class="hinweis">Termine, Fristen, Spiele aus den Kalender-Abos, Training aus dem Wochenplan und Geburtstage – wie im Vereinskalender am PC. Legende antippen blendet aus.</span>`;
}
TEILE.kalliste = () => {
  const a = ansicht("kalender"), alle = S.daten.kalender?.termine || [];
  const aus = new Set((a.aus || "").split("|").filter(Boolean)), sichtbar = (k) => !aus.has(k);
  const t = heute(), tIso = isoTag(t), q = norm(a.suche);
  const passtArt = (x) => a.art === "fristen" ? x.frist : a.art === "offen" ? x.frist && x.status !== "erledigt" : true;
  const ueberfaellig = (x) => x.frist && x.status !== "erledigt" && x.datum < tIso;
  let liste = alle.filter((x) => sichtbar(kalSchluessel(x)) && passtArt(x) && (!q || norm(`${x.titel} ${x.text} ${x.ort} ${x.bereich}`).includes(q)));
  liste = a.vergangene ? liste.filter((x) => x.datum < tIso && !ueberfaellig(x)).reverse() : liste.filter((x) => x.datum >= tIso || (x.bis && x.bis >= tIso) || ueberfaellig(x));
  // Gruppen: Überfällig, Diese Woche, Nächste Woche, danach je Monat
  const sonntag = isoPlus(tIso, 6 - wochentagNr(t)), sonntag2 = isoPlus(sonntag, 7);
  const gruppe = (x) => a.vergangene ? `${MONATE[datum(x.datum).getMonth()]} ${datum(x.datum).getFullYear()}`
    : ueberfaellig(x) ? "Überfällig" : x.datum <= sonntag ? "Diese Woche" : x.datum <= sonntag2 ? "Nächste Woche" : `${MONATE[datum(x.datum).getMonth()]} ${datum(x.datum).getFullYear()}`;
  const gruppen = [];
  for (const x of liste) { const g = gruppe(x); let gr = gruppen.find((y) => y.g === g); if (!gr) gruppen.push((gr = { g, l: [] })); gr.l.push(x); }
  const zeile = (x, ersterDesTages) => {
    const tg = tageBis(x.datum);
    const p = x.frist ? (x.status === "erledigt" ? pille("erledigt", "gruen") : tg < 0 ? pille(`${-tg} Tag${tg === -1 ? "" : "e"} drüber`, "rot") : tg <= 30 ? pille(tg === 0 ? "heute" : tg === 1 ? "morgen" : `in ${tg} Tagen`, tg <= 14 ? "gelb" : "") : "")
      : tg === 0 ? pille("heute", "blau") : tg === 1 ? pille("morgen", "blau") : "";
    const unter = [x.uhrzeit, x.ort ? x.ort.split(",")[0] : "", x.spiel ? teamName(x.mannschaft) : x.bereich].filter(Boolean).join(" · ");
    return `<div class="zeile">${ersterDesTages ? datumsblock(x.datum) : `<div class="datumsblock"></div>`}${streifen(x.farbe)}<div class="haupt"><span class="titel">${x.frist ? "⚑ " : ""}${esc(x.titel)}</span><span class="unter">${esc(unter)}${x.bis && x.bis !== x.datum ? ` · bis ${dmy(x.bis, false)}` : ""}</span></div>${p}</div>`;
  };
  const html = gruppen.map(({ g, l }) => `<div class="monat ${g === "Überfällig" ? "rot" : ""}">${esc(g)}</div><div class="karte dicht">${l.map((x, i) => zeile(x, i === 0 || l[i - 1].datum !== x.datum)).join("")}</div>`).join("");
  return html || `<div class="karte"><span class="leer">${a.vergangene ? "Keine vergangenen Termine." : "Nichts gefunden."}</span></div>`;
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
SEITEN.spiele = ([tabParam, teamParam]) => {
  const a = spieleAnsicht();
  if (tabParam && a._vor !== `${tabParam}|${teamParam || ""}`) { a._vor = `${tabParam}|${teamParam || ""}`; a.tab = tabParam; if (teamParam) a.team = teamParam; }
  if (!["spiele", "mannschaften", "saisons"].includes(a.tab)) a.tab = a.tab === "bilanzen" ? "saisons" : a.tab === "tabellen" || a.tab === "aufstellung" ? "mannschaften" : "spiele";
  const tabs = [["spiele", "Spiele"], ["mannschaften", "Mannschaften"], ["saisons", "Saisons"]];
  const inhalt = { spiele: tabSpiele, mannschaften: tabMannschaften, saisons: tabSaisons }[a.tab](a);
  return {
    titel: "Spielbetrieb", rechts: saisonKnopf(a, a.tab === "saisons", a.tab !== "mannschaften"),
    kopf: segmente("spiele", "tab", tabs, a.tab),
    inhalt,
  };
};
function spieleAnsicht() {
  const sb = SB();
  return ansicht("spiele", { tab: "spiele", saison: sb.aktuelle_saison || sb.saisons[0] || "*", hs: "", team: "" });
}
function teamsDerSaison(saison) {
  const nr = new Set(SB().spiele.filter((s) => s.saison === saison).map((s) => s.mannschaft));
  for (const l of SB().tabellen?.[saison]?.ligen || []) for (const z of l.zeilen) if (z.eigen && z.mannschaft) nr.add(z.mannschaft);
  return [...nr].filter(Boolean).sort((x, y) => x - y);
}
function spielZeile(s, kommend) {
  const ergebnis = s.ergebnis ? pille(`${s.ergebnis[0]}:${s.ergebnis[1]}`, ergebnisArt(s.ergebnis)) : "";
  const unter = kommend
    ? [s.uhrzeit, s.team, s.platz ? `wir ${s.platz}.` : "", s.platz_gegner ? `Gegner ${s.platz_gegner}.` : ""]
    : [teamName(s.mannschaft), s.liga, s.kampflos ? "kampflos" : s.nur_ergebnis ? "ohne Spielbericht" : ""];
  const ziel = kommend ? `data-akt="umschaltenWert" data-feld="spiele.offen|${esc(s.key)}"` : `data-go="#/spiel/${encodeURIComponent(s.key)}"`;
  const offen = kommend && ansicht("spiele").offen === s.key;
  return `<div class="eintrag"><button class="zeile" ${ziel}>${datumsblock(s.datum)}${streifen(teamFarbe(s.mannschaft))}
    <div class="haupt"><span class="titel">${s.heim ? "gegen" : "bei"} ${esc(s.gegner)}</span><span class="unter">${esc(unter.filter(Boolean).join(" · "))}</span>${kommend && s.einordnung ? `<span class="pillzeile">${einordnungPille(s.einordnung)}</span>` : ""}</div>
    ${ergebnis}${kommend ? `<span style="color:var(--chev);display:flex">${ic(offen ? "chevunten" : "chev", 18)}</span>` : CHEV}</button>
    ${offen ? `<div class="aufklapp-inhalt spielgross" style="padding:10px 14px 12px">${spielGross(s, false)}</div>` : ""}</div>`;
}
function tabSpiele(a) {
  const sb = SB();
  const saison = a.saison === "*" ? sb.aktuelle_saison : a.saison;
  const teams = teamsDerSaison(saison);
  if (a.team && !teams.includes(Number(a.team))) a.team = "";
  const passt = (s) => !a.team || String(s.mannschaft) === String(a.team);
  const gespielt = spieleFilter({ saison, hs: a.hs }).filter((s) => s.ergebnis && passt(s)).sort((x, y) => y.datum.localeCompare(x.datum));
  const kommend = saison === sb.aktuelle_saison && (!a.hs || a.hs === sb.aktuelle_halbserie) ? kommendeSpiele().filter(passt) : [];
  const zaehl = (nr) => spieleFilter({ saison, hs: a.hs }).filter((s) => s.mannschaft === nr && s.ergebnis).length + (saison === sb.aktuelle_saison ? kommendeSpiele().filter((s) => s.mannschaft === nr).length : 0);
  const chipsHtml = teams.length > 1 ? `<div class="chips">${[["", `Alle`], ...teams.map((nr) => [String(nr), teamName(nr)])].map(([w, t]) =>
    `<button class="chip ${w === (a.team || "") ? "aktiv" : ""}" data-akt="setze" data-feld="spiele.team" data-wert="${w}">${esc(t)} <span class="anz">${w ? zaehl(Number(w)) : ""}</span></button>`).join("")}</div>` : "";
  const heuteLinie = `<div class="heute-linie"><span></span><b>HEUTE · ${esc(WT[heute().getDay()].toUpperCase())} ${dmy(isoTag(heute()), false)}</b><span></span></div>`;
  return `${chipsHtml}
    ${kommend.length ? `${abschnitt("Demnächst")}<div class="karte dicht">${kommend.slice(0, a.alleKommend ? 99 : 6).map((s) => spielZeile(s, true)).join("")}
      ${kommend.length > 6 ? `<button class="zeile" data-akt="umschalten" data-feld="spiele.alleKommend" data-wert="1" style="justify-content:center;color:var(--accent);font-weight:600">${a.alleKommend ? "Weniger zeigen" : `Alle ${kommend.length} Spiele zeigen`}</button>` : ""}</div>${heuteLinie}` : ""}
    ${abschnitt("Gespielt")}<div class="karte dicht">${gespielt.map((s) => spielZeile(s, false)).join("") || `<div class="zeile"><span class="leer">Für diese Auswahl sind keine Ergebnisse da.</span></div>`}</div>`;
}
function tabMannschaften(a) {
  const sb = SB();
  const saison = a.saison === "*" ? sb.aktuelle_saison : a.saison;
  const teams = teamsDerSaison(saison);
  if (!teams.length) return `<div class="karte"><span class="leer">Für ${esc(saison)} gibt es keine Mannschaften.</span></div>`;
  const nr = teams.includes(Number(a.team)) ? Number(a.team) : teams[0];
  const chipsHtml = teams.length > 1 ? `<div class="chips">${teams.map((n) => `<button class="chip ${n === nr ? "aktiv" : ""}" data-akt="setze" data-feld="spiele.team" data-wert="${n}">${esc(teamName(n))}</button>`).join("")}</div>` : "";
  const tp = tabellenPlatz(saison, nr);
  const spiele = spieleFilter({ saison, team: nr }).filter((s) => s.ergebnis);
  const mb = mannschaftsbilanz(spiele)[0];
  const form = saison === sb.aktuelle_saison ? formAusSpielen(nr, 5) : [];
  const farbe = teamFarbe(nr);
  const kacheln = `<div class="kachelreihe drei">
    ${kachel2({ titel: "Platz", wert: tp ? `${tp.platz}.` : "–", unter: tp ? `von ${tp.von}` : "keine Tabelle", farbe })}
    ${kachel2({ titel: "Punkte", wert: tp?.punkte ? tp.punkte.join(":") : mb ? `${mb.pk[0]}:${mb.pk[1]}` : "–", unter: mb ? `Spiele ${mb.sp[0]}:${mb.sp[1]}` : "", farbe })}
    ${kachel2({ titel: "Bilanz", wert: mb ? `${mb.s}-${mb.u}-${mb.n}` : "–", unter: mb ? `${mb.beg} Begegnungen` : "", farbe })}</div>`;
  // Tabelle der Liga (mit Form, Heim, Auswärts aus dem Spielplan)
  const art = a.tart || "tabelle";
  const t = sb.tabellen?.[saison];
  const liga = tp && t ? t.ligen.find((l) => l.liga === tp.liga) : null;
  const an = tp ? ligaAnalyse(tp.liga, saison) : null;
  let tabelle = "";
  if (an && art !== "tabelle") {
    tabelle = `<table class="tabelle"><thead><tr><th>Pl.</th><th>Mannschaft</th><th>Sp.</th><th>Punkte</th><th>Form</th></tr></thead><tbody>
      ${(an.tabellen[art] || []).map((z) => `<tr class="${z.eigen ? "eigen" : ""}" data-go="#/form/${encodeURIComponent(an.liga)}/${encodeURIComponent(z.name)}" style="cursor:pointer"><td>${z.platz}</td><td>${esc(z.name)}</td><td>${z.begegnungen}</td><td>${z.punkte.join(":")}</td><td class="formzelle">${formKaestchen(z.form.slice(-5))}</td></tr>`).join("")}</tbody></table>`;
  } else if (liga) {
    tabelle = `<table class="tabelle ${an ? "mitform" : ""}"><thead><tr><th>Pl.</th><th>Mannschaft</th><th>Sp.</th><th>Spiele</th><th>Punkte</th>${an ? "<th>Form</th>" : ""}</tr></thead><tbody>
      ${liga.zeilen.map((z) => { const tn = an && Object.keys(an.teams).find((n) => norm(n) === norm(z.name) || (z.eigen && an.eigene[n] === z.mannschaft));
        return `<tr class="${z.eigen ? "eigen" : ""}"${tn ? ` data-go="#/form/${encodeURIComponent(an.liga)}/${encodeURIComponent(tn)}" style="cursor:pointer"` : ""}><td>${z.platz ?? ""}</td><td>${esc(z.name)} ${z.zeichen && ZEICHEN[z.zeichen] ? `<span class="zeichen" style="color:${z.zeichen.includes("ab") || z.zeichen === "zurueck" ? "var(--p-rot)" : "var(--p-gruen)"}">${ZEICHEN[z.zeichen]}</span>` : ""}</td><td>${z.beg ?? ""}</td><td>${z.spiele ? z.spiele.join(":") : ""}</td><td>${z.punkte ? z.punkte.join(":") : ""}</td>${an ? `<td class="formzelle">${tn ? formKaestchen(an.teams[tn].form.slice(-5)) : ""}</td>` : ""}</tr>`; }).join("")}</tbody></table>`;
  }
  const tabKarte = tabelle ? `<div class="karte" style="padding:12px 4px 4px;gap:10px"><div style="padding:0 10px;display:flex;align-items:baseline;gap:8px"><h2 style="font-size:16px;flex:1">${esc(tp.liga)}</h2><span class="klein gedimmt">Stand ${esc(dmy(t?.stand || ""))}</span></div>
    ${an ? `<div style="padding:0 10px">${segmente("spiele", "tart", [["tabelle", "Tabelle"], ["form", "Form"], ["heim", "Heim"], ["auswaerts", "Auswärts"]], art)}</div>` : ""}${tabelle}</div>
    <span class="hinweis">▲ Aufstieg · △ Relegation · ▼ Abstieg${an ? " · Mannschaft antippen: Formanalyse" : ""}</span>` : `<div class="karte"><span class="leer">Für ${esc(teamName(nr))} ist in ${esc(saison)} keine Tabelle eingelesen.</span></div>`;
  // Aufstellung mit Einzelbilanz der Halbserie
  let hs = a.hs || (saison === sb.aktuelle_saison ? sb.aktuelle_halbserie : (sb.aufstellungen?.[`${saison}|Rückrunde`] ? "Rückrunde" : "Vorrunde"));
  const auf = (sb.aufstellungen?.[`${saison}|${hs}`] || []).find((x) => x.nr === nr);
  const bil = spielerbilanz(spieleFilter({ saison, hs, team: nr }));
  const aufKarte = auf ? `${abschnitt(`Aufstellung ${hs}`)}<div class="karte dicht">${auf.spieler.map((p, i) => { const b = bil.find((x) => x.pid === p.pid);
      return `<button class="zeile" ${sb.spieler[p.pid] ? `data-go="#/spieler/${encodeURIComponent(p.pid)}"` : ""}><span class="rangkreis" style="--k:${farbe}">${i + 1}</span>
      <div class="haupt"><span class="titel">${esc(p.vorname)} ${esc(p.nachname)}</span><span class="unter">${[(Array.isArray(p.qttr) ? p.qttr[0] : p.qttr) ? `Q-TTR ${Array.isArray(p.qttr) ? p.qttr[0] : p.qttr}` : "", p.status, p.bem].filter(Boolean).map(esc).join(" · ")}</span></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end"><span class="fett zahl">${b ? `${b.e[0]}:${b.e[1]}` : "–"}</span><span class="klein gedimmt">${b ? `Doppel ${b.d[0]}:${b.d[1]}` : ""}</span></div></button>`; }).join("")}</div>
    ${auf.fuehrer ? `<span class="hinweis">Mannschaftsführer: ${esc(auf.fuehrer)} · rechts Einzel- und Doppelbilanz ${esc(hs)}</span>` : ""}` : "";
  const eigen = an && Object.keys(an.eigene || {}).find((n) => an.eigene[n] === nr);
  return `${chipsHtml}${kacheln}${form.length ? `<div class="formzeile"><span class="klein gedimmt">Form</span>${formKaestchen(form)}</div>` : ""}${tabKarte}${aufKarte}
    <div style="display:flex;flex-direction:column;gap:6px;padding:0 4px">${eigen ? `<a class="link" data-go="#/form/${encodeURIComponent(an.liga)}/${encodeURIComponent(eigen)}">Formanalyse ${esc(teamName(nr))} ›</a>` : ""}
    <a class="link" data-akt="gegnerTeam" data-wert="${nr}">Bilanz gegen alle Gegner ›</a></div>`;
}
function tabSaisons(a) {
  // Platzierungen je Saison (wie am PC „Saisons & Gegner“), darunter die Bilanzen der gewählten Saison
  const nachSaison = {};
  for (const x of SB().saison_ergebnisse || []) (nachSaison[x.saison] = nachSaison[x.saison] || []).push(x);
  const saisons = Object.keys(nachSaison).sort().reverse();
  const zeigeAlle = a.alleSaisons;
  const platz = saisons.length ? `<div class="karte dicht">${(zeigeAlle ? saisons : saisons.slice(0, 4)).map((s) => `<div class="gruppe-kopf">${esc(s)}<span>${nachSaison[s].length} Mannschaft${nachSaison[s].length === 1 ? "" : "en"}</span></div>
    ${nachSaison[s].sort((x, y) => (x.mannschaft || 9) - (y.mannschaft || 9)).map((x) => `<div class="zeile kompakt">${streifen(teamFarbe(x.mannschaft))}<div class="haupt"><span class="titel">${esc(vereinsTeam(x.mannschaft))}</span><span class="unter">${esc(x.liga)}${x.bemerkung ? " · " + esc(x.bemerkung) : ""}</span></div>
      <span class="fett">${x.platz ? x.platz + "." : "–"}<span class="gedimmt" style="font-weight:500"> / ${x.von || "–"}</span></span>${x.zeichen && ZEICHEN[x.zeichen] ? `<span class="zeichen" style="color:${x.zeichen.includes("ab") ? "var(--p-rot)" : "var(--p-gruen)"}">${ZEICHEN[x.zeichen]}</span>` : ""}</div>`).join("")}`).join("")}
    ${saisons.length > 4 ? `<button class="zeile" data-akt="umschalten" data-feld="spiele.alleSaisons" data-wert="1" style="justify-content:center;color:var(--accent);font-weight:600">${zeigeAlle ? "Weniger zeigen" : `Alle ${saisons.length} Saisons zeigen`}</button>` : ""}</div>` : "";
  return `${platz ? `${abschnitt("Platzierungen")}${platz}` : ""}${abschnitt(`Bilanzen${a.saison === "*" ? " aller Saisons" : " " + a.saison}`)}${tabBilanzen(a)}`;
}
const ZEICHEN = { auf: "▲", rel_auf: "△", ab: "▼", rel_ab: "▽", zurueck: "✕" };
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
        ${menuZeile("#/organisation", "org", "blau", "Organisation", "Versammlungen, Vorstand und Satzung, Finanzamt, Training und Hallen")}
        ${menuZeile("#/vereinsleben", "leben", "rosa", "Vereinsleben", "Feiern, Turniere und Aktionen mit Bildern")}
        ${menuZeile("#/dokumente", "dok", "gelb", "Dokumente", "Alle Dateien nach Bereich, Spielberichte nach Saison")}</div>
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
  const tabs = [["versammlungen", "Versammlungen"], ["vorstand", "Vorstand und Satzung"], ["finanzamt", "Finanzamt"], ["training", "Training und Hallen"], ["berichte", "Tätigkeitsberichte"]];
  const a = ansicht("organisation", { tab: "versammlungen", suche: "" });
  if (tabParam && a._vor !== tabParam) { a._vor = tabParam; a.tab = tabParam; }
  if (!tabs.some(([w]) => w === a.tab)) a.tab = "versammlungen";
  const t = heute(), tIso = isoTag(t);
  const vers = o.versammlungen || [];
  const e = o.eckdaten || {};
  const wochenplan = o.wochenplan || [];
  // Kacheln wie am PC (k_org): nächste Versammlung, Amtszeit, Gemeinnützigkeit, Hallenantrag
  const kommendeV = vers.filter((v) => v.datum >= tIso).sort((x, y) => x.datum.localeCompare(y.datum));
  const versTermin = kommendeV[0] || (S.daten.kalender?.termine || []).filter((x) => x.bereich === "Versammlungen" && x.datum >= tIso)[0];
  const amtsAnteil = o.letzte_wahl && o.amtszeit_ende ? (t - datum(o.letzte_wahl)) / (datum(o.amtszeit_ende) - datum(o.letzte_wahl)) * 100 : null;
  const naechsteAntrag = (o.orte || []).map((x) => x.antrag_frist).filter(Boolean).map((f) => { const [tg, mo] = f.split(".").map(Number); let d = new Date(t.getFullYear(), mo - 1, tg); if (d < t) d = new Date(t.getFullYear() + 1, mo - 1, tg); return d; }).sort((x, y) => x - y)[0];
  const kacheln = `<div class="kachelreihe vier">
    ${kachel2({ titel: "Nächste Versammlung", wert: versTermin ? dmy(versTermin.datum, false) : "–", unter: versTermin ? `${versTermin.titel} ›` : "keine geplant", farbe: "#1e8a4a", ziel: versTermin?.id ? `#/versammlung/${encodeURIComponent(versTermin.id)}` : "#/kalender" })}
    ${kachel2({ titel: "Amtszeit Vorstand", wert: o.amtszeit_ende ? `bis ${String(o.amtszeit_ende).slice(5, 7)}/${String(o.amtszeit_ende).slice(0, 4)}` : "–", unter: o.letzte_wahl ? `gewählt ${dmy(o.letzte_wahl)}` : "", farbe: "#7a4fc0", balken: amtsAnteil, ziel: "#/organisation/vorstand" })}
    ${kachel2({ titel: "Gemeinnützig", wert: e.gemeinnuetzig_bis ? `bis ${String(e.gemeinnuetzig_bis).slice(0, 4)}` : "–", unter: o.bescheid?.vom ? `Bescheid ${dmy(o.bescheid.vom)} ›` : "", farbe: e.gemeinnuetzig_bis && tageBis(e.gemeinnuetzig_bis) < 90 ? "#c08a00" : "#1e8a4a", ziel: "#/organisation/finanzamt" })}
    ${kachel2({ titel: "Hallenantrag", wert: naechsteAntrag ? dmy(isoTag(naechsteAntrag), false) : "–", unter: naechsteAntrag ? `in ${Math.round((naechsteAntrag - t) / 86400000)} Tagen ›` : "keine Frist", farbe: "#6b7280", ziel: "#/organisation/training" })}</div>`;

  // Versammlungen als Liste mit Stand der Unterlagen
  const stand = (v) => {
    const dok = (r) => (v.dokumente || []).some((d) => d.rolle === r);
    const teile = [["Einladung", dok("einladung") || (v.tagesordnung || []).length > 0], ["Protokoll", !!v.protokoll || dok("protokoll")]];
    if (v.datum < tIso) teile.push(["Kurzfassung", (v.kurzfassung || []).length > 0]);
    return `<span class="unterlagen">${teile.map(([n, ok]) => `<span class="${ok ? "ok" : ""}"><i>${ok ? "✓" : ""}</i>${n}</span>`).join("")}</span>`;
  };
  const versZeile = (v) => {
    const d = datum(v.datum), kommend = v.datum >= tIso;
    const rechts = kommend ? (v.einladung_bis ? pille(`Einladung bis ${dmy(v.einladung_bis, false)}`, tageBis(v.einladung_bis) < 0 ? "rot" : "gelb") : pille(`in ${tageBis(v.datum)} Tagen`, "blau"))
      : !v.protokoll && !(v.dokumente || []).some((x) => x.rolle === "protokoll") ? pille("Protokoll fehlt", "gelb") : "";
    const unter = [v.uhrzeit, v.ort ? v.ort.split(",")[0] : "", (v.beschluesse || []).length ? `${v.beschluesse.length} Beschlüsse` : "", v.protokoll?.stimmberechtigt ? `${v.protokoll.stimmberechtigt} stimmberechtigt` : ""].filter(Boolean).join(" · ");
    return `<button class="zeile" data-go="#/versammlung/${encodeURIComponent(v.id)}">${datumsblock(v.datum)}<div class="haupt"><span class="titel">${esc(v.titel)}</span><span class="unter">${esc(unter)}</span>${stand(v)}</div>${rechts}${CHEV}</button>`;
  };
  TEILE.versliste = () => {
    const q = norm(ansicht("organisation").suche);
    const passt = (v) => !q || norm(`${v.titel} ${v.art} ${(v.tagesordnung || []).join(" ")} ${(v.kurzfassung || []).join(" ")} ${(v.beschluesse || []).map((b) => b.antrag).join(" ")}`).includes(q);
    const kommend = kommendeV.filter(passt), gruppen = {};
    for (const v of vers.filter((x) => x.datum < tIso && passt(x))) (gruppen[v.datum.slice(0, 4)] = gruppen[v.datum.slice(0, 4)] || []).push(v);
    const geplant = (S.daten.kalender?.termine || []).filter((x) => x.bereich === "Versammlungen" && x.datum >= tIso && !kommend.some((v) => v.datum === x.datum) && passt({ titel: x.titel, art: "" }));
    return (kommend.length || geplant.length ? `${abschnitt("Demnächst")}<div class="karte dicht">${kommend.map(versZeile).join("")}
        ${geplant.map((x) => `<button class="zeile" data-go="#/kalender">${datumsblock(x.datum)}<div class="haupt"><span class="titel">${esc(x.titel)}</span><span class="unter">${esc([x.uhrzeit, x.ort, "nur im Kalender"].filter(Boolean).join(" · "))}</span></div>${pille(`in ${tageBis(x.datum)} Tagen`, "blau")}</button>`).join("")}</div>` : "")
      + Object.keys(gruppen).sort().reverse().map((j) => `${abschnitt(j)}<div class="karte dicht">${gruppen[j].map(versZeile).join("")}</div>`).join("")
      || `<div class="karte"><span class="leer">Keine Versammlung gefunden.</span></div>`;
  };
  const versammlungen = `${suchfeld("organisation", "suche", "Versammlungen und Beschlüsse durchsuchen", "versliste")}<div style="display:flex;flex-direction:column;gap:12px" data-teil-ziel="versliste">${TEILE.versliste()}</div>`;

  // Vorstand und Satzung: Ämter als Karten
  const vorstandJetzt = (o.vorstand || []).filter((x) => x.im_amt);
  const frueher = (o.vorstand || []).filter((x) => !x.im_amt);
  const amtKarte = (x) => `<div class="amt">${avatar(x.name.split(" ")[0], x.name.split(" ").slice(-1)[0])}<div style="display:flex;flex-direction:column;min-width:0"><span class="klein gedimmt">${esc(x.amt)}</span><span style="font-weight:600">${esc(x.name)}</span><span class="klein gedimmt">${x.im_amt ? `seit ${dmy(x.von)}` : `${dmy(x.von)} – ${dmy(x.bis)}`}</span></div></div>`;
  const vorstand = `<div class="karte">${kartenTitel("Vorstand")}${o.letzte_wahl ? `<span class="klein gedimmt" style="margin-top:-6px">gewählt am ${dmy(o.letzte_wahl)}${o.amtszeit_ende ? ` · Amtszeit bis ${dmy(o.amtszeit_ende)}` : ""}${o.wahlperiode_jahre ? ` (${esc(o.wahlperiode_jahre)} Jahre)` : ""}</span>` : ""}
      ${amtsAnteil != null ? `<span class="kbalken gross"><span style="width:${Math.max(0, Math.min(100, amtsAnteil))}%"></span></span>` : ""}
      <div class="aemter">${vorstandJetzt.map(amtKarte).join("") || `<span class="leer">Kein Vorstand erfasst.</span>`}</div></div>
    ${frueher.length ? `<div class="karte">${kartenTitel("Frühere Amtszeiten")}<div class="aemter">${frueher.map(amtKarte).join("")}</div></div>` : ""}
    <div class="karte">${kartenTitel("Satzung und Ordnungen")}${(o.fassungen || []).map((f) => f.dokument ? pdfZeile({ ...f.dokument, titel: `${f.ordnung} (${f.status})` }, "ab " + dmy(f.gueltig_ab)) : `<span class="klein">${esc(f.ordnung)} ab ${dmy(f.gueltig_ab)} (${esc(f.status)})</span>`).join("") || `<span class="leer">Keine Fassung erfasst.</span>`}</div>
    ${e.kuendigungsfrist || e.satzungszweck ? `<div class="karte dicht">${[["Zweck", e.satzungszweck], ["Kündigung", e.kuendigungsfrist], ["Beitrag fällig", e.beitragsfaelligkeit], ["Versammlung", e.mitgliederversammlung]].filter(([, w]) => w).map(([k, w]) => `<div class="kv"><span class="k">${k}</span><span class="w">${esc(w)}</span></div>`).join("")}</div>` : ""}`;

  // Finanzamt und Register
  const finanzamt = `<div class="karte dicht">
    ${e.gemeinnuetzig_bis ? `<div class="kv"><span class="k">Gemeinnützig</span><span class="w">${pille("bis " + dmy(e.gemeinnuetzig_bis), tageBis(e.gemeinnuetzig_bis) < 90 ? "gelb" : "gruen")}</span></div>` : ""}
    ${o.bescheid?.vom ? `<div class="kv"><span class="k">Freistellungsbescheid</span><span class="w">vom ${dmy(o.bescheid.vom)}${o.bescheid.jahre ? ` für ${esc(o.bescheid.jahre)}` : ""}</span></div>` : ""}
    ${e.steuererklaerung_bis ? `<div class="kv"><span class="k">Steuererklärung</span><span class="w">fällig bis ${dmy(e.steuererklaerung_bis)}</span></div>` : ""}
    ${e.finanzamt ? `<div class="kv"><span class="k">Finanzamt</span><span class="w">${esc(e.finanzamt)}${e.steuernummer ? " · St.-Nr. " + esc(e.steuernummer) : ""}</span></div>` : ""}
    ${e.registernummer ? `<div class="kv"><span class="k">Vereinsregister</span><span class="w">${esc(e.registergericht)} · ${esc(e.registernummer)}</span></div>` : ""}</div>
    ${(() => { const akten = [...(o.bescheid?.dokument ? [{ ...o.bescheid.dokument, datum: o.bescheid.vom }] : []), ...(o.akten || [])].filter((x, i, l) => l.findIndex((y) => y.datei === x.datei) === i).sort((x, y) => (y.datum || "").localeCompare(x.datum || ""));
      const gr = {}; for (const d of akten) (gr[(d.datum || "").slice(0, 4) || "ohne Datum"] = gr[(d.datum || "").slice(0, 4) || "ohne Datum"] || []).push(d);
      return Object.keys(gr).sort().reverse().map((j) => `${abschnitt(j)}<div class="karte" style="gap:0;padding-top:4px;padding-bottom:4px">${gr[j].map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("")}</div>`).join(""); })()}`;

  // Training und Hallen: Wochenplan, darunter Hallen
  const hallenFarben = ["blau", "tuerkis", "lila", "gelb"];
  const hallenIndex = {}; (o.orte || []).forEach((x, i) => (hallenIndex[x.id] = hallenFarben[i % hallenFarben.length]));
  const training = `<div class="karte">${kartenTitel("Wochenplan")}
    ${wochenplan.map((z) => `<div style="display:flex;gap:10px;align-items:center"><span style="width:26px;font-size:13px;font-weight:700" class="gedimmt">${esc(z.tag_text.slice(0, 2))}</span>
      <div class="pille ${hallenIndex[z.ort] || ""}" style="flex:1;justify-content:flex-start;gap:10px;padding:8px 10px;border-radius:10px;font-size:13px"><b style="width:92px">${esc(z.von)}–${esc(z.bis)}</b><span style="font-weight:500;white-space:normal">${esc(z.ort_name)}${z.gruppe ? " · " + esc(z.gruppe) : ""}</span></div></div>`).join("") || `<span class="leer">Kein Wochenplan erfasst.</span>`}</div>
    ${abschnitt("Hallen und Spiellokale")}
    ${(o.orte || []).map((x) => `<div class="karte" style="gap:4px"><span style="font-size:15px;font-weight:600">${esc(x.name)}</span>
      <span class="klein gedimmt">${[x.art, x.tische ? x.tische + " Tische" : "", x.adresse].filter(Boolean).map(esc).join(" · ")}</span>
      ${x.antrag_frist ? `<span class="klein">Hallenantrag bis ${esc(x.antrag_frist)}</span>` : ""}
      ${x.schluessel ? `<span class="klein gedimmt">Schlüssel: ${esc(x.schluessel)}</span>` : ""}
      ${x.ansprechpartner ? `<span class="klein gedimmt">Ansprechpartner: ${esc(x.ansprechpartner)}${x.telefon ? ` · <a href="tel:${esc(x.telefon)}">${esc(x.telefon)}</a>` : ""}</span>` : ""}
      ${(x.dokumente || []).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("")}</div>`).join("") || `<div class="karte"><span class="leer">Keine Hallen erfasst.</span></div>`}
    ${(o.antraege || []).length ? `${abschnitt("Hallenanträge")}<div class="karte" style="gap:0">${o.antraege.map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("")}</div>` : ""}`;
  const berichte = `<div class="karte">${(o.taetigkeitsberichte || []).map((d) => pdfZeile(d, d.datum ? dmy(d.datum) : "PDF")).join("") || `<span class="leer">Noch keine Tätigkeitsberichte abgelegt.</span>`}</div>`;
  const inhalt = { versammlungen, vorstand, finanzamt, training, berichte }[a.tab];
  return {
    titel: "Organisation", zurueck: ["#/mehr", "Mehr"],
    kopf: chips("organisation", "tab", tabs, a.tab),
    inhalt: `${kacheln}${inhalt}`,
  };
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
    titel: v.titel, zurueck: ["#/organisation/versammlungen", "Organisation"],
    kopf: `<span class="klein gedimmt" style="margin-top:-6px;font-size:13px">${esc(WT_LANG[datum(v.datum).getDay()])}, ${dmy(v.datum)}${v.uhrzeit ? " · " + esc(v.uhrzeit) : ""}${v.ort ? " · " + esc(v.ort) : ""}</span>
      ${segmente("versammlung", "tab", [["kurz", "Kurzfassung"], ["einladung", "Einladung"], ["protokoll", "Protokoll"]], a.tab)}`,
    inhalt,
  };
};

// ===================================================================================================== Vereinsleben (Chronik | Galerie wie am PC)
AKTIONEN.lebenJahr = (el) => {
  const jahre = lebenJahre(); const a = ansicht("vereinsleben");
  const i = jahre.indexOf(a.jahr) - Number(el.dataset.wert); // Jahre absteigend: ‹ = älter
  if (i >= 0 && i < jahre.length) { a.jahr = jahre[i]; zeige(); }
};
function lebenJahre() { return [...new Set((S.daten.vereinsleben || []).map((e) => e.datum.slice(0, 4)))].sort().reverse(); }
SEITEN.vereinsleben = () => {
  const alle = S.daten.vereinsleben || [];
  const jahre = lebenJahre();
  const a = ansicht("vereinsleben", { jahr: jahre[0] || String(heute().getFullYear()), ansicht: "galerie", art: "" });
  if (!jahre.includes(a.jahr) && jahre.length) a.jahr = jahre[0];
  const imJahr = alle.filter((e) => e.datum.slice(0, 4) === a.jahr);
  const arten = [...new Set(imJahr.map((e) => e.art).filter(Boolean))];
  if (a.art && !arten.includes(a.art)) a.art = "";
  const liste = imJahr.filter((e) => !a.art || e.art === a.art);
  const bilder = imJahr.reduce((s, e) => s + (e.bilder?.length || 0), 0), videos = imJahr.reduce((s, e) => s + (e.videos?.length || 0), 0);
  const teilnahmen = imJahr.reduce((s, e) => s + (e.teilnehmer?.length || 0) + (e.gaeste || 0), 0);
  const farbe = S.daten.kalender?.bereiche?.Vereinsleben || "#6b8e23";
  const kacheln = `<div class="kachelreihe drei">
    ${kachel2({ titel: "Einträge", wert: imJahr.length, unter: a.jahr, farbe })}
    ${kachel2({ titel: "Bilder", wert: bilder, unter: videos ? `+ ${videos} Video${videos > 1 ? "s" : ""}` : "", farbe })}
    ${kachel2({ titel: "Teilnahmen", wert: teilnahmen, unter: imJahr.length ? `Ø ${Math.round(teilnahmen / imJahr.length)} je Eintrag` : "", farbe })}</div>`;
  const i = jahre.indexOf(a.jahr);
  const jahrWahl = `<div class="jahrwahl"><button class="pfeil" data-akt="lebenJahr" data-wert="-1" ${i >= jahre.length - 1 ? "disabled" : ""} aria-label="Voriges Jahr">${ic("zurueck", 20)}</button><b>${esc(a.jahr)}</b><button class="pfeil" data-akt="lebenJahr" data-wert="1" ${i <= 0 ? "disabled" : ""} aria-label="Nächstes Jahr">${ic("chev", 20)}</button>
    <span style="flex:1"></span><div style="width:190px">${segmente("vereinsleben", "ansicht", [["chronik", "Chronik"], ["galerie", "Galerie"]], a.ansicht)}</div></div>`;
  const artChips = arten.length > 1 ? chips("vereinsleben", "art", [["", "Alle"], ...arten.map((x) => [x, x])], a.art) : "";
  const kachelBild = (e, gross) => `<button class="galkachel ${gross ? "gross" : ""}" data-go="#/eintrag/${encodeURIComponent(e.id)}">
    <span class="galbild" ${e.titelbild ? `data-bild="${esc(e.titelbild)}" data-groesse="${gross ? 900 : 500}"` : ""}>${ic("bild", 26)}</span>
    <span class="galart">${pille(e.art || "Eintrag")}</span>
    <span class="galtext"><b>${esc(e.titel)}</b><span>${esc(wtDatum(e.datum))}${e.bilder?.length ? ` · ${e.bilder.length} Bilder` : ""}${e.teilnehmer?.length ? ` · ${e.teilnehmer.length} dabei` : ""}</span></span></button>`;
  let inhalt;
  if (a.ansicht === "galerie") {
    const mitBild = liste.filter((e) => e.titelbild || e.bilder?.length), ohne = liste.filter((e) => !(e.titelbild || e.bilder?.length));
    const [erst, ...rest] = mitBild;
    inhalt = `${erst ? kachelBild(erst, true) : ""}${rest.length ? `<div class="galraster">${rest.map((e) => kachelBild(e, false)).join("")}</div>` : ""}
      ${ohne.length ? `<div class="karte dicht">${ohne.map((e) => `<button class="zeile" data-go="#/eintrag/${encodeURIComponent(e.id)}"><div class="vorschau leer-bild"></div><div class="haupt"><span class="titel">${esc(e.titel)}</span><span class="unter">${esc(wtDatum(e.datum))} · noch keine Bilder</span></div>${CHEV}</button>`).join("")}</div>` : ""}
      ${S.quelle !== "google" && mitBild.length ? `<span class="hinweis">Bilder gibt es nur mit Google-Anmeldung.</span>` : ""}`;
  } else {
    inhalt = `<div class="karte dicht">${liste.map((e) => `<button class="zeile" data-go="#/eintrag/${encodeURIComponent(e.id)}"><div class="vorschau ${e.titelbild ? "" : "leer-bild"}" ${e.titelbild ? `data-bild="${esc(e.titelbild)}" data-groesse="200"` : ""}></div>
      <div class="haupt"><span class="titel">${esc(e.titel)}</span><span class="unter">${esc(wtDatum(e.datum))} · ${esc(e.art)}${e.bilder?.length ? ` · ${e.bilder.length} Bilder` : ""}${e.teilnehmer?.length ? ` · ${e.teilnehmer.length} dabei` : ""}</span>${e.bericht ? `<span class="unter zweizeilig">${esc(e.bericht)}</span>` : ""}</div>${CHEV}</button>`).join("")}</div>`;
  }
  return {
    titel: "Vereinsleben", zurueck: ["#/mehr", "Mehr"], kopf: jahrWahl,
    inhalt: liste.length || imJahr.length ? `${kacheln}${artChips}${inhalt}` : `<div class="karte"><span class="leer">Noch keine Einträge.</span></div>`,
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
function alleDokumente() {
  const docs = (S.daten.dokumente || []).map((d) => ({ ...d, gruppe: (d.datum || "").slice(0, 4) || "ohne Datum" }));
  for (const s of SB().spiele) {
    if (!s.pdf) continue;
    docs.push({ titel: `${teamName(s.mannschaft)} ${s.heim ? "gegen" : "bei"} ${s.gegner}`, bereich: "Spielberichte", datum: s.datum, datei: s.pdf, gruppe: `Saison ${s.saison}`,
      unter: `${wtDatum(s.datum)} · ${s.liga}${s.ergebnis ? ` · ${s.ergebnis[0]}:${s.ergebnis[1]}` : ""}`, ergebnis: s.ergebnis });
  }
  return docs;
}
function dateiTyp(pfad) {
  const e = String(pfad || "").split(".").pop().toLowerCase();
  return { pdf: ["PDF", "rot"], jpg: ["JPG", "tuerkis"], jpeg: ["JPG", "tuerkis"], png: ["PNG", "tuerkis"], heic: ["HEIC", "tuerkis"], docx: ["DOC", "blau"], doc: ["DOC", "blau"], xlsx: ["XLS", "gruen"], mp4: ["MP4", "lila"], mov: ["MOV", "lila"] }[e] || [e.toUpperCase().slice(0, 4) || "DATEI", ""];
}
function dokZeile(d) {
  const [typ, farbe] = dateiTyp(d.datei);
  return `<button class="zeile" data-datei="${esc(d.datei || "")}"><span class="dateityp ${farbe}">${esc(typ)}</span>
    <div class="haupt"><span class="titel">${esc(d.titel)}</span><span class="unter">${esc(d.unter || [d.datum ? wtDatum(d.datum) + " " + d.datum.slice(0, 4) : "", d.bereich].filter(Boolean).join(" · "))}</span></div>
    ${d.ergebnis ? pille(`${d.ergebnis[0]}:${d.ergebnis[1]}`, ergebnisArt(d.ergebnis)) : d.datum && tageBis(d.datum) >= -30 && tageBis(d.datum) <= 0 ? pille("neu", "blau") : ""}</button>`;
}
TEILE.dokumente = () => {
  const a = ansicht("dokumente", { suche: "", bereich: "" });
  const q = norm(a.suche);
  const docs = alleDokumente().filter((d) => (!a.bereich || d.bereich === a.bereich) && (!q || norm(`${d.titel} ${d.bereich} ${d.datum} ${d.unter || ""}`).includes(q)));
  if (!docs.length) return `<div class="karte"><span class="leer">Nichts gefunden.</span></div>`;
  docs.sort((x, y) => (y.datum || "").localeCompare(x.datum || ""));
  if (!a.bereich && !q) {
    // Alle: Karte je Bereich mit Anzahl und den neuesten drei Dateien
    const nach = {}; for (const d of docs) (nach[d.bereich] = nach[d.bereich] || []).push(d);
    return `${abschnitt("Zuletzt hinzugefügt")}<div class="karte dicht">${docs.slice(0, 5).map(dokZeile).join("")}</div>`
      + Object.entries(nach).sort((x, y) => y[1].length - x[1].length).map(([b, l]) => `<div class="karte dicht"><button class="gruppe-kopf knopflos" data-akt="setze" data-feld="dokumente.bereich" data-wert="${esc(b)}">${esc(b)}<span>${l.length} Datei${l.length === 1 ? "" : "en"}</span><span style="flex:1"></span><span class="link">Alle ›</span></button>${l.slice(0, 3).map(dokZeile).join("")}</div>`).join("");
  }
  const gruppen = []; for (const d of docs) { let g = gruppen.find((x) => x.g === d.gruppe); if (!g) gruppen.push((g = { g: d.gruppe, l: [] })); g.l.push(d); }
  return gruppen.map(({ g, l }) => `${abschnitt(`${g} · ${l.length}`)}<div class="karte dicht">${l.map(dokZeile).join("")}</div>`).join("");
};
SEITEN.dokumente = () => {
  const a = ansicht("dokumente", { suche: "", bereich: "" });
  const docs = alleDokumente(), zahl = {};
  for (const d of docs) zahl[d.bereich] = (zahl[d.bereich] || 0) + 1;
  const neu = docs.filter((d) => d.datum && tageBis(d.datum) >= -30 && tageBis(d.datum) <= 0).length;
  return {
    titel: "Dokumente", zurueck: ["#/mehr", "Mehr"], rechts: `${docs.length} Dateien${neu ? ` · ${neu} neu` : ""}`,
    kopf: `${suchfeld("dokumente", "suche", "Titel, Mitglied oder Gegner", "dokumente")}
      ${chips("dokumente", "bereich", [["", `Alle ${docs.length}`], ...Object.entries(zahl).sort((x, y) => y[1] - x[1]).map(([b, n]) => [b, `${b} ${n}`])], a.bereich)}`,
    inhalt: `<div style="display:flex;flex-direction:column;gap:12px" data-teil-ziel="dokumente">${TEILE.dokumente()}</div>
      <span class="hinweis">Antippen öffnet die Datei in Google Drive.</span>`,
  };
};
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
