DIVE Data Learning Cohort — Enhanced Index
==========================================

Overview

- Static, framework-free index for the DIVE Cohort.
- Features: search, filters, watchlist/watched (cookies + localStorage), per‑section progress, notes + export, keyboard navigation, dark mode (default On), resource strips, and optional study planning (hidden by default).

Structure

- index.html — entry page
- assets/css/style.css — design tokens and styles
- assets/js/app.js — client logic
- assets/data/videos.json — sections and videos
- assets/data/resources.json — optional resources per section
- assets/resources/*.md — internal resource docs

Local Development

You can open `index.html` directly, but using a tiny static server is recommended so JSON fetches always work.

Quick start (macOS/Linux):

```bash
cd /path/to/DIVEDLC
python3 -m http.server 8000
# Visit http://localhost:8000
```

Notes on caching:

- Data fetches append a version query (assets/js/app.js -> VERSION) to bust caches when data changes.
- If you edit JSON and don’t see updates, bump VERSION in `assets/js/app.js` or hard refresh.

GitHub Pages Deployment

1. Commit and push to your repository.
2. Enable GitHub Pages in Settings → Pages. Choose the branch and root folder.
3. Access your site at the provided URL (for example, <https://example-org.github.io/example-repo/>).

Notes

- All assets fetch via relative paths, safe for project pages.
- User state persists in localStorage and mirrored to cookies (180 days) for GitHub Pages continuity:
  - Watchlist: `dive:watchlist` + cookie `dive_watchlist`
  - Watched: `dive:watched` + cookie `dive_watched`
  - Notes: `dive:notes:<id>` mirrored into chunked cookies `dive_notes_*`
  - Study plan prefs: `dive:study` + cookie `dive_study` (feature hidden by default)
- Dark mode: Default On. Toggle in the header updates `dive:theme` and the `data-theme` attribute.
- Resources: Section-level resource chips appear under each section title.
  - Same-origin links are treated as downloads (download attribute, no new tab).
  - External links open in a new tab and receive an external indicator.
- Playlists: If a link is a YouTube playlist, the card shows a “Show videos” toggle and a “Start playlist” link.

Data Schema

- `assets/data/videos.json`

```json
{
  "sections": [
    {
      "code": "A",
      "title": "Framing & Scoping",
      "items": [
        {
          "title": "Why framing matters",
          "href": "https://…",
          "channel": "Channel Name",
          "description": "Short blurb"
        }
      ]
    }
  ]
}
```

- `assets/data/resources.json`

```json
{
  "A": [ { "title": "Checklist", "href": "assets/resources/dashboard-accessibility-checklist.md" } ],
  "B": [ { "title": "Template",  "href": "assets/resources/problem-statement-template.md" } ]
}
```

Maintenance

- After adding videos/resources, bump `VERSION` near the top of `assets/js/app.js` to invalidate caches.
- Keep channel names consistent for better filtering UX.
- Study plan UI is feature-flagged; set `ENABLE_STUDY_PLAN = true` in `app.js` to show it.

