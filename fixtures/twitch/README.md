# Twitch recordings

`app-token.json` and `app-validation.json` were recorded from Twitch on 24 October 2026
using the client-credentials flow and the token-validation endpoint. The access token is
replaced with a fixed placeholder and the client ID is pseudonymized. Remaining fields
retain the service's recorded values. App validation returned `scopes: null` and omitted
the user login and user ID.

The live probe adds scrubbed EventSub frame recordings after the scripted stream check.
Raw recordings and credentials stay under the ignored `data/` directory.
