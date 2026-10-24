# Search replay

`probe.json` contains primary-page URLs selected from real assistant web searches at its
recorded time. Raw search output is retained privately under `data/search-replay/`.
The source lists simulate search discovery for the exact listed claims. They are not
Model Studio search responses and contain no model verdicts or invented source excerpts.

`--search-mode replay` fetches those pages and sends their text to the real configured
judge models. An unmatched claim gets no sources. Paid provider search is disabled by
default in the client, independently of the probe's mode.
