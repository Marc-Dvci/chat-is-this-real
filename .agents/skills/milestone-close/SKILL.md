---
name: milestone-close
description: Close a build milestone. Use when a milestone's work is done, or when asked to wrap up, commit, open the PR or log the milestone.
---

# Close a milestone

Run these steps in order. Stop at the first failure, fix it, and restart from step 1.

1. `npm run typecheck`, `npm run lint`, `npm test`. When the milestone touched UI, also run `npm run test:e2e`.
2. Run every acceptance check listed for this milestone in `../02_BUILD_PLAN.md`. Run each one; do not reason that it would pass.
3. If the milestone has a live check (a stream, a model call), ask Marc to start what it needs. Record the observed result, not the expected one.
4. Review the diff against `main` using the "Code Review Rules" in `AGENTS.md`. Fix every finding. Then tell Marc the milestone is ready for `/review`.
5. Grep the diff for secrets, `.env` values, real usernames other than the demo accounts, and names of unrelated projects. There must be none.
6. Append one row to `docs/BUILT_WITH_CODEX.md`:
   `| M<n> | <what was built, one line> | <tests added> | <review findings fixed> | <live check result> |`
7. Commit on branch `m<n>-<slug>` with a short generic message, for example "eventsub client" or "overlay". Add no trailers.
8. `git push -u origin <branch>`, then `gh pr create --fill --base main`, then `gh pr comment --body "@codex review"`.
9. When Marc confirms the review is addressed, merge with `gh pr merge --merge --delete-branch`, then `git checkout main && git pull`.
