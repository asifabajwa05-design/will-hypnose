# Familien-Fitness-Tracker

Privater Fitness-Tracker für die Familie. Keine externen Pakete nötig, nur Node.js (ab Version 18).

## Starten
    cd fitness-tracker
    node server.js          # http://localhost:3000   (anderer Port: PORT=8080 node server.js)

Beim ersten Aufruf wird das **Admin-Konto** angelegt. Danach legt der Admin im Tab „Admin"
die Familienmitglieder an (Benutzername + Startpasswort). Daten liegen in `data/db.json` (nicht im Git).

## Funktionen
- Login für jeden, Rollen **Admin** / **Mitglied**; Admin verwaltet Zugänge, Passwörter, Rollen
- Schritte: Handy-Sensor-Zähler (nur bei geöffneter Seite) oder manuelle Eingabe, Tagesziel-Ring
- Kalorien (Schritte + Training), Strecke, 12 Workout-Arten (MET-Werte)
- Familie: Tagesschritte aller Mitglieder + Wochensumme, Verlauf der letzten 14 Tage

## Hinweis zum Betrieb
Für Zugriff von unterwegs braucht der Server HTTPS (z. B. Reverse-Proxy/Tunnel); der Handy-Bewegungssensor
funktioniert im Browser nur über HTTPS (oder localhost).
