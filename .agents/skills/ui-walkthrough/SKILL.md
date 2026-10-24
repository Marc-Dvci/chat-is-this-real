---
name: ui-walkthrough
description: Drive the dashboard and overlay in a real browser. Use after any UI change, before closing a milestone that touched web/, or when asked to check, capture or screenshot the UI.
---

# UI walkthrough

Green unit tests do not show that a page renders. This walkthrough is the check for the UI.

1. Start demo mode (`npm run demo`), so the run is deterministic and needs no keys.
2. `npm run test:e2e -- walkthrough`. The spec in `e2e/walkthrough.spec.ts` must:
   - visit every route (dashboard wide and at 380 px, overlay, result page, Library, Settings);
   - click every button and keyboard shortcut at least once;
   - save a screenshot at each state into `e2e/screens/<step>.png`, taken while the result should be on screen, not at the end of the step;
   - fail on any console error or `pageerror`;
   - run `@axe-core/playwright` on every route and fail on serious or critical violations.
3. **Two views agree.** At each step of a check, read the dashboard state, the overlay DOM state (from `data-state` attributes) and the database row. All three must agree.
4. Open the screenshots and look at them. Empty panels, overlapping text, cut-off verdicts, or a result that flashes and disappears are failures even when the spec passes.
5. Close the browser in a `finally` block. Use `workers: 1` locally.
6. Never open a visible browser window on Marc's desktop without asking. Headless is the default.
