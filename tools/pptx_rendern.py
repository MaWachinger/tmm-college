# -*- coding: utf-8 -*-
"""
PPTX direkt aus PowerPoint heraus zu JPG rendern (PowerPoints eigener Renderer,
also layouttreu). Zwischenschritt PNG, damit die JPEG-Qualitaet steuerbar bleibt --
PowerPoint gibt beim JPG-Export keine Qualitaet her.

    pip install pywin32 pillow
    python pptx_rendern.py "<ordner>" [--breite 1900] [--qualitaet 80]

Ergebnis: <ordner>/render/M01/01.jpg, 02.jpg, ...
"""

import argparse
import os
import re
import shutil
import sys
import tempfile

import win32com.client
from PIL import Image

PPT_APP = "PowerPoint.Application"


def modul_kennung(dateiname):
    m = re.search(r"(?:modul|m)\s*_?-?(\d{1,2})", dateiname, re.IGNORECASE)
    return "M%02d" % int(m.group(1)) if m else None


def rendern(app, pptx, ziel_ordner, breite, qualitaet, tmp_wurzel):
    pres = app.Presentations.Open(pptx, ReadOnly=True, WithWindow=False)
    try:
        # Seitenverhaeltnis aus der Foliengroesse (Angabe in Punkt).
        hoehe = int(round(breite * pres.PageSetup.SlideHeight / pres.PageSetup.SlideWidth))

        if os.path.isdir(ziel_ordner):
            shutil.rmtree(ziel_ordner)
        os.makedirs(ziel_ordner)

        tmp = tempfile.mkdtemp(dir=tmp_wurzel)
        ergebnis = []
        try:
            for i in range(1, pres.Slides.Count + 1):
                png = os.path.join(tmp, "%02d.png" % i)
                pres.Slides(i).Export(png, "PNG", breite, hoehe)
                ziel = os.path.join(ziel_ordner, "%02d.jpg" % i)
                with Image.open(png) as im:
                    im.convert("RGB").save(
                        ziel, "JPEG", quality=qualitaet, optimize=True, progressive=True
                    )
                os.remove(png)
                ergebnis.append(ziel)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        return ergebnis, breite, hoehe
    finally:
        pres.Close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("ordner")
    p.add_argument("--breite", type=int, default=1900)
    p.add_argument("--qualitaet", type=int, default=80)
    args = p.parse_args()

    ordner = os.path.abspath(args.ordner)
    if not os.path.isdir(ordner):
        sys.exit("Ordner nicht gefunden: %s" % ordner)

    pptx_dateien = sorted(
        f
        for f in os.listdir(ordner)
        if f.lower().endswith((".pptx", ".ppt")) and not f.startswith("~$")
    )
    if not pptx_dateien:
        sys.exit("Keine PPTX in: %s" % ordner)

    ziel_wurzel = os.path.join(ordner, "render")
    # Temporaere PNG bewusst NICHT in den SharePoint-Ordner legen.
    tmp_wurzel = tempfile.gettempdir()

    app = win32com.client.Dispatch(PPT_APP)
    gesamt_folien = 0
    gesamt_bytes = 0
    uebersprungen = []

    try:
        for datei in pptx_dateien:
            kennung = modul_kennung(datei)
            if not kennung:
                uebersprungen.append(datei)
                continue

            dateien, w, h = rendern(
                app,
                os.path.join(ordner, datei),
                os.path.join(ziel_wurzel, kennung),
                args.breite,
                args.qualitaet,
                tmp_wurzel,
            )
            groesse = sum(os.path.getsize(d) for d in dateien)
            gesamt_folien += len(dateien)
            gesamt_bytes += groesse
            print(
                "%s  %2d Folien  %dx%d  %5.1f MB  (%3d KB/Folie)  <- %s"
                % (
                    kennung,
                    len(dateien),
                    w,
                    h,
                    groesse / 1048576.0,
                    groesse / max(1, len(dateien)) / 1024,
                    datei,
                )
            )
    finally:
        app.Quit()

    print("-" * 74)
    print("Fertig: %d Folien, %.1f MB." % (gesamt_folien, gesamt_bytes / 1048576.0))
    print("Liegt in: %s" % ziel_wurzel)
    if uebersprungen:
        print("\nOhne erkennbare Modulnummer uebersprungen:")
        for f in uebersprungen:
            print("  - %s" % f)


if __name__ == "__main__":
    main()
