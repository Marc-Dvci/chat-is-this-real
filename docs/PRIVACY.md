# Local data

Chat history is disabled by default. When enabled, the local SQLite database stores chat
text, viewer identifiers, badges, observed times and stream identifiers for the configured
retention period. `CHAT_RETENTION_DAYS` supplies the initial retention setting. Saved dashboard
settings take precedence. Purging runs at startup and daily.

The connected chat view keeps up to 200 recent messages in memory while history is off.
Disconnecting clears this memory buffer. It is not written as general history.
An explicitly requested check retains its selected source messages even when general history is off.
Deleting a message clears its stored text and cancels requests that copied the message or
used it as context. A user clear removes that viewer's stored text. A stream clear removes
that stream's buffer. Tombstones prevent a late replay from restoring removed text.

Use Settings to purge a viewer, or run `npm run purge -- --user <login>` locally. The operation
clears stored text and copied request text. It does not delete messages from Twitch itself.
The optional live-test deletion permission is used only for messages sent by that test.

Voting stores a viewer identifier and one choice per check to prevent duplicate calls.
Points are derived from those choices. Purging a viewer removes their votes and points.
Round records expire with their retained check requests. Names remain in the private desk;
the overlay leaderboard shows anonymous ranks.

The dashboard binds to loopback. Mutations require its session header and a matching origin.
The history API does not permit a foreign host or expose files from `data/`.

Credentials, OAuth grants, raw service captures and recordings remain in the ignored `data/`
directory or `.env`. Probe wire captures can contain original source text and audio. They
are local diagnostic artifacts. Committed Twitch fixtures contain demo account aliases.

Runtime inference uses Qwen on Alibaba Cloud Model Studio. The [provider policy](https://www.alibabacloud.com/help/en/model-studio/data-retention-policy)
sets ordinary inference retention at up to 30 days, with legal and security exceptions.
Stateful features can retain data until deleted. Text checks send the
claim, selected context and retrieved source text. Transcription sends audio chunks. Paid
provider search is disabled unless explicitly enabled after approval; replay mode uses
recorded source URLs and labels simulated discovery.
