"""Tabellen automatisch von mytischtennis.de holen (seit 4.1.0; reines Rechenmodul ohne Oberfläche).

Je Mannschaft wird einmal der Link zur Tabelle ihrer Liga hinterlegt, z. B.
https://www.mytischtennis.de/click-tt/TTTV/26--27/ligen/Kreisoberliga_1/gruppe/521293/tabelle/gesamt
Das Programm ruft die Seiten höchstens einmal am Tag ab (beim Start oder über „Jetzt aktualisieren“) und speichert
das Ergebnis wie eine eingelesene Ergebnistabelle als Stand in spielbetrieb.json („tabellen“ → „staende“).

Die Seite liefert die Tabelle zweifach: als HTML-Tabelle und als eingebettete Daten
(window.__remixContext → loaderData → …tabelle… → data.league_table mit table_rank, team_name, team_id,
meetings_count, matches_won/lost, points_won/lost, rise_fall_state …). Gelesen werden zuerst die eingebetteten Daten
(unabhängig vom Aussehen der Seite), sonst die HTML-Tabelle.

Gespeichert wird in spielbetrieb.json unter tabellen["abruf"]:
  {"quellen": [{"url", "mannschaft" (Nr. oder None = automatisch)}], "zuletzt": ISO-Zeitpunkt,
   "ergebnis": {url: {"zeit", "liga", "fehler"}}}
"""

import html
import json
import re
import urllib.error
import urllib.request
from datetime import date, datetime

TIMEOUT = 20
_LINK = re.compile(r"^https?://(?:www\.)?mytischtennis\.de/click-?tt/[^?#]+/gruppe/\d+", re.I)
ZEICHEN = {"rise": "auf", "fall": "ab", "riseplayoff": "rel_auf", "fallplayoff": "rel_ab", "relegation": "rel_auf",
           "descent": "ab", "ascent": "auf"}
_ROEMISCH = {"II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}


class AbrufFehler(Exception):
    """Verständliche Fehlermeldung für den Nutzer."""


def link_pruefen(text):
    """Bereinigter Tabellen-Link oder AbrufFehler. Ein Link auf die Gruppe ohne „/tabelle/…“ bekommt
    „/tabelle/gesamt“ angehängt."""
    url = str(text or "").strip().strip("<>\"'")
    if url and not url.lower().startswith("http"):
        url = "https://" + url
    m = _LINK.match(url)
    if not m:
        raise AbrufFehler("Das ist kein Tabellen-Link von mytischtennis.de. Erwartet wird z. B. "
                          "https://www.mytischtennis.de/click-tt/TTTV/26--27/ligen/…/gruppe/521293/tabelle/gesamt")
    url = url.split("#")[0].split("?")[0].rstrip("/")
    if "/tabelle" not in url.lower():
        url = m.group(0) + "/tabelle/gesamt"
    return url


def lade_seite(url, timeout=TIMEOUT):
    """HTML der Seite. Löst AbrufFehler mit verständlichem Text aus."""
    anfrage = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/124.0 Safari/537.36 Vereinsdatenbank",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "de-DE,de;q=0.9"})
    try:
        with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
            roh = antwort.read(8_000_000)
            zeichensatz = antwort.headers.get_content_charset() or "utf-8"
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise AbrufFehler(f"mytischtennis.de lässt den Abruf gerade nicht zu (Fehler {e.code}). Später noch "
                              "einmal versuchen – oder die Tabelle wie bisher als PDF einlesen.") from None
        raise AbrufFehler(f"Der Server antwortet mit Fehler {e.code} ({e.reason}).") from None
    except urllib.error.URLError as e:
        raise AbrufFehler(f"Keine Verbindung ({e.reason}). Besteht eine Internetverbindung?") from None
    except (TimeoutError, OSError) as e:
        raise AbrufFehler(f"Der Abruf ist fehlgeschlagen ({e}).") from None
    return roh.decode(zeichensatz, errors="replace")


def _saison(text):
    """'26/27' oder '2026/27' oder '26--27' -> '2026/27'."""
    m = re.search(r"(\d{2,4})\s*(?:/|--|-)\s*(\d{2})", str(text or ""))
    if not m:
        return ""
    start = int(m.group(1))
    start = start + 2000 if start < 100 else start
    return f"{start}/{(start + 1) % 100:02d}"


def _zahl(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def _remix_daten(seite):
    """Die eingebetteten Seitendaten (window.__remixContext) oder None."""
    i = seite.find("window.__remixContext")
    if i < 0:
        return None
    start = seite.find("{", i)
    try:
        daten, _ende = json.JSONDecoder().raw_decode(seite[start:])
        return daten
    except ValueError:
        return None


def _aus_daten(daten):
    loader = (daten.get("state") or {}).get("loaderData") or {}
    tab = next((v for k, v in loader.items() if "tabelle" in k and isinstance(v, dict)), None)
    inhalt = (tab or {}).get("data") or {}
    zeilen = inhalt.get("league_table")
    if not isinstance(zeilen, list) or not zeilen:
        return None
    kopf = inhalt.get("head_infos") or next(
        ((v.get("data") or {}).get("head_infos") for v in loader.values()
         if isinstance(v, dict) and isinstance(v.get("data"), dict) and v["data"].get("head_infos")), {}) or {}
    ergebnis = []
    for z in zeilen:
        zustand = str(z.get("rise_fall_state") or "").replace("_", "").lower()
        zeichen = "zurueck" if z.get("is_excluded") else ZEICHEN.get(zustand, "")
        ergebnis.append({
            "platz": _zahl(z.get("table_rank")), "name": " ".join(str(z.get("team_name") or "").split()),
            "beg": _zahl(z.get("meetings_count")),
            "spiele": [_zahl(z.get("matches_won")) or 0, _zahl(z.get("matches_lost")) or 0],
            "punkte": [_zahl(z.get("points_won")) or 0, _zahl(z.get("points_lost")) or 0],
            "siege": _zahl(z.get("meetings_won")), "unentschieden": _zahl(z.get("meetings_tie")),
            "niederlagen": _zahl(z.get("meetings_lost")),
            "zeichen": zeichen, "team_id": str(z.get("team_id") or "")})
    return {"liga": " ".join(str(kopf.get("league_name") or "").split()), "saison": _saison(kopf.get("season")),
            "staffel": str(kopf.get("championship") or ""), "zeilen": ergebnis}


def _text(zelle):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", zelle)).split())


def _aus_html(seite):
    """Rückfall: die erste HTML-Tabelle mit den Spalten Mannschaft … Punkte."""
    for tabelle in re.findall(r"<table[\s\S]*?</table>", seite, re.I):
        reihen = re.findall(r"<tr[\s\S]*?</tr>", tabelle, re.I)
        if not reihen or "Mannschaft" not in _text(reihen[0]) or "Punkte" not in _text(reihen[0]):
            continue
        zeilen = []
        for r in reihen[1:]:
            zellen = re.findall(r"<td[\s\S]*?</td>", r, re.I)
            if len(zellen) < 9:
                continue
            werte = [_text(z) for z in zellen]
            spiele = re.findall(r"\d+", werte[6])
            punkte = re.findall(r"\d+", werte[8])
            if len(spiele) < 2 or len(punkte) < 2:
                continue
            klein = r.lower()
            zeichen = ("rel_auf" if "relegation" in klein and "auf" in klein else "rel_ab" if "relegation" in klein
                       else "auf" if "aufsteiger" in klein else "ab" if "absteiger" in klein else "")
            zeilen.append({"platz": _zahl(re.sub(r"\D", "", werte[0])), "name": werte[1], "beg": _zahl(werte[2]),
                           "spiele": [int(spiele[0]), int(spiele[1])], "punkte": [int(punkte[0]), int(punkte[1])],
                           "siege": _zahl(werte[3]), "unentschieden": _zahl(werte[4]), "niederlagen": _zahl(werte[5]),
                           "zeichen": zeichen, "team_id": ""})
        if zeilen:
            titel = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", seite, re.I)
            return {"liga": _text(titel.group(1)) if titel else "", "saison": "", "staffel": "", "zeilen": zeilen}
    return None


def lies_tabellenseite(seite, url=""):
    """{liga, saison, staffel, zeilen: [{platz, name, beg, spiele [a, b], punkte [a, b], siege, unentschieden,
    niederlagen, zeichen, team_id}]} oder AbrufFehler."""
    daten = _remix_daten(seite)
    tabelle = _aus_daten(daten) if daten else None
    tabelle = tabelle or _aus_html(seite)
    if not tabelle:
        raise AbrufFehler("Auf der Seite wurde keine Tabelle gefunden. Hat mytischtennis.de den Aufbau geändert? "
                          "Bis zur Anpassung bitte die Tabelle als PDF einlesen.")
    if not tabelle["saison"]:
        tabelle["saison"] = _saison(re.search(r"/(\d{2}--\d{2}|\d{2}-\d{2})/", url or "").group(1)
                                    if re.search(r"/(\d{2}--\d{2}|\d{2}-\d{2})/", url or "") else "")
    if not tabelle["saison"]:
        raise AbrufFehler("Die Saison der Tabelle ist nicht zu erkennen.")
    if not tabelle["liga"]:
        m = re.search(r"/ligen/([^/]+)/", url or "")
        tabelle["liga"] = m.group(1).replace("_", " ") if m else "Liga"
    return tabelle


def abrufen(quelle):
    """Lädt und liest eine Quelle (für einen Hintergrund-Thread: ändert nichts). (quelle, tabelle|None, fehler)."""
    try:
        return quelle, lies_tabellenseite(lade_seite(quelle["url"]), quelle["url"]), ""
    except AbrufFehler as e:
        return quelle, None, str(e)
    except Exception as e:  # noqa: BLE001 – ein Abruf darf nie das Programm stören
        return quelle, None, f"Unerwarteter Fehler: {e}"


# ----------------------------------------------------------------------------------------------- im Spielbetrieb
def abruf(sb):
    """Der Abruf-Teil in spielbetrieb.json (wird angelegt)."""
    a = sb.tabellen.setdefault("abruf", {})
    a.setdefault("quellen", [])
    a.setdefault("ergebnis", {})
    a.setdefault("zuletzt", "")
    return a


def quellen(sb):
    return list(abruf(sb)["quellen"])


def setze_quellen(sb, liste):
    """liste: [{"url", "mannschaft"}] – Links werden geprüft (AbrufFehler beim ersten ungültigen)."""
    neu, gesehen = [], set()
    for q in liste:
        url = link_pruefen(q.get("url"))
        if url in gesehen:
            continue
        gesehen.add(url)
        nr = q.get("mannschaft")
        neu.append({"url": url, "mannschaft": int(nr) if isinstance(nr, int) or str(nr or "").isdigit() else None})
    a = abruf(sb)
    a["quellen"] = neu
    a["ergebnis"] = {u: e for u, e in a["ergebnis"].items() if u in gesehen}


def faellig(sb, heute=None):
    """True, wenn Links hinterlegt sind und heute noch nicht abgerufen wurde."""
    a = sb.tabellen.get("abruf") or {}
    if not a.get("quellen"):
        return False
    try:
        zuletzt = datetime.fromisoformat(a.get("zuletzt") or "").date()
    except ValueError:
        return True
    return zuletzt < (heute or date.today())


def _norm(text):
    return re.sub(r"[^0-9a-z]", "", str(text or "").casefold())


def ist_eigen(name, verein):
    """Gehört die Zeile zum eigenen Verein? (Kennwort des Vereinsnamens, z. B. „Werragrund“)."""
    teile = [t for t in re.split(r"\s+", verein or "") if len(t) > 3 and not t.isdigit() and t.upper() != t]
    kenn = max(teile, key=len) if teile else (verein or "")
    return bool(kenn) and _norm(kenn) in _norm(name)


def voller_name(name, verein):
    """Eigene Mannschaft mit vollem Vereinsnamen: 'Werragrund II' -> 'TTV Werragrund 08 II' (mytischtennis.de
    kürzt den Namen). Fremde Mannschaften und Namen, die den Vereinsnamen schon enthalten, bleiben, wie sie sind."""
    name = " ".join(str(name or "").split())
    verein = re.sub(r"\s*e\.\s*V\.?\s*$", "", " ".join(str(verein or "").split()))  # ohne „e.V.“
    if not verein or not ist_eigen(name, verein) or _norm(verein) in _norm(name):
        return name
    m = re.search(r"\b(II|III|IV|V|VI|VII|VIII)\s*$", name)
    return f"{verein} {m.group(1)}" if m else verein


def begegnung_voll(titel, verein):
    """'TTC Sülzfeld 08 III – Werragrund' -> 'TTC Sülzfeld 08 III – TTV Werragrund 08'."""
    teile = re.split(r"(\s+[–-]\s+)", titel or "")
    if len(teile) != 3:
        return titel
    return voller_name(teile[0], verein) + teile[1] + voller_name(teile[2], verein)


def nummer_aus_name(name):
    """'Werragrund II' -> 2, 'Werragrund' -> 1."""
    m = re.search(r"\b(II|III|IV|V|VI|VII|VIII)\s*$", str(name or ""))
    return _ROEMISCH[m.group(1)] if m else 1


def namen_nachtragen(sb, verein):
    """Abgerufene Stände aus der ersten 4.1.0 (16.11.2026) trugen den gekürzten Namen („Werragrund“): auf den vollen
    Vereinsnamen setzen. True, wenn sich etwas geändert hat (dann speichern)."""
    geaendert = False
    for stand in sb.tabellen.get("staende", []):
        for liga in stand.get("ligen", []):
            if liga.get("quelle") != "mytischtennis":
                continue
            for z in liga.get("zeilen", []):
                if z.get("eigen"):
                    voll = voller_name(z.get("name"), verein)
                    if voll != z.get("name"):
                        z["name"], geaendert = voll, True
    return geaendert


def uebernehmen(sb, ergebnisse, verein, jetzt=None):
    """Trägt die Abrufe (Liste aus abrufen) in den Spielbetrieb ein: je Saison ein Stand mit dem heutigen Datum.
    Ligen eines älteren Stands derselben Saison (z. B. aus einem PDF) bleiben erhalten; gleichnamige werden ersetzt.
    Ändert sich nichts gegenüber dem neuesten Stand, entsteht kein neuer. Gibt {"neu": n, "unveraendert": n,
    "fehler": [(url, text)]} zurück."""
    jetzt = jetzt or datetime.now()
    a = abruf(sb)
    a["zuletzt"] = jetzt.replace(microsecond=0).isoformat()
    bericht = {"neu": 0, "unveraendert": 0, "fehler": []}
    je_saison = {}
    for quelle, tabelle, fehler in ergebnisse:
        a["ergebnis"][quelle["url"]] = {"zeit": a["zuletzt"], "liga": (tabelle or {}).get("liga", ""),
                                        "saison": (tabelle or {}).get("saison", ""), "fehler": fehler}
        if tabelle is None:
            bericht["fehler"].append((quelle["url"], fehler))
            continue
        zeilen = []
        for z in tabelle["zeilen"]:
            z = dict(z, eigen=ist_eigen(z["name"], verein))
            if z["eigen"]:
                z["name"] = voller_name(z["name"], verein)  # wie in den PDF-Tabellen: „TTV Werragrund 08 II“
                if quelle.get("mannschaft"):
                    z["mannschaft"] = quelle["mannschaft"]  # von Hand gewählt
                z["mannschaft_vorschlag"] = nummer_aus_name(z["name"])
            zeilen.append(z)
        je_saison.setdefault(tabelle["saison"], []).append({"liga": tabelle["liga"], "zeilen": zeilen,
                                                            "quelle": "mytischtennis", "url": quelle["url"]})
    for saison, ligen in je_saison.items():
        alt = sb.letzter_stand(saison)
        neu_ligen = [dict(liga) for liga in (alt or {}).get("ligen", [])]
        for liga in ligen:
            pos = next((i for i, x in enumerate(neu_ligen)
                        if x.get("url") == liga["url"] or _norm(x.get("liga")) == _norm(liga["liga"])), None)
            if pos is None:
                neu_ligen.append(liga)
            else:
                neu_ligen[pos] = liga
        if alt is not None and alt.get("ligen") == neu_ligen:
            bericht["unveraendert"] += 1
            continue
        art = sb.uebernimm_tabelle({"saison": saison, "erstellt": jetzt.date(), "ligen": neu_ligen}, pdf="")
        bericht["neu" if art in ("neu", "ersetzt") else "unveraendert"] += 1
    return bericht
