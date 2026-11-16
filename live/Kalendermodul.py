"""Vereinskalender (seit 4.0.0): alle wichtigen Termine und Fristen an einer Stelle (reines Rechenmodul).

Der Kalender sammelt die Termine, die das Programm ohnehin kennt, und ergänzt eigene Einträge:

* Versammlungen (versammlungen.json): die Versammlung selbst, „Einladung verschicken bis“ (Einladungsfrist aus den
  Einstellungen) und bei Mitgliederversammlungen „Anträge bis“ (Antragsfrist).
* Spielbetrieb (spielbetrieb.json): die eingelesenen Spiele mit Ergebnis.
* Organisation (organisation.json): Ende des Freistellungsbescheids, nächste Steuererklärung, Ende der Amtszeit des
  Vorstands, Ablauf von Trainerlizenzen, Hallenanträge (Frist je Halle, z. B. 10.05.), Hallensperrungen und Ferien,
  Beitragsfälligkeit laut Satzung („jährlich bis 31.03.“).
* Mitglieder: Geburtstage der aktuellen Mitglieder (runde Geburtstage hervorgehoben).
* Kalender-Abos (seit 4.0.0, z. B. die Spieltermine einer Mannschaft von mytischtennis.de): Das Programm lädt die
  .ics-Adresse regelmäßig neu; verschobene Spiele wandern so von selbst mit. Der letzte Stand liegt in
  kalender_abos.json (damit der Kalender auch ohne Internet etwas zeigt). Spiele, zu denen schon ein Spielbericht
  eingelesen ist, erscheinen nur einmal (mit Ergebnis, Ort aus dem Abo).
* Vereinsarbeit (seit 4.0.0): eigene Einträge im Bereich „Vereinsarbeit“ (z. B. Grillen auf dem Kürbisfest) mit
  einem Text, was gemacht wurde. Freigegebene Einträge (im_bericht) erscheinen im Tätigkeitsbericht des Jahres
  unter „Veranstaltungen und Aktionen“ (Kalender.vereinsarbeit, Organisationsmodul.sammle_berichtsdaten).
* Eigene Einträge (kalender.json): einmalig oder jedes Jahr, als Termin oder als Frist. Beim ersten Start legt das
  Programm übliche Fristen des Spielbetriebs an (Q-TTR-Stichtage, Mannschaftsmeldungen, LSB-Bestandsmeldung);
  die Daten der Meldungen bitte mit den Terminen des Verbands abgleichen.

kalender.json im Datenordner:

    {"format": 1, "eintraege": [{id, titel, datum, bis, uhrzeit, ort, bereich, frist, jaehrlich, notiz,
                                 bericht, im_bericht}],
     "erledigt": {Schlüssel eines Termins: Datum der Erledigung},
     "abos": [{id, name, url, bereich, aktiv, mannschaft (Nummer ab 1 oder 0 = keine)}],
     "einstellungen": {farben: {Bereich: "#rrggbb"}, mannschaftsfarben: {"1": "#rrggbb"}, nach_mannschaft,
                       geburtstage, erinnerung_tage, ansicht ("monat" | "liste")}}

kalender_abos.json (Zwischenspeicher der Abos, wird vom Programm geschrieben):

    {Abo-id: {"stand": "2026-11-15T10:20:00", "fehler": "", "ereignisse": [{schluessel, datum, uhrzeit, bis,
     ende_uhrzeit, titel, ort, text}]}}

Ein Termin (Ergebnis von Kalender.termine) ist ein dict:

    {schluessel, datum (date), bis (date oder None), uhrzeit, titel, text, ort, bereich, frist (bool),
     status ("" | "offen" | "bald" | "überfällig" | "erledigt" | "vorbei"), quelle, eigen (id oder None),
     ziel (Sprungziel für die Oberfläche oder None), automatisch (bool: Status ergibt sich aus den Daten)}

Ziele: ("versammlung", id) · ("spiel", key) · ("organisation", Reiter) · ("mitglied", (Nachname, Vorname)) · None.
"""

import json
import os
import re
import unicodedata
import urllib.request
import uuid
from datetime import date, datetime, timedelta

DATEI_FORMAT = 1

SPIELBETRIEB, VERSAMMLUNGEN, FINANZEN, ORGANISATION, HALLE, VEREINSARBEIT, VEREINSLEBEN, GEBURTSTAGE, SONSTIGES = (
    "Spielbetrieb", "Versammlungen", "Finanzen und Steuern", "Organisation", "Halle und Training", "Vereinsarbeit",
    "Vereinsleben", "Geburtstage", "Sonstiges")
BEREICHE = (SPIELBETRIEB, VERSAMMLUNGEN, FINANZEN, ORGANISATION, HALLE, VEREINSARBEIT, VEREINSLEBEN, GEBURTSTAGE,
            SONSTIGES)
# Bereiche für eigene Einträge und Abos („Vereinsleben“ kommt nur aus der Seite Vereinsleben)
EIGENE_BEREICHE = tuple(b for b in BEREICHE if b != VEREINSLEBEN)
# Grundfarben (Einstellungen → Kalender); daraus werden helle/dunkle Fassungen für Kennzeichen und Balken berechnet
STANDARD_FARBEN = {SPIELBETRIEB: "#2563a8", VERSAMMLUNGEN: "#1e8a4a", FINANZEN: "#c08a00", ORGANISATION: "#7a4fc0",
                   HALLE: "#6b7280", VEREINSARBEIT: "#a0522d", VEREINSLEBEN: "#6b8e23", GEBURTSTAGE: "#c0397a", SONSTIGES: "#1d8a88"}
MANNSCHAFTEN_HOECHSTENS = 8
ROEMISCH = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII")
STANDARD_MANNSCHAFTSFARBEN = {"1": "#2563a8", "2": "#d9622b", "3": "#1e8a4a", "4": "#7a4fc0", "5": "#c0397a",
                              "6": "#b8860b", "7": "#1d8a88", "8": "#6b7280"}
STANDARD_EINSTELLUNGEN = {"farben": {}, "mannschaftsfarben": {}, "nach_mannschaft": True, "geburtstage": True,
                          "erinnerung_tage": 7, "ansicht": "monat"}
ABO_ALTER_STUNDEN = 3  # so alt darf der Stand eines Abos werden, dann lädt das Programm es neu
ABO_TIMEOUT = 20       # Sekunden je Abruf

BALD_TAGE = 30        # so viele Tage vorher gilt eine Frist als „bald“
UEBERFAELLIG_TAGE = 30  # jährliche Fristen ohne Rückmeldung: nach so vielen Tagen nur noch „vorbei“
ANTRAG_FRIST = "10.05."
# Reiter der Seite Organisation (wie qt_organisation.UNTERREITER)
REITER_VERSAMMLUNGEN, REITER_SATZUNG, REITER_FINANZAMT, REITER_TRAINING = 0, 1, 2, 3

# Übliche Fristen, die beim ersten Start angelegt werden (danach frei änderbar oder löschbar)
STANDARD_EINTRAEGE = (
    {"id": "std-qttr-vr", "titel": "Q-TTR-Stichtag Vorrunde", "datum": "2026-05-11", "bereich": SPIELBETRIEB,
     "frist": False, "jaehrlich": True, "notiz": "Grundlage der Mannschaftsmeldung für die Vorrunde"},
    {"id": "std-qttr-rr", "titel": "Q-TTR-Stichtag Rückrunde", "datum": "2026-12-11", "bereich": SPIELBETRIEB,
     "frist": False, "jaehrlich": True, "notiz": "Grundlage der Mannschaftsmeldung für die Rückrunde"},
    {"id": "std-meldung-vr", "titel": "Mannschaftsmeldung Vorrunde", "datum": "2026-06-30", "bereich": SPIELBETRIEB,
     "frist": True, "jaehrlich": True,
     "notiz": "Meldeschluss in click-TT – Datum bitte mit dem Terminplan des Verbands abgleichen."},
    {"id": "std-meldung-rr", "titel": "Mannschaftsmeldung Rückrunde", "datum": "2026-12-20", "bereich": SPIELBETRIEB,
     "frist": True, "jaehrlich": True,
     "notiz": "Meldeschluss in click-TT – Datum bitte mit dem Terminplan des Verbands abgleichen."},
    {"id": "std-lsb", "titel": "LSB-Bestandsmeldung", "datum": "2027-01-31", "bereich": ORGANISATION,
     "frist": True, "jaehrlich": True,
     "notiz": "Mitgliederbestand zum 01.01. an den Landessportbund – Datum bitte prüfen. "
              "Zahlen: Mitglieder → LSB-Meldung."},
)


class KalenderFehler(ValueError):
    """Ungültige Eingabe (die Oberfläche zeigt den Text an)."""


# ======================================================================
# Hilfsfunktionen
# ======================================================================
def parse_datum(text, pflicht=False, name="Datum"):
    """„15.11.2026“ oder „2026-11-15“ -> ISO-Text; "" bei leer (wenn nicht Pflicht)."""
    t = (text or "").strip()
    if not t:
        if pflicht:
            raise KalenderFehler(f"{name}: bitte ein Datum eingeben (TT.MM.JJJJ).")
        return ""
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"):
        try:
            return datetime.strptime(t, fmt).date().isoformat()
        except ValueError:
            pass
    raise KalenderFehler(f"{name}: „{t}“ ist kein gültiges Datum (TT.MM.JJJJ).")


def parse_uhrzeit(text, name="Uhrzeit"):
    t = (text or "").strip().replace(".", ":")
    if not t:
        return ""
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?(?:\s*Uhr)?", t)
    if not m or int(m.group(1)) > 23 or int(m.group(2) or 0) > 59:
        raise KalenderFehler(f"{name}: bitte wie 18:30 eingeben.")
    return f"{int(m.group(1)):02d}:{int(m.group(2) or 0):02d}"


def als_datum(iso):
    try:
        return date.fromisoformat(iso) if iso else None
    except (TypeError, ValueError):
        return None


def datum_text(iso_oder_datum):
    d = iso_oder_datum if isinstance(iso_oder_datum, date) else als_datum(iso_oder_datum)
    return f"{d:%d.%m.%Y}" if d else ""


def _tag_im_jahr(d, jahr):
    """Gleicher Tag und Monat im Jahr jahr (29.02. -> 28.02.)."""
    try:
        return d.replace(year=jahr)
    except ValueError:
        return d.replace(year=jahr, day=28)


def _frist_tag(text, jahr):
    """„10.05.“ (auch „bis 31.03.“) -> date(jahr, 5, 10); None, wenn kein Tag erkennbar."""
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.", text or "")
    if not m:
        return None
    try:
        return date(jahr, int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _name(p):
    return " ".join(x for x in (p.get("vorname", ""), p.get("nachname", "")) if x).strip()


WOCHENTAGE_KURZ = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
MONATE = ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober",
          "November", "Dezember")


def zeitraum_text(t):
    """„Sa 21.11.2026“, „21.–23.11.2026“ oder „30.12.2026 – 02.01.2027“."""
    d, b = t["datum"], t.get("bis")
    if not b or b == d:
        return f"{WOCHENTAGE_KURZ[d.weekday()]} {d:%d.%m.%Y}"
    if d.year == b.year and d.month == b.month:
        return f"{d:%d.}–{b:%d.%m.%Y}"
    return f"{d:%d.%m.%Y} – {b:%d.%m.%Y}"


# ======================================================================
# Datenhaltung
# ======================================================================
class Kalender:
    def __init__(self, datei):
        """datei: Pfad der kalender.json; der Zwischenspeicher der Abos liegt daneben (kalender_abos.json)."""
        self.datei = datei
        self.abo_datei = os.path.join(os.path.dirname(os.path.abspath(datei)), "kalender_abos.json")
        self.fehler = ""
        self.speichern_gesperrt = False
        self.laden()

    def laden(self):
        self.eintraege, self.erledigt, self.abos = [], {}, []
        self.einstellungen = _einstellungen({})
        self.fehler, self.speichern_gesperrt = "", False
        self.abo_stand = self._lade_abo_stand()
        if not os.path.exists(self.datei):
            self.eintraege = [self._eintrag(dict(x)) for x in STANDARD_EINTRAEGE]
            return
        try:
            with open(self.datei, "r", encoding="utf-8-sig") as f:
                d = json.load(f)
            if not isinstance(d, dict):
                raise KalenderFehler("erwartet wird ein JSON-Objekt { … }")
            liste = d.get("eintraege", [])
            if not isinstance(liste, list):
                raise KalenderFehler("„eintraege“ muss eine Liste sein")
            self.eintraege = [self._eintrag(x) for x in liste if isinstance(x, dict)]
            erl = d.get("erledigt", {})
            self.erledigt = {str(k): str(v) for k, v in erl.items()} if isinstance(erl, dict) else {}
            abos = d.get("abos", [])
            self.abos = [self._abo(x) for x in abos if isinstance(x, dict)] if isinstance(abos, list) else []
            self.einstellungen = _einstellungen(d.get("einstellungen"))
        except (OSError, ValueError, TypeError, AttributeError) as e:
            self.eintraege, self.erledigt, self.abos = [], {}, []
            self.speichern_gesperrt = True
            self.fehler = (f"Die Datei kalender.json konnte nicht gelesen werden ({e}). Eigene Termine sind vorerst "
                           "nicht verfügbar, das Speichern ist gesperrt.")

    def speichern(self):
        """Schreibt kalender.json (über eine temporäre Datei). False, wenn das Speichern gesperrt ist."""
        if self.speichern_gesperrt:
            return False
        daten = {"hinweis": "Eigene Termine und Fristen des Vereinskalenders. Bitte über das Programm ändern.",
                 "format": DATEI_FORMAT, "eintraege": self.eintraege, "erledigt": self.erledigt, "abos": self.abos,
                 "einstellungen": self.einstellungen}
        os.makedirs(os.path.dirname(os.path.abspath(self.datei)), exist_ok=True)
        tmp = self.datei + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.datei)
        return True

    def _lade_abo_stand(self):
        try:
            with open(self.abo_datei, "r", encoding="utf-8-sig") as f:
                d = json.load(f)
            return {str(k): v for k, v in d.items() if isinstance(v, dict)} if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _speichere_abo_stand(self):
        os.makedirs(os.path.dirname(self.abo_datei), exist_ok=True)
        tmp = self.abo_datei + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.abo_stand, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.abo_datei)

    @staticmethod
    def _abo(x):
        bereich = str(x.get("bereich") or SPIELBETRIEB)
        return {"id": str(x.get("id") or uuid.uuid4().hex[:8]), "name": str(x.get("name") or "Abo").strip(),
                "url": str(x.get("url") or "").strip(), "bereich": bereich if bereich in BEREICHE else SPIELBETRIEB,
                "aktiv": x.get("aktiv", True) is not False,
                "mannschaft": _nummer(x["mannschaft"]) if "mannschaft" in x else mannschaft_aus_name(x.get("name")),
                # Frist vor jedem mehrtägigen Termin (seit 4.1.0), z. B. Hallennutzung 21 Tage vor den Ferien anmelden
                "frist_tage": _frist_tage(x.get("frist_tage")), "frist_titel": " ".join(str(x.get("frist_titel")
                                                                                            or "").split())}

    # ------------------------------------------------------------------ Kalender-Abos
    def hole_abo(self, aid):
        return next((a for a in self.abos if a["id"] == aid), None)

    def setze_abo(self, abo, name, url, bereich=SPIELBETRIEB, aktiv=True, mannschaft=None, frist_tage=0,
                  frist_titel=""):
        """Legt ein Abo an (abo=None) oder ändert es. url: webcal:// oder https://.
        frist_tage > 0: vor jedem mehrtägigen Termin des Abos eine Frist (frist_titel) so viele Tage vor Beginn."""
        name = " ".join((name or "").split())
        if not name:
            raise KalenderFehler("Bitte einen Namen eingeben, z. B. „Herren I“.")
        url = abo_url(url)
        if bereich not in BEREICHE:
            raise KalenderFehler("Bitte einen Bereich wählen.")
        doppelt = next((a for a in self.abos if a["url"] == url and a is not abo), None)
        if doppelt is not None:
            raise KalenderFehler(f"Diese Adresse ist schon als „{doppelt['name']}“ abonniert.")
        mannschaft = mannschaft_aus_name(name) if mannschaft is None else _nummer(mannschaft)
        frist_titel = " ".join((frist_titel or "").split())
        if str(frist_tage or "").strip() and _frist_tage(frist_tage) == 0 and str(frist_tage).strip() != "0":
            raise KalenderFehler("Die Tage vorher bitte als Zahl von 1 bis 120 eingeben (0 oder leer = keine Frist).")
        frist_tage = _frist_tage(frist_tage)
        if frist_tage and not frist_titel:
            raise KalenderFehler("Bitte eintragen, was bis dahin zu tun ist, z. B. „Hallennutzung Fambach anmelden“.")
        werte = {"name": name, "url": url, "bereich": bereich, "aktiv": bool(aktiv), "mannschaft": mannschaft,
                 "frist_tage": frist_tage, "frist_titel": frist_titel}
        if abo is None:
            abo = dict(werte, id=uuid.uuid4().hex[:8])
            self.abos.append(abo)
        else:
            if abo["url"] != url:
                self.abo_stand.pop(abo["id"], None)
            abo.update(werte)
        return abo

    # ------------------------------------------------------------------ Einstellungen (Farben, Anzeige)
    def farbe(self, bereich):
        return self.einstellungen["farben"].get(bereich) or STANDARD_FARBEN.get(bereich, "#6b7280")

    def mannschaftsfarbe(self, nr):
        return self.einstellungen["mannschaftsfarben"].get(str(nr)) or STANDARD_MANNSCHAFTSFARBEN.get(str(nr),
                                                                                                    "#6b7280")

    def setze_einstellungen(self, werte):
        """Übernimmt geänderte Einstellungen (geprüft); Farben, die dem Standard entsprechen, werden nicht gespeichert."""
        neu = _einstellungen(dict(self.einstellungen, **werte))
        neu["farben"] = {k: v for k, v in neu["farben"].items() if v.lower() != STANDARD_FARBEN.get(k, "").lower()}
        neu["mannschaftsfarben"] = {k: v for k, v in neu["mannschaftsfarben"].items()
                                    if v.lower() != STANDARD_MANNSCHAFTSFARBEN.get(k, "").lower()}
        self.einstellungen = neu

    def entferne_abo(self, abo):
        self.abos.remove(abo)
        if self.abo_stand.pop(abo["id"], None) is not None:
            try:
                self._speichere_abo_stand()
            except OSError:
                pass

    def abo_veraltet(self, abo, jetzt=None):
        """True, wenn das Abo (noch) nie oder vor mehr als ABO_ALTER_STUNDEN geladen wurde."""
        stand = self.abo_stand.get(abo["id"], {})
        try:
            zuletzt = datetime.fromisoformat(stand.get("versucht") or stand.get("stand") or "")
        except ValueError:
            return True
        return (jetzt or datetime.now()) - zuletzt > timedelta(hours=ABO_ALTER_STUNDEN)

    def uebernimm_abo(self, abo_id, ereignisse=None, fehler="", jetzt=None):
        """Trägt das Ergebnis eines Abrufs ein (ereignisse aus lies_ics oder fehler). Gibt die Änderungen zurück:
        {"neu": [...], "verschoben": [(alt, neu)], "entfallen": [...]} (bei Fehler leer); speichert den Stand."""
        jetzt = (jetzt or datetime.now()).replace(microsecond=0).isoformat()
        alt = self.abo_stand.get(abo_id, {})
        aenderung = {"neu": [], "verschoben": [], "entfallen": []}
        if fehler:
            alt = dict(alt, fehler=fehler, versucht=jetzt)  # alte Termine bleiben stehen
            self.abo_stand[abo_id] = alt
        else:
            vorher = {e["schluessel"]: e for e in alt.get("ereignisse", [])}
            nachher = {e["schluessel"]: e for e in ereignisse}
            if alt.get("stand"):  # beim ersten Laden ist alles „neu“ – das ist keine Nachricht wert
                for k, e in nachher.items():
                    if k not in vorher:
                        aenderung["neu"].append(e)
                    elif (vorher[k]["datum"], vorher[k]["uhrzeit"]) != (e["datum"], e["uhrzeit"]):
                        aenderung["verschoben"].append((vorher[k], e))
                aenderung["entfallen"] = [e for k, e in vorher.items() if k not in nachher]
            self.abo_stand[abo_id] = {"stand": jetzt, "versucht": jetzt, "fehler": "", "ereignisse": ereignisse}
        self._speichere_abo_stand()
        return aenderung

    @staticmethod
    def _eintrag(x):
        bereich = str(x.get("bereich") or SONSTIGES)
        datum = str(x.get("datum") or "")
        if als_datum(datum) is None:
            raise KalenderFehler(f"Eintrag „{x.get('titel', '')}“ hat kein gültiges Datum")
        bis = str(x.get("bis") or "")
        return {"id": str(x.get("id") or uuid.uuid4().hex[:8]), "titel": str(x.get("titel") or "").strip() or "Termin",
                "datum": datum, "bis": bis if als_datum(bis) else "", "uhrzeit": str(x.get("uhrzeit") or ""),
                "ort": str(x.get("ort") or ""), "bereich": bereich if bereich in BEREICHE else SONSTIGES,
                "frist": bool(x.get("frist")), "jaehrlich": bool(x.get("jaehrlich")), "notiz": str(x.get("notiz") or ""),
                "bericht": str(x.get("bericht") or ""), "im_bericht": bool(x.get("im_bericht"))}

    # ------------------------------------------------------------------ Eigene Einträge
    def hole(self, eid):
        return next((x for x in self.eintraege if x["id"] == eid), None)

    def setze_eintrag(self, eintrag, titel, datum, bis="", uhrzeit="", ort="", bereich=SONSTIGES, frist=False,
                      jaehrlich=False, notiz="", bericht="", im_bericht=False):
        """Legt einen Eintrag an (eintrag=None) oder ändert ihn. Datumsangaben als TT.MM.JJJJ.
        Vereinsarbeit ist nie Frist und nie jährlich (jedes Jahr ein eigener Eintrag mit eigenem Bericht)."""
        titel = " ".join((titel or "").split())
        if not titel:
            raise KalenderFehler("Bitte eine Bezeichnung eingeben.")
        von = parse_datum(datum, pflicht=True)
        bis = parse_datum(bis, name="Bis")
        if bis and bis < von:
            raise KalenderFehler("„Bis“ liegt vor dem Datum.")
        if bis == von:
            bis = ""
        if bereich not in BEREICHE:
            raise KalenderFehler("Bitte einen Bereich wählen.")
        arbeit = bereich == VEREINSARBEIT
        werte = {"titel": titel, "datum": von, "bis": bis, "uhrzeit": parse_uhrzeit(uhrzeit),
                 "ort": " ".join((ort or "").split()), "bereich": bereich, "frist": bool(frist) and not arbeit,
                 "jaehrlich": bool(jaehrlich) and not arbeit, "notiz": (notiz or "").strip(),
                 "bericht": (bericht or "").strip() if arbeit else "", "im_bericht": bool(im_bericht) and arbeit}
        if eintrag is None:
            eintrag = {"id": uuid.uuid4().hex[:8], **werte}
            self.eintraege.append(eintrag)
        else:
            eintrag.update(werte)
        return eintrag

    def vereinsarbeit(self, jahr, nur_freigegeben=False):
        """Einträge der Vereinsarbeit im Jahr (nach Datum): [{id, datum, bis, titel, ort, bericht, im_bericht}]."""
        liste = [x for x in self.eintraege if x["bereich"] == VEREINSARBEIT and x["datum"][:4] == str(jahr)
                 and (x["im_bericht"] or not nur_freigegeben)]
        return [dict(x) for x in sorted(liste, key=lambda x: (x["datum"], x["uhrzeit"], x["titel"].casefold()))]

    def setze_im_bericht(self, eid, wert):
        x = self.hole(eid)
        if x is not None and x["bereich"] == VEREINSARBEIT:
            x["im_bericht"] = bool(wert)

    def entferne(self, eintrag):
        self.eintraege.remove(eintrag)
        praefix = f"eigen:{eintrag['id']}:"
        for k in [k for k in self.erledigt if k.startswith(praefix)]:
            del self.erledigt[k]

    def setze_erledigt(self, termin, erledigt=True, heute=None):
        """Merkt sich, dass eine Frist erledigt ist (nur für Fristen, deren Stand das Programm nicht selbst kennt)."""
        if erledigt:
            self.erledigt[termin["schluessel"]] = (heute or date.today()).isoformat()
        else:
            self.erledigt.pop(termin["schluessel"], None)

    # ------------------------------------------------------------------ Termine sammeln
    def termine(self, von, bis, *, versammlungen=None, dokumente=None, organisation=None, spielbetrieb=None,
                mitglieder=None, vereinsleben=None, einladungsfrist=14, antragsfrist=3, heute=None):
        """Alle Termine zwischen von und bis (date, jeweils einschließlich), nach Datum sortiert.

        Mehrtägige Einträge gehören dazu, sobald sie den Zeitraum berühren. Die Quellen sind optional (None = nicht
        berücksichtigen); jede Quelle für sich darf den Kalender nicht zum Absturz bringen (Fehler -> self.quellfehler).
        """
        heute = heute or date.today()
        self.quellfehler = []
        self._vereinsleben_verknuepft = {}
        liste = []
        for name, funktion in (
                ("Eigene Einträge", lambda: self._eigene(von, bis)),
                ("Versammlungen", lambda: _aus_versammlungen(versammlungen, dokumente, einladungsfrist, antragsfrist,
                                                                    heute) if versammlungen is not None else []),
                ("Spielbetrieb", lambda: _aus_spielbetrieb(spielbetrieb, von, bis) if spielbetrieb is not None else []),
                ("Organisation", lambda: _aus_organisation(organisation, von, bis, heute)
                 if organisation is not None and not organisation.fehler else []),
                ("Geburtstage", lambda: _geburtstage(mitglieder, von, bis) if mitglieder else []),
                ("Kalender-Abos", lambda: self._aus_abos(von, bis)),
                ("Vereinsleben", lambda: self._aus_vereinsleben(vereinsleben) if vereinsleben is not None else [])):
            try:
                liste.extend(funktion())
            except Exception as e:  # noqa: BLE001 – eine kaputte Quelle soll die anderen nicht verdecken
                self.quellfehler.append(f"{name}: {e}")
        liste = _doppelte_spiele_weg(liste, heute)
        for t in liste:  # eigene Termine, die ins Vereinsleben übernommen wurden
            if t.get("eigen") and t["eigen"] in getattr(self, "_vereinsleben_verknuepft", {}):
                t["vereinsleben"] = self._vereinsleben_verknuepft[t["eigen"]]
        ergebnis = []
        for t in liste:
            ende = t.get("bis") or t["datum"]
            if ende < von or t["datum"] > bis:
                continue
            t.setdefault("bis", None)
            for k, v in (("uhrzeit", ""), ("text", ""), ("ort", ""), ("eigen", None), ("ziel", None),
                         ("automatisch", False), ("status", "")):
                t.setdefault(k, v)
            if t["frist"] and not t["automatisch"]:
                t["status"] = self._status(t, heute)
            elif not t["frist"] and not t["status"]:
                t["status"] = "vorbei" if (t.get("bis") or t["datum"]) < heute else ""
            ergebnis.append(t)
        ergebnis.sort(key=lambda t: (t["datum"].isoformat(), t["uhrzeit"] or "99", t["titel"].casefold()))
        return ergebnis

    def _aus_vereinsleben(self, vl):
        """Einträge des Vereinslebens. Ist ein Eintrag aus einem eigenen Kalendertermin übernommen (kalender_id),
        zeigt der Kalender nur den Termin – mit Verweis aufs Vereinsleben (Schlüssel „vereinsleben“)."""
        from Vereinslebenmodul import passender_termin

        ergebnis, verknuepft = [], {}
        for e in vl.eintraege:
            termin = passender_termin(e, self.eintraege)  # übernommen oder gleicher Tag und Titel
            if termin is not None:
                verknuepft[termin["id"]] = e["id"]
                continue
            d = als_datum(e["datum"])
            teile = [e["art"], "öffentlich" if e["oeffentlich"] else "intern"]
            if e["bilder"]:
                teile.append(f"{len(e['bilder'])} Bilder")
            ergebnis.append({
                "schluessel": f"vereinsleben:{e['id']}", "datum": d, "bis": als_datum(e["bis"]),
                "uhrzeit": e["uhrzeit"], "titel": e["titel"], "ort": e["ort"], "text": " · ".join(teile),
                "bereich": VEREINSLEBEN, "frist": False, "quelle": "Vereinsleben",
                "ziel": ("vereinsleben", e["id"]), "vereinsleben": e["id"]})
        self._vereinsleben_verknuepft = verknuepft
        return ergebnis

    def _aus_abos(self, von, bis):
        try:  # mytischtennis.de kürzt den eigenen Verein („Werragrund“): im Programm der volle Name
            from Einstellungsmodul import VEREIN_NAME
            from Tabellenabrufmodul import begegnung_voll
        except Exception:  # noqa: BLE001
            VEREIN_NAME, begegnung_voll = "", None
        ergebnis = []
        for a in self.abos:
            if not a["aktiv"]:
                continue
            stand = self.abo_stand.get(a["id"], {})
            zeit = stand.get("stand", "")
            stand_text = f"Stand {datetime.fromisoformat(zeit):%d.%m.%Y %H:%M}" if zeit else "noch nicht geladen"
            for e in stand.get("ereignisse", []):
                d = als_datum(e.get("datum"))
                tage = a.get("frist_tage") or 0
                if d is not None and tage and als_datum(e.get("bis")):  # nur vor mehrtägigen Terminen (Ferien)
                    f = d - timedelta(days=tage)
                    if von <= f <= bis:
                        ergebnis.append({
                            "schluessel": f"abofrist:{a['id']}:{e['schluessel']}", "datum": f,
                            "titel": f"{a.get('frist_titel') or 'Frist'} – {e.get('titel', '')}",
                            "text": f"{tage} Tage vor Beginn ({d:%d.%m.%Y}) · Frist aus dem Abo „{a['name']}“",
                            "bereich": a["bereich"], "frist": True, "quelle": f"Kalender-Abo „{a['name']}“ "
                            f"({stand_text}), Frist {tage} Tage vorher", "abo": a["id"]})
                if d is None or d > bis or (als_datum(e.get("bis")) or d) < von:
                    continue
                ergebnis.append({
                    "schluessel": f"abo:{a['id']}:{e['schluessel']}", "datum": d, "bis": als_datum(e.get("bis")),
                    "uhrzeit": e.get("uhrzeit", ""),
                    "titel": (begegnung_voll if begegnung_voll and VEREIN_NAME else lambda t, _v: t)(
                        re.sub(r"\s+vs\.?\s+", " – ", e.get("titel", "")), VEREIN_NAME),
                    "ort": e.get("ort", ""),
                    "text": " · ".join(x for x in (e.get("text", ""), f"Abo „{a['name']}“") if x),
                    "bereich": a["bereich"], "frist": False, "quelle": f"Kalender-Abo „{a['name']}“ ({stand_text})",
                    "abo": a["id"], "mannschaft": a.get("mannschaft") or None})
        return ergebnis

    def _status(self, t, heute):
        if t["schluessel"] in self.erledigt:
            return "erledigt"
        tage = (t["datum"] - heute).days
        if tage < 0:
            # Einmalige Fristen bleiben überfällig, bis sie erledigt sind; jährliche nach einer Weile nur noch „vorbei“
            if t.get("wiederholung") and -tage > UEBERFAELLIG_TAGE:
                return "vorbei"
            return "überfällig"
        return "bald" if tage <= BALD_TAGE else "offen"

    def _eigene(self, von, bis):
        ergebnis = []
        for x in self.eintraege:
            start = als_datum(x["datum"])
            ende = als_datum(x["bis"]) or start
            dauer = ende - start
            jahre = range(max(start.year, von.year - 1), bis.year + 1) if x["jaehrlich"] else (start.year,)
            for jahr in jahre:
                d = _tag_im_jahr(start, jahr)
                ergebnis.append({
                    "schluessel": f"eigen:{x['id']}:{jahr}", "datum": d, "bis": d + dauer if dauer.days else None,
                    "uhrzeit": x["uhrzeit"], "titel": x["titel"], "text": x["notiz"], "ort": x["ort"],
                    "bereich": x["bereich"], "frist": x["frist"], "quelle": "Eigener Eintrag" + (
                        " (jedes Jahr)" if x["jaehrlich"] else ""), "eigen": x["id"], "wiederholung": x["jaehrlich"],
                    "bericht": x.get("bericht", ""), "im_bericht": x.get("im_bericht", False)})
        return ergebnis

    # ------------------------------------------------------------------ Kennzahlen
    @staticmethod
    def kennzahlen(termine, heute=None):
        """{naechster: Termin oder None, bald: [Fristen in BALD_TAGE Tagen], ueberfaellig: [...], heute: [...]}."""
        heute = heute or date.today()
        kommend = [t for t in termine if (t.get("bis") or t["datum"]) >= heute and t["status"] != "erledigt"]
        return {
            "naechster": next((t for t in kommend if t["datum"] >= heute), None),
            "heute": [t for t in kommend if t["datum"] <= heute <= (t.get("bis") or t["datum"])],
            "bald": [t for t in termine if t["frist"] and t["status"] == "bald"],
            "ueberfaellig": [t for t in termine if t["frist"] and t["status"] == "überfällig"],
        }


# ======================================================================
# Quellen
# ======================================================================
def _aus_versammlungen(versammlungen, dokumente, einladungsfrist, antragsfrist, heute):
    from Versammlungenmodul import ART_INFO

    ergebnis = []
    for v in versammlungen.liste():
        d = date.fromisoformat(v["datum"])
        name = v["titel"]
        ergebnis.append({
            "schluessel": f"versammlung:{v['id']}", "datum": d, "uhrzeit": v.get("uhrzeit", ""), "titel": name,
            "text": (v.get("zusammenfassung") or "").strip(), "ort": v.get("ort", ""), "bereich": VERSAMMLUNGEN,
            "frist": False, "quelle": "Organisation → Versammlungen", "ziel": ("versammlung", v["id"])})
        pflicht = ART_INFO.get(v["art"], {}).get("pflicht", ())
        if "einladung" in pflicht and einladungsfrist:
            spaetestens = d - timedelta(days=einladungsfrist)
            vorhanden = bool(dokumente is not None and dokumente.rolle(v["id"], "einladung"))
            if vorhanden:
                status = "erledigt"
            elif heute > d:
                status = "vorbei"
            elif heute > spaetestens:
                status = "überfällig"
            else:
                status = "bald" if (spaetestens - heute).days <= BALD_TAGE else "offen"
            ergebnis.append({
                "schluessel": f"einladung:{v['id']}", "datum": spaetestens, "titel": f"Einladung verschicken: {name}",
                "text": f"Spätestens {einladungsfrist} Tage vor der Versammlung am {d:%d.%m.%Y} (laut Einstellungen)."
                        + (" Die Einladung ist abgelegt." if vorhanden else ""),
                "bereich": VERSAMMLUNGEN, "frist": True, "automatisch": True, "status": status,
                "quelle": "Organisation → Versammlungen", "ziel": ("versammlung", v["id"])})
            if antragsfrist and v["art"] in ("jhv", "mv_ausserordentlich"):
                ergebnis.append({
                    "schluessel": f"antraege:{v['id']}", "datum": d - timedelta(days=antragsfrist),
                    "titel": f"Anträge der Mitglieder bis: {name}",
                    "text": f"{antragsfrist} Tage vor der Versammlung (laut Einstellungen).", "bereich": VERSAMMLUNGEN,
                    "frist": False, "quelle": "Organisation → Versammlungen", "ziel": ("versammlung", v["id"])})
    return ergebnis


def _aus_spielbetrieb(sb, von, bis):
    ergebnis = []
    for key, s in sb.spiele.items():
        d = als_datum(s.get("datum"))
        if d is None or d < von or d > bis:
            continue
        eigen, gegner = s.get("eigene_mannschaft", ""), s.get("gegner", "")
        heim = bool(s.get("heimspiel"))
        titel = f"{eigen} – {gegner}" if heim else f"{gegner} – {eigen}"
        erg = s.get("ergebnis") or []
        text, art, kurz = s.get("liga", ""), "", ""
        if len(erg) == 2:
            a, b = (erg[0], erg[1]) if heim else (erg[1], erg[0])
            art = "sieg" if erg[0] > erg[1] else "niederlage" if erg[0] < erg[1] else "remis"
            titel += f"  {a}:{b}"
            nr = s.get("mannschaft")
            team = ROEMISCH[nr - 1] + " " if isinstance(nr, int) and 1 <= nr <= len(ROEMISCH) else ""
            kurz = f"{team}{erg[0]}:{erg[1]} {gegner}"  # Monatsblatt: eigene Mannschaft, Ergebnis aus eigener Sicht
            text += f" · Ergebnis {a}:{b} ({ {'sieg': 'Sieg', 'niederlage': 'Niederlage'}.get(art, 'Unentschieden') })"
        ergebnis.append({
            "schluessel": f"spiel:{key}", "datum": d, "uhrzeit": s.get("uhrzeit", ""), "titel": titel,
            "text": text.strip(" ·"), "ort": "Heimspiel" if heim else "Auswärtsspiel", "bereich": SPIELBETRIEB,
            "frist": False, "quelle": "Spielbetrieb → Spielergebnisse (eingelesener Spielbericht)",
            "ziel": ("spiel", key), "gegner": gegner, "ergebnis_art": art, "kurztitel": kurz,
            "mannschaft": s.get("mannschaft") if isinstance(s.get("mannschaft"), int) else None})
    return ergebnis


def _aus_organisation(org, von, bis, heute):
    ergebnis = []

    def frist(schluessel, d, titel, text, bereich, reiter):
        if d is not None:
            ergebnis.append({"schluessel": schluessel, "datum": d, "titel": titel, "text": text, "bereich": bereich,
                             "frist": True, "quelle": "Organisation", "ziel": ("organisation", reiter)})

    eck = org.eckdaten
    b = org.aktueller_bescheid()
    if b and als_datum(b["gueltig_bis"]):
        frist(f"bescheid:{b['gueltig_bis']}", als_datum(b["gueltig_bis"]), "Freistellungsbescheid läuft ab",
              "Rechtzeitig vorher die Steuererklärung abgeben, damit ein neuer Bescheid kommt.", FINANZEN,
              REITER_FINANZAMT)
    st = als_datum(eck.get("steuererklaerung_bis", ""))
    frist(f"steuer:{eck.get('steuererklaerung_bis', '')}", st, "Steuererklärung abgeben",
          "Körperschaftsteuererklärung beim Finanzamt" + (f" ({eck['finanzamt']})" if eck.get("finanzamt") else "")
          + ". Nach der Abgabe den nächsten Termin unter Organisation → Finanzamt eintragen.", FINANZEN,
          REITER_FINANZAMT)
    ende = org.amtszeit_ende()
    frist(f"amtszeit:{ende}", ende, "Amtszeit des Vorstands endet",
          "Neuwahl in einer Mitgliederversammlung vorbereiten (letzte Wahl + Wahlperiode laut Satzung).", ORGANISATION,
          REITER_SATZUNG)
    for x in org.lizenzen:
        d = als_datum(x.get("gueltig_bis", ""))
        frist(f"lizenz:{x['id']}:{x.get('gueltig_bis', '')}", d, f"Lizenz läuft ab: {_name(x)}",
              x.get("lizenz", ""), ORGANISATION, REITER_TRAINING)
    faellig = eck.get("beitragsfaelligkeit", "")
    for jahr in range(von.year, bis.year + 1):
        d = _frist_tag(faellig, jahr)
        if d is not None:
            ergebnis.append({"schluessel": f"beitrag:{jahr}", "datum": d, "titel": f"Beiträge {jahr} fällig",
                             "text": f"Laut Satzung: {faellig}.", "bereich": FINANZEN, "frist": False,
                             "quelle": "Organisation → Satzung (Eckdaten)", "ziel": ("organisation", REITER_SATZUNG)})
    # Hallenanträge: je Halle mit jährlichem Antrag die Frist für das kommende Schuljahr
    for o in org.antrags_orte():
        for jahr in range(von.year, bis.year + 1):
            d = _frist_tag(o.get("antrag_frist") or ANTRAG_FRIST, jahr)
            if d is None:
                continue
            schuljahr = f"{jahr}/{jahr + 1}"
            antrag = org.antrag_fuer(o["id"], schuljahr)
            if antrag is not None and antrag.get("eingereicht"):
                status = "erledigt"
            elif d < heute:
                status = "überfällig" if (heute - d).days <= 90 else "vorbei"
            else:
                status = "bald" if (d - heute).days <= BALD_TAGE else "offen"
            ergebnis.append({
                "schluessel": f"hallenantrag:{o['id']}:{jahr}", "datum": d,
                "titel": f"Hallenantrag {o['name']} ({schuljahr})",
                "text": (f"Eingereicht am {datum_text(antrag['eingereicht'])}." if status == "erledigt" else
                         "Antrag auf Hallennutzung für das kommende Schuljahr stellen.")
                + (f" Stelle: {o['antrag_stelle'].splitlines()[0]}" if o.get("antrag_stelle") else ""),
                "bereich": HALLE, "frist": True, "automatisch": True, "status": status,
                "quelle": "Organisation → Training und Spiellokale", "ziel": ("organisation", REITER_TRAINING)})
    for s in org.sperrungen:
        d, e = als_datum(s.get("von", "")), als_datum(s.get("bis", ""))
        if d is None:
            continue
        ort = org.ort_name(s["ort"], leer="alle Hallen") if s.get("ort") else "alle Hallen"
        ergebnis.append({
            "schluessel": f"sperrung:{s['id']}", "datum": d, "bis": e if e and e > d else None,
            "titel": f"Halle gesperrt: {s.get('grund') or 'ohne Angabe'}", "text": f"Betrifft: {ort}.",
            "ort": ort, "bereich": HALLE, "frist": False, "quelle": "Organisation → Training und Spiellokale",
            "ziel": ("organisation", REITER_TRAINING)})
    return ergebnis


def _frist_tage(wert):
    """Tage der Abo-Frist (0 = keine; 1 bis 120)."""
    try:
        tage = int(str(wert or 0).strip())
    except ValueError:
        return 0
    return tage if 1 <= tage <= 120 else 0


_FARBE = re.compile(r"#[0-9a-fA-F]{6}")


def _einstellungen(d):
    """Kalender-Einstellungen mit Standardwerten; ungültige Werte fallen auf den Standard zurück."""
    d = d if isinstance(d, dict) else {}
    farben = d.get("farben") if isinstance(d.get("farben"), dict) else {}
    teams = d.get("mannschaftsfarben") if isinstance(d.get("mannschaftsfarben"), dict) else {}
    try:
        tage = max(0, min(60, int(d.get("erinnerung_tage", 7))))
    except (TypeError, ValueError):
        tage = 7
    return {
        "farben": {k: str(v) for k, v in farben.items() if k in BEREICHE and _FARBE.fullmatch(str(v))},
        "mannschaftsfarben": {str(k): str(v) for k, v in teams.items()
                              if str(k).isdigit() and 1 <= int(k) <= MANNSCHAFTEN_HOECHSTENS
                              and _FARBE.fullmatch(str(v))},
        "nach_mannschaft": d.get("nach_mannschaft", True) is not False,
        "geburtstage": d.get("geburtstage", True) is not False,
        "erinnerung_tage": tage,
        "ansicht": "liste" if d.get("ansicht") == "liste" else "monat",
    }


def _nummer(wert):
    try:
        n = int(wert or 0)
    except (TypeError, ValueError):
        return 0
    return n if 0 <= n <= MANNSCHAFTEN_HOECHSTENS else 0


def mannschaft_aus_name(name):
    """„Herren I“ -> 1, „Herren 2“ -> 2, „Jugend“ -> 0 (keine Zuordnung)."""
    letztes = (str(name or "").split() or [""])[-1].upper()
    if letztes.isdigit():
        return _nummer(letztes)
    return ROEMISCH.index(letztes) + 1 if letztes in ROEMISCH else 0


def _geburtstage(mitglieder, von, bis):
    """mitglieder: [{nachname, vorname, geb (date)}] – Geburtstage im Zeitraum mit dem neuen Alter."""
    ergebnis = []
    for m in mitglieder:
        geb = m.get("geb")
        if not isinstance(geb, date):
            continue
        for jahr in range(von.year, bis.year + 1):
            d = _tag_im_jahr(geb, jahr)
            alter = jahr - geb.year
            if alter <= 0 or d < von or d > bis:
                continue
            rund = alter % 10 == 0 or alter == 18 or (alter >= 50 and alter % 5 == 0)
            name = f"{m.get('vorname', '')} {m.get('nachname', '')}".strip()
            ergebnis.append({
                "schluessel": f"geburtstag:{m.get('nachname', '')}:{m.get('vorname', '')}:{jahr}", "datum": d,
                "titel": f"Geburtstag {name} ({alter})", "text": "Runder Geburtstag!" if rund else "",
                "bereich": GEBURTSTAGE, "frist": False, "quelle": "Mitglieder (Geburtsdatum)", "rund": rund,
                "ziel": ("mitglied", (m.get("nachname", ""), m.get("vorname", "")))})
    return ergebnis


def _vergleich(text):
    """Vereinsname für den Vergleich: ohne Akzente, Satzzeichen und Groß-/Kleinschreibung."""
    t = unicodedata.normalize("NFKD", str(text or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).casefold().replace("ß", "ss")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def _enthaelt(titel, name):
    """True, wenn name als ganze Wörter im Titel steht („Kaltensundheim II“ passt nicht zu „… III“)."""
    return bool(name) and f" {name} " in f" {titel} "


def _doppelte_spiele_weg(liste, heute=None):
    """Ein Spiel aus einem Abo, zu dem schon ein Spielbericht eingelesen ist (gleicher Tag, Gegner im Titel des
    Abo-Termins), erscheint nur einmal: Der Spielbericht ersetzt den Abo-Termin (Ergebnis, Sprung zum Spielbericht);
    Ort und – falls im Bericht keine steht – Uhrzeit kommen aus dem Abo. Vergangene Abo-Spiele ohne Bericht bekommen
    den Hinweis „Spielbericht noch nicht eingelesen“."""
    heute = heute or date.today()
    spiele = {}
    for t in liste:
        if t["schluessel"].startswith("spiel:"):
            spiele.setdefault(t["datum"], []).append(t)
    ergebnis = []
    for t in liste:
        if t.get("abo") and not t["schluessel"].startswith("abofrist:"):
            titel = _vergleich(t["titel"])
            treffer = next((s for s in spiele.get(t["datum"], []) if _enthaelt(titel, _vergleich(s.get("gegner")))),
                           None)
            if treffer is not None:
                if t.get("ort"):
                    treffer["ort"] = t["ort"]
                if not treffer.get("uhrzeit"):
                    treffer["uhrzeit"] = t.get("uhrzeit", "")
                treffer["quelle"] += " · ersetzt den Termin aus dem " + t["quelle"].replace("Kalender-Abo", "Abo")
                continue
            if t["datum"] < heute and t["bereich"] == SPIELBETRIEB:
                t["text"] = " · ".join(x for x in (t["text"], "Spielbericht noch nicht eingelesen") if x)
        ergebnis.append(t)
    return ergebnis


# ======================================================================
# Kalender-Abos: .ics-Adresse laden und lesen
# ======================================================================
def abo_url(text):
    """webcal://… -> https://…; prüft die Adresse grob."""
    url = (text or "").strip().strip("<>\"'")
    if not url:
        raise KalenderFehler("Bitte die Adresse des Kalenders eingeben (beginnt mit webcal:// oder https://).")
    if url.lower().startswith("webcal://"):
        url = "https://" + url[9:]
    elif url.lower().startswith("webcals://"):
        url = "https://" + url[10:]
    elif not re.match(r"https?://", url, re.I):
        url = "https://" + url
    if not re.match(r"https?://[^/\s]+\.[^/\s]+", url):
        raise KalenderFehler(f"„{text}“ ist keine gültige Adresse.")
    return url


def lade_ics(url, timeout=ABO_TIMEOUT):
    """Lädt die .ics-Datei (Text). Löst KalenderFehler mit verständlichem Text aus."""
    anfrage = urllib.request.Request(abo_url(url), headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Vereinsdatenbank-Kalender",
        "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.5"})
    try:
        with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
            roh = antwort.read(5_000_000)
            zeichensatz = antwort.headers.get_content_charset() or "utf-8"
    except urllib.error.HTTPError as e:
        raise KalenderFehler(f"Der Server antwortet mit Fehler {e.code} ({e.reason}).") from None
    except urllib.error.URLError as e:
        raise KalenderFehler(f"Keine Verbindung ({e.reason}). Besteht eine Internetverbindung?") from None
    except (TimeoutError, OSError) as e:
        raise KalenderFehler(f"Der Abruf ist fehlgeschlagen ({e}).") from None
    text = roh.decode(zeichensatz, errors="replace")
    if "BEGIN:VCALENDAR" not in text[:2000].upper():
        raise KalenderFehler("Unter der Adresse liegt kein Kalender (.ics). Bitte die Adresse prüfen.")
    return text


def _ics_wert(text):
    """Maskierte Zeichen (\\, \\; \\, \\n) zurückverwandeln."""
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), text)


def _letzter_sonntag(jahr, monat):
    d = date(jahr, monat + 1, 1) - timedelta(days=1) if monat < 12 else date(jahr, 12, 31)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def utc_nach_berlin(dt):
    """UTC -> Ortszeit Deutschland (Sommerzeit vom letzten Sonntag im März bis zum letzten Sonntag im Oktober,
    jeweils 01:00 UTC). Ohne Zeitzonen-Datenbank, damit es auch in der .exe unter Windows sicher geht."""
    beginn = datetime.combine(_letzter_sonntag(dt.year, 3), datetime.min.time()) + timedelta(hours=1)
    ende = datetime.combine(_letzter_sonntag(dt.year, 10), datetime.min.time()) + timedelta(hours=1)
    return dt + timedelta(hours=2 if beginn <= dt < ende else 1)


def _ics_zeit(name_param, wert):
    """(date, "HH:MM" oder "", ganztägig) aus DTSTART/DTEND."""
    wert = wert.strip()
    if "VALUE=DATE" in name_param.upper() and "VALUE=DATE-TIME" not in name_param.upper() or len(wert) == 8:
        return datetime.strptime(wert[:8], "%Y%m%d").date(), "", True
    dt = datetime.strptime(wert[:15], "%Y%m%dT%H%M%S")
    if wert.endswith("Z"):
        dt = utc_nach_berlin(dt)
    # TZID=… oder ohne Angabe: als Ortszeit nehmen (die Abos des Verbands nutzen Europe/Berlin)
    return dt.date(), f"{dt:%H:%M}", False


def lies_ics(text):
    """Liest die Termine (VEVENT) einer .ics-Datei: [{schluessel, datum, uhrzeit, bis, ende_uhrzeit, titel, ort,
    text}] nach Datum sortiert. Der Schlüssel hängt am Titel (z. B. der Paarung), nicht an der UID – manche Anbieter
    (mytischtennis.de) vergeben bei jedem Abruf neue UIDs. So bleibt ein verschobenes Spiel derselbe Termin."""
    zeilen = []
    for z in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if z[:1] in (" ", "\t") and zeilen:
            zeilen[-1] += z[1:]
        else:
            zeilen.append(z)
    roh, aktuell, tiefe = [], None, 0
    for z in zeilen:
        oben = z.upper()
        if oben == "BEGIN:VEVENT":
            aktuell, tiefe = {}, 0
        elif oben == "END:VEVENT":
            if aktuell is not None:
                roh.append(aktuell)
            aktuell = None
        elif aktuell is not None:
            if oben.startswith("BEGIN:"):  # z. B. VALARM im Termin überspringen
                tiefe += 1
            elif oben.startswith("END:"):
                tiefe -= 1
            elif tiefe == 0 and ":" in z:
                kopf, wert = z.split(":", 1)
                name = kopf.split(";", 1)[0].upper()
                aktuell.setdefault(name, (kopf, wert))
    ergebnis, zaehler = [], {}
    for e in roh:
        if "DTSTART" not in e or e.get("STATUS", ("", ""))[1].strip().upper() == "CANCELLED":
            continue
        try:
            d, uhr, ganztags = _ics_zeit(*e["DTSTART"])
            bis, ende_uhr = None, ""
            if "DTEND" in e:
                b, ende_uhr, _g = _ics_zeit(*e["DTEND"])
                if ganztags:
                    b -= timedelta(days=1)  # DTEND ist bei ganztägigen Terminen der Folgetag
                bis = b if b > d else None
        except ValueError:
            continue
        titel = " ".join(_ics_wert(e.get("SUMMARY", ("", ""))[1]).split()) or "Termin"
        beschreibung = _ics_wert(e.get("DESCRIPTION", ("", ""))[1]).strip()
        basis = _vergleich(titel) + "|" + _vergleich(beschreibung)[:40]
        zaehler[basis] = zaehler.get(basis, 0) + 1
        ergebnis.append({
            "schluessel": basis + (f"|{zaehler[basis]}" if zaehler[basis] > 1 else ""),
            "datum": d.isoformat(), "uhrzeit": uhr, "bis": bis.isoformat() if bis else "", "ende_uhrzeit": ende_uhr,
            "titel": titel, "ort": " ".join(_ics_wert(e.get("LOCATION", ("", ""))[1]).split()),
            "text": " ".join(beschreibung.split())})
    ergebnis.sort(key=lambda x: (x["datum"], x["uhrzeit"]))
    return ergebnis


def abo_abrufen(abo):
    """Lädt und liest ein Abo (für einen Hintergrund-Thread: keine Änderungen am Kalender).
    Gibt (abo_id, ereignisse, fehler) zurück."""
    try:
        return abo["id"], lies_ics(lade_ics(abo["url"])), ""
    except KalenderFehler as e:
        return abo["id"], None, str(e)
    except Exception as e:  # noqa: BLE001 – ein Abo darf nie das Programm stören
        return abo["id"], None, f"Unerwarteter Fehler: {e}"


# ======================================================================
# Export als iCalendar (.ics) – zum Einlesen in Outlook, Google Kalender, Handy
# ======================================================================
def _ics_text(text):
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n") \
        .replace("\n", "\\n")


def _falte(zeile):
    """Zeilen über 75 Byte nach RFC 5545 umbrechen (Folgezeilen beginnen mit einem Leerzeichen)."""
    roh = zeile.encode("utf-8")
    if len(roh) <= 75:
        return zeile
    teile, aktuell = [], b""
    for zeichen in zeile:
        z = zeichen.encode("utf-8")
        if len(aktuell) + len(z) > (75 if not teile else 74):
            teile.append(aktuell.decode("utf-8"))
            aktuell = b""
        aktuell += z
    teile.append(aktuell.decode("utf-8"))
    return "\r\n ".join(teile)


def ics_inhalt(termine, vereinsname="Verein", erinnerung_tage=7, jetzt=None):
    """iCalendar-Text der Termine. Fristen bekommen eine Erinnerung erinnerung_tage vorher (0 = keine).

    Termine mit Uhrzeit dauern 2 Stunden (Spiele 3), sonst ganztägig. Die Uhrzeit gilt als Ortszeit."""
    jetzt = jetzt or datetime.now()
    stempel = jetzt.strftime("%Y%m%dT%H%M%S")
    zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{_ics_text(vereinsname)}//Vereinsdatenbank//DE",
              "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{_ics_text(vereinsname)}"]
    for t in termine:
        uid = re.sub(r"[^A-Za-z0-9_.:-]", "-", t["schluessel"]) + "@vereinsdatenbank"
        zeilen += ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stempel}"]
        ende = t.get("bis") or t["datum"]
        if t.get("uhrzeit"):
            h, m = (int(x) for x in t["uhrzeit"].split(":"))
            start = datetime(t["datum"].year, t["datum"].month, t["datum"].day, h, m)
            schluss = (datetime(ende.year, ende.month, ende.day, h, m) if t.get("bis") else start) + \
                timedelta(hours=3 if t["bereich"] == SPIELBETRIEB and t["schluessel"].startswith("spiel:") else 2)
            zeilen += [f"DTSTART:{start:%Y%m%dT%H%M%S}", f"DTEND:{schluss:%Y%m%dT%H%M%S}"]
        else:
            zeilen += [f"DTSTART;VALUE=DATE:{t['datum']:%Y%m%d}",
                       f"DTEND;VALUE=DATE:{ende + timedelta(days=1):%Y%m%d}", "TRANSP:TRANSPARENT"]
        titel = ("Frist: " if t["frist"] and not t["titel"].startswith("Frist") else "") + t["titel"]
        zeilen.append(f"SUMMARY:{_ics_text(titel)}")
        beschreibung = "\n".join(x for x in (t.get("text", ""), f"Bereich: {t['bereich']}") if x)
        zeilen.append(f"DESCRIPTION:{_ics_text(beschreibung)}")
        if t.get("ort"):
            zeilen.append(f"LOCATION:{_ics_text(t['ort'])}")
        zeilen.append(f"CATEGORIES:{_ics_text(t['bereich'])}")
        if t["frist"] and erinnerung_tage and t["status"] not in ("erledigt", "vorbei"):
            zeilen += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_ics_text(titel)}",
                       f"TRIGGER:-P{int(erinnerung_tage)}D", "END:VALARM"]
        zeilen.append("END:VEVENT")
    zeilen.append("END:VCALENDAR")
    return "\r\n".join(_falte(z) for z in zeilen) + "\r\n"


def schreibe_ics(pfad, termine, vereinsname="Verein", erinnerung_tage=7):
    inhalt = ics_inhalt(termine, vereinsname, erinnerung_tage)
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        f.write(inhalt)
    return len(termine)
