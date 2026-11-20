# Hosting mit HTTPS (Fly.io) – Schritt für Schritt

Ergebnis: Der Tracker läuft rund um die Uhr unter `https://DEIN-NAME.fly.dev`, auch wenn dein PC aus ist.
Der Handy-Schrittzähler funktioniert dann, weil die Adresse HTTPS hat.
Kosten: ca. 2–4 € im Monat (kleinste Maschine + 1 GB Speicher). Fly.io verlangt eine Zahlungskarte.

## Einmalig
1. Konto anlegen: https://fly.io/app/sign-up
2. Windows-Terminal (PowerShell) öffnen und das Fly-Programm installieren:
       iwr https://fly.io/install.ps1 -useb | iex
   Danach das Fenster schließen und ein neues PowerShell-Fenster öffnen.
3. Anmelden:  `fly auth login`

## Deployen (im Ordner fitness-tracker)
1. In `fly.toml` den Namen in der ersten Zeile ändern (`app = "..."`), nur Kleinbuchstaben, Zahlen, Bindestriche.
2. App anlegen:        `fly apps create DEIN-NAME`
3. Datenspeicher:      `fly volumes create fitness_data --size 1 --region fra`
4. Hochladen & starten: `fly deploy --ha=false`
5. Öffnen:             `fly apps open`   → Admin-Konto neu anlegen (die Daten vom PC werden nicht mitgenommen).

## Aktualisieren
Neuen Code holen, dann im Ordner erneut `fly deploy --ha=false`. Die Daten bleiben erhalten.

## Daten
Liegen auf dem Fly-Volume unter /data/db.json. Fly sichert Volumes täglich (5 Tage). Eigene Kopie:
    fly ssh sftp get /data/db.json db-backup.json

## Gratis-Alternative: Cloudflare Tunnel (dein PC muss laufen)
HTTPS-Adresse für den lokalen Tracker ohne Server-Miete: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
(`cloudflared tunnel --url http://localhost:3000` gibt dir sofort eine temporäre https-Adresse zum Testen.)
