"""Holt Tabellen und Spielpläne von mytischtennis.de für die Handy-App (läuft automatisch bei GitHub).

Liest live/quellen.json (Tabellen-Links und Kalender-Abos der Mannschaften, wie im Programm am PC eingetragen) und
schreibt live.json neben die App. Nur öffentliche Daten – keine Mitgliederdaten. Die Bausteine
Tabellenabrufmodul.py und Kalendermodul.py sind Kopien aus dem PC-Programm.

live.json wird nur neu geschrieben, wenn sich etwas geändert hat (sonst höchstens einmal am Tag mit neuem
Prüfdatum, damit GitHub den Zeitplan nicht wegen Untätigkeit abschaltet).
"""
import json
import os
import re
import sys
from datetime import datetime

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
import Kalendermodul as km  # noqa: E402
import Tabellenabrufmodul as ta  # noqa: E402

ZIEL = os.path.join(os.path.dirname(HIER), "live.json")


def jetzt_berlin():
    return km.utc_nach_berlin(datetime.utcnow()).replace(microsecond=0)


def tabellen(quellen, verein, stand):
    erg, fehler = {}, []
    for q in quellen:
        quelle, tabelle, text = ta.abrufen(q)
        if tabelle is None:
            fehler.append(f"Tabelle {q['url']}: {text}")
            continue
        zeilen = []
        for z in tabelle["zeilen"]:
            eigen = ta.ist_eigen(z["name"], verein)
            name = ta.voller_name(z["name"], verein) if eigen else z["name"]
            zeilen.append({"platz": z["platz"], "name": name, "eigen": eigen,
                           "mannschaft": (q.get("mannschaft") or ta.nummer_aus_name(name)) if eigen else None,
                           "beg": z["beg"], "spiele": z["spiele"], "punkte": z["punkte"], "zeichen": z["zeichen"]})
        s = erg.setdefault(tabelle["saison"], {"stand": stand, "ligen": []})
        s["ligen"].append({"liga": tabelle["liga"], "zeilen": zeilen})
    return erg, fehler


def spiele(abos, verein):
    erg, fehler = [], []
    for a in abos:
        _id, ereignisse, text = km.abo_abrufen({"id": a["name"], "url": a["url"]})
        if ereignisse is None:
            fehler.append(f"Spielplan {a['name']}: {text}")
            continue
        for e in ereignisse:
            titel = re.sub(r"\s+vs\.?\s+", " – ", e.get("titel", ""))
            teile = [t.strip() for t in re.split(r"\s+[–-]\s+", titel) if t.strip()]
            heim, gegner = None, ""
            if len(teile) == 2:
                a_eigen, b_eigen = (ta.ist_eigen(t, verein) for t in teile)
                if a_eigen != b_eigen:
                    heim, gegner = a_eigen, teile[1] if a_eigen else teile[0]
            erg.append({"mannschaft": a.get("mannschaft"), "team": a["name"], "datum": e["datum"],
                        "uhrzeit": e.get("uhrzeit", ""), "ort": e.get("ort", ""), "text": e.get("text", ""),
                        "titel": ta.begegnung_voll(titel, verein), "heim": heim, "gegner": gegner})
    erg.sort(key=lambda x: (x["datum"], x["uhrzeit"], x.get("mannschaft") or 0))
    return erg, fehler


def main():
    with open(os.path.join(HIER, "quellen.json"), encoding="utf-8") as f:
        q = json.load(f)
    jetzt = jetzt_berlin()
    t, f1 = tabellen(q.get("tabellen", []), q["verein"], jetzt.date().isoformat())
    s, f2 = spiele([a for a in q.get("abos", []) if a.get("aktiv", True)], q["verein"])
    alt = {}
    if os.path.exists(ZIEL):
        with open(ZIEL, encoding="utf-8") as f:
            alt = json.load(f)
    # Fällt eine Quelle aus, bleibt ihr letzter Stand erhalten
    if not t and alt.get("tabellen"):
        t = alt["tabellen"]
    if not s and alt.get("spiele"):
        s = alt["spiele"]
    inhalt = {"tabellen": t, "spiele": s, "fehler": f1 + f2}
    # Stand der Tabellen nur ändern, wenn sich an ihnen etwas geändert hat
    for saison, tab in t.items():
        alt_tab = (alt.get("tabellen") or {}).get(saison)
        if alt_tab and alt_tab.get("ligen") == tab["ligen"]:
            tab["stand"] = alt_tab.get("stand", tab["stand"])
    geaendert = any(alt.get(k) != v for k, v in inhalt.items())
    heute = jetzt.date().isoformat()
    if not geaendert and alt.get("geprueft") == heute:
        print("Keine Änderung.")
        return
    neu = {"format": 1, "erzeugt": jetzt.isoformat() if geaendert else alt.get("erzeugt", jetzt.isoformat()),
           "geprueft": heute, "verein": q["verein"], **inhalt}
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(neu, f, ensure_ascii=False, indent=1)
    print("Geschrieben:", "geändert" if geaendert else "nur Prüfdatum", "| Fehler:", neu["fehler"] or "keine")


if __name__ == "__main__":
    main()
