---
name: deploy
description: Änderungen committen, pushen und Deployment prüfen
allowed-tools: Bash(git:*), Bash(curl:*)
---

Führe folgende Schritte durch:

1. Zeige `git status` und `git diff --stat` – fasse die Änderungen in 1-2 Sätzen zusammen
2. Frage den User nach einer kurzen Beschreibung, was geändert wurde (falls nicht offensichtlich)
3. Erstelle einen Commit mit Conventional-Commit-Nachricht (deutsch ist ok)
4. Pushe auf `master`
5. Warte 5 Sekunden, dann prüfe ob GitHub Pages das Deployment gestartet hat: `curl -s -o /dev/null -w "%{http_code}" https://mitch2106.github.io/evas-rezeptesammlung/`
6. Melde dem User: "Deployed. Auf dem Handy Seite neu laden (ggf. Cache leeren)."

Falls keine Änderungen vorhanden sind, sage das und brich ab.
