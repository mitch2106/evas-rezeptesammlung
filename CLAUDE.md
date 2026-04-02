# Evas Rezeptesammlung

## Überblick
Rezepte-PWA für Mobilgeräte. Rezepte speichern, suchen, Einkaufsliste, Wochenplaner, Rezept-Scan per Foto.

## Architektur
- **`docs/`** = Das gesamte Frontend. Wird von GitHub Pages ausgeliefert und spricht direkt mit Supabase.
- **`server.js`** = Express-Server für lokale Entwicklung. Liefert `docs/` aus und bietet eine REST-API mit SQLite-Fallback.

## Tech-Stack
- Frontend: Vanilla JS (IIFE-Pattern), HTML5, CSS3 mit Custom Properties
- Backend (lokal): Node.js + Express, SQLite via sql.js
- Datenbank (live): Supabase (PostgreSQL)
- Rezept-Scan: Claude Sonnet via Supabase Edge Function (`scan-recipe`)
- Deployment: GitHub Pages (docs/), Supabase für DB + Edge Functions
- PWA: Service Worker (`evas-rezepte-v2`), Manifest, Offline-Support

## Wichtige Befehle
```
npm install          # Dependencies installieren
npm start            # Lokaler Server (SQLite) auf localhost:3000
```

## Externe Dienste
- **Supabase**: Datenbank + Edge Functions (Projekt: yiczkjeuupwazjlfzvxk)
- **Anthropic API**: Rezept-Scan via Edge Function `scan-recipe` (Claude Sonnet)
- **GitHub Pages**: Hosting der docs/-Version

## Datenbank (4 Tabellen)
- `users` – id, name (Cookie-basiert, keine Auth)
- `recipes` – title, category, portions, tags (JSON), ingredients, preparation, image (base64), is_favorite
- `shopping_items` – text, category, checked, optional recipe_id
- `planner_entries` – recipe_id, date

## Code-Konventionen
- Deutsch: UI-Texte, Fehlermeldungen, Kommentare
- DOM-Helper: `$()` und `$$()` statt querySelector
- State: Ein globales `state`-Objekt
- Async/Await für alle DB-Operationen
- CSS: Mobile-first, Dark Mode via `[data-theme="dark"]`

## Deployment
- **Push auf `master`** → GitHub Pages aktualisiert `docs/` automatisch (1-2 Min)
- **Edge Function `scan-recipe`** liegt NUR auf Supabase (Dashboard → Edge Functions → scan-recipe → Code). Sie ist NICHT im Repo.
- **API-Keys**: Lokal in `.env`, auf Supabase unter Edge Function Secrets (`ANTHROPIC_API_KEY`)

## Bekannte Besonderheiten
- Samsung/Chrome: Scroll-Workaround mit `forceRepaint()`
- Service Worker Cache-Name (`evas-rezepte-v2`) muss manuell hochgezählt werden für Cache-Busting
- Bilder werden vor dem Scan auf max 1200px komprimiert
- Keine Authentifizierung – User-Zuordnung nur per Cookie
