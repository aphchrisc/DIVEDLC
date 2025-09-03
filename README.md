DIVE Data Learning Cohort — Enhanced Index
=========================================

Overview
- Static, framework-free index for the DIVE Cohort.
- Features: search, filters, watchlist/watched (cookies + localStorage), per-section progress, notes + export, keyboard navigation, dark mode, resources strips, and study planning.

Structure
- index.html — entry page
- assets/css/style.css — design tokens and styles
- assets/js/app.js — client logic
- assets/data/videos.json — sections and videos
- assets/data/resources.json — optional resources per section
- assets/resources/*.md — internal resource docs

Local Development
Open `index.html` directly or serve with a static server (recommended) to ensure fetch paths resolve.

GitHub Pages Deployment
1. Commit and push to your repository.
2. Enable GitHub Pages in Settings → Pages. Choose the branch and root folder.
3. Access your site at the provided URL (e.g., https://<org>.github.io/<repo>/).

Notes
- All assets fetch via relative paths, safe for project pages.
- User state persists in cookies (180 days) and localStorage.
- To update data, edit `assets/data/videos.json` and optionally `assets/data/resources.json`.

