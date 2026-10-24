# Search replay

`probe.json` contains primary-page URLs selected from real assistant web searches at its
recorded time. Raw search output is retained privately under `data/search-replay/`.
The source lists simulate search discovery for the exact listed claims. They are not
Model Studio search responses and contain no model verdicts or invented source excerpts.

`--search-mode replay` fetches those pages and sends their text to the real configured
judge models. An unmatched claim gets no sources. Paid provider search is disabled by
default in the client, independently of the probe's mode.

`dev.json` supports the authored dev evaluation using assistant search results curated with
knowledge of reference pages. This isolates classification and evidence judging from search
ranking. A bounded historical publisher excerpt is marked `recorded_render` and may be used
when direct extraction returns no readable text. The engine refuses that fallback for
time-sensitive claims. The item count is reported by the evaluation; heldout items are absent.
