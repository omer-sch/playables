# Venue playables — build source (12 Nov 2026)
The live HTML files in `venue/vote/` hold everything inline. These files are how the Nov builds were made:
- `engine_new.js`: the engine (endings `rating` = hidden-score 5-Star card, `early` = client end card after node `earlyAfter`).
- `rating.css`: styles for the endings and the review upgrades.
- `assemble.py`: takes the Oct vote builds (git history: `venue/vote/*.html` before commit 4c4199b), swaps the engine/config, writes `Venue_Oct26_P_<Room>_{Full,EarlyClick}.html`.
- `qa_play.js`: Playwright playthrough + layout checks (`node qa_play.js <html> <W> <H> <outPrefix> 1`).
Published: `<event>.html` = Full, `<event>-early.html` = EarlyClick.
