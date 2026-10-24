# Evaluation data

The [integrity audit](../eval/results/ground-truth-integrity.json) records the authored claim
mix, split sizes, transcript segments and VOD question counts. Factual labels reference
documentation, publisher pages and the official community wiki. Opposite claims about the same fact stay in the
same split. Related claims can share source pages, so this small corpus does not establish
independent topic generalization.

Reference excerpts were matched against captured source text during authorship. The Terraria
item references and the water-pressure reference use bounded primary-page excerpts observed
through the assistant web service; direct HTTP extraction did not expose their text. Those
cases retain that limitation in their notes. Full private captures stay under `data/`.

The VOD transcript comes from the original system narration used in the real prerecorded
Twitch test stream. It does not measure human speech recognition. Expected windows come
from the prepared outline and the measured archive alignment. The initial source speech
that preceded the archive was removed, and first-segment word timings were rebased.
The source manifest records processed chunks, silence decisions and model usage.

`eval/LOCK.md` and `eval/lock.json` bind the data to its committed bytes. `npm run eval:verify`
checks file hashes, the Markdown manifest and the committed version. Both evaluation suites
run this check before invoking an engine. CI fetches history so it can verify the data commit.

The user's manual spot-check is deferred until the end. [The review sheet](EVAL_REVIEW.md)
contains dev items only. Heldout labels are reserved for the single final M11 run. A correction
creates a replacement item and retires the old ID; it does not edit a locked record.
