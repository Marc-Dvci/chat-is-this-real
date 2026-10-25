# Final engineering audit

The [release report](../eval/results/release-validation.json) records 124 passing unit tests across 30 files, 6 passing browser checks and the command timings. Types, lint, the production build, Workers dry-run and locked-data verification passed. The evaluated source still matches [the freeze](../eval/FREEZE.json).

## Review evidence

[The audit register](review-findings.json) lists 16 concrete findings addressed across the build, with code and regression evidence. These are documented manual build audits. Milestone PRs requested Codex reviews; a request is separate from an observed bot review.

The meaningful mutation probe reverted the short-token passage fix, observed its recorded-source regression fail and restored the exact passing bytes. [The original report](../eval/results/hardening-mutation-2026-10-25T08-49-26-634Z.json) retains both exit codes and the source hash.

## Entry points and publication

Recorded Twitch fixtures enter through EventSubWs; HTTP mutations enter through Fastify inject. Browser checks use the actual local app and actual Workers runtime. The red-team suite covers instruction strings, foreign origins and hosts, overlong input and loaded-secret fragments. Publication guards exercise the real publisher through recorded WebSocket routing and SQL outbox reservations.

The real-browser walkthrough covers wide and 380 px layouts, source pages, history, captions, Settings, overlay approval and vote timing, and desk/overlay/SQLite agreement. The static demo check exercises its real shared browser SQLite worker and verifies no backend or external requests. Serious and critical accessibility violations fail the walkthrough. Captures were reviewed for layout and text clipping.

## Assets and repository

The artifact check verifies all 12 gallery PNG dimensions and caption lengths, local README links, final film streams, subtitle presence, duration, encoded-audio level and engine fingerprint. The film digest is `aeada15137c3ae08cdcb95462508990dc49fa10ad2cdfa48bfb3626785df5e13`. Its current cut is caption-led; Marc’s narration pass is described in the handoff.

Gitleaks 8.30.1, verified against the official release digest, scanned all Git refs with redacted output and found 0 secrets. A separate candidate-file audit checks fragments of loaded local credentials. The commit-message audit found 0 co-author trailers. CI repeats the committed-source secret scan and builds/runs the actual Docker image.

[The timed clean-clone check](quickstart-measurement.md) records installation, production build and compiled demo readiness separately. [The handoff](../HANDOFF.md) keeps account publication choices and the remaining human acceptance in one place.
