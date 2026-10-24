# Twitch recordings

`app-token.json` and `app-validation.json` were recorded from Twitch on 24 October 2026
using the client-credentials flow and the token-validation endpoint. The access token is
replaced with a fixed placeholder and the client ID is pseudonymized. Remaining fields
retain the service's recorded values. App validation returned `scopes: null` and omitted
the user login and user ID.

The live probe adds scrubbed EventSub frame recordings after the scripted stream check.
Raw recordings and credentials stay under the ignored `data/` directory.

`probe-1792847799669.jsonl` records the M4 scripted reply and deletion. The live core probe
created a request, sent its acknowledgement, deleted the scripted source and received the
real moderation event. Frame structure and badge semantics are retained; account and session
identifiers are pseudonymized. The regression test enters through `EventSubWs.receive`.
