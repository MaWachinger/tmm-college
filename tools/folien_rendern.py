# -*- coding: utf-8 -*-
"""
Folien fuer TMM College rendern: PDF -> JPG in gewuenschter Breite.

Vorbereitung (einmalig):
    pip install pymupdf

Benutzung:
    python folien_rendern.py <ordner-mit-pdfs>
    python folien_rendern.py <ordner-mit-pdfs> --breite 1900 --qualitaet 80

Erwartet PDFs, deren Name mit der Modulnummer beginnt, z. B.
"Modul01_BIM-Methode_v3.pdf" oder "Modul01.pdf". Legt daneben einen
Ordner "render" an, darin je Modul ein Unterordner:

    render/M01/01.jpg, 02.jpg, ...
    render/M02/01.jpg, ...

Diese Unterordner laedst du im Supabase Storage in den Bucket
"module-slides" hoch. WICHTIG: den alten Inhalt von M01 usw. vorher
loeschen -- der Folienbetrachter zeigt alles an, was im Ordner liegt,
alte Dateien wuerden sonst als zusaetzliche Folien auftauchen.
"""

import argparse
import os
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "PyMuPDF fehlt. Bitte einmalig ausfuehren:\n\n    pip install pymupdf\n"
    )


def modul_kennung(dateiname):
    """'Modul01_BIM-Methode_v3.pdf' -> 'M01'. Ohne Treffer: None."""
    m = re.search(r"(?:modul|m)\s*_?-?(\d{1,2})", dateiname, re.IGNORECASE)
    if not m:
        return None
    return "M%02d" % int(m.group(1))


def render(pdf_pfad, ziel_ordner, breite, qualitaet):
    doc = fitz.open(pdf_pfad)
    if not os.path.isdir(ziel_ordner):
        os.makedirs(ziel_ordner)

    geschrieben = []
    for i, seite in enumerate(doc, start=1):
        # Zoom so waehlen, dass die Seite exakt die gewuenschte Pixelbreite bekommt.
        zoom = breite / seite.rect.width
        pix = seite.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        ziel = os.path.join(ziel_ordner, "%02d.jpg" % i)
        pix.pil_save(ziel, format="JPEG", quality=qualitaet, optimize=True)
        geschrieben.append((ziel, pix.width, pix.height))

    doc.close()
    return geschrieben


def main():
    p = argparse.ArgumentParser(description="PDF-Folien zu JPG rendern.")
    p.add_argument("ordner", help="Ordner mit den PDF-Dateien")
    p.add_argument("--breite", type=int, default=1900, help="Pixelbreite (Standard 1900)")
    p.add_argument("--qualitaet", type=int, default=80, help="JPEG-Qualitaet 1-95 (Standard 80)")
    args = p.parse_args()

    if not os.path.isdir(args.ordner):
        sys.exit("Ordner nicht gefunden: %s" % args.ordner)

    pdfs = sorted(f for f in os.listdir(args.ordner) if f.lower().endswith(".pdf"))
    if not pdfs:
        sys.exit("Keine PDF-Dateien in: %s" % args.ordner)

    ziel_wurzel = os.path.join(args.ordner, "render")
    gesamt_folien = 0
    gesamt_bytes = 0
    ohne_kennung = []

    for pdf in pdfs:
        kennung = modul_kennung(pdf)
        if not kennung:
            ohne_kennung.append(pdf)
            continue

        dateien = render(
            os.path.join(args.ordner, pdf),
            os.path.join(ziel_wurzel, kennung),
            args.breite,
            args.qualitaet,
        )
        groesse = sum(os.path.getsize(d[0]) for d in dateien)
        gesamt_folien += len(dateien)
        gesamt_bytes += groesse

        masse = "%dx%d" % (dateien[0][1], dateien[0][2]) if dateien else "-"
        print(
            "%s  %2d Folien  %s  %5.1f MB   <- %s"
            % (kennung, len(dateien), masse, groesse / 1048576.0, pdf)
        )

    print("-" * 60)
    print(
        "Fertig: %d Folien, %.1f MB gesamt.\nLiegt in: %s"
        % (gesamt_folien, gesamt_bytes / 1048576.0, ziel_wurzel)
    )

    if ohne_kennung:
        print("\nUebersprungen, weil keine Modulnummer im Namen erkennbar war:")
        for f in ohne_kennung:
            print("  - %s" % f)
        print("Bitte umbenennen, z. B. 'Modul03_....pdf', und erneut ausfuehren.")


if __name__ == "__main__":
    main()
