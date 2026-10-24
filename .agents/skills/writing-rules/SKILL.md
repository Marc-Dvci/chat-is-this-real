---
name: writing-rules
description: Style and content rules for README.md, docs/, CAPTIONS.md, commit messages and every string a user or viewer reads. Use when writing or editing any of them.
---

# Writing rules

## Content
- State what the project does and what was measured. Every claim maps to code and a test; list it in the README's claims table (claim, file, test).
- Every number comes from `eval/results/` or a command output, with its count and split.
- Keep limits to one short section in the README.
- Name OpenAI Codex as the build tool where it applies (README "Built with Codex", `docs/BUILT_WITH_CODEX.md`). Name no other AI tool as a build tool.
- Document the runtime model provider (Qwen on Alibaba Cloud Model Studio) as a dependency, with the model ids and measured latency from `docs/models.md`.
- Never name unrelated projects, real streamers or real people. The demo accounts are the only usernames.
- No political examples anywhere.

## Style
- English. First person singular in prose written for Marc.
- Short declarative sentences. Value first.
- No em dashes. None of these constructions or words: "it's not X, it's Y", "genuinely", "quietly", "honest".
- Commit messages: one or two generic words, for example "overlay" or "final verifications". No trailers.

## Chat and overlay strings
- Chat messages follow the exact formats in section 12 of `../02_BUILD_PLAN.md`, at most 500 characters.
- Overlay text: verdict labels are REAL, NOT REAL, MISSING CONTEXT, UNCONFIRMED. VOD results read "IT'S IN THE VOD".

## Images for Devpost
- Use hyphens in file names, never underscores.
- Gallery captions go in `CAPTIONS.md`, at most 140 characters each.
