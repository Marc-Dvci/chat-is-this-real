# Connect Twitch

Use a broadcaster account and a separate bot account. Verify both email addresses.
Enable two-factor authentication on the account that registers the application.

## Register the application

Open the [Developer Console](https://dev.twitch.tv/console/apps) with the broadcaster account.
Choose Register Your Application and enter:

| Field | Value |
|---|---|
| Name | Chat Is This Real, with a unique suffix if needed |
| OAuth Redirect URL | `http://localhost:4747/auth/callback` |
| Category | Chat Bot |
| Client Type | Confidential |

Keep one populated redirect field. An extra blank field can trigger the HTTPS validation error.
HTTP localhost callbacks are supported for local development.
See the [registration guide](https://dev.twitch.tv/docs/authentication/register-app/) and
the [redirect-field troubleshooting report](https://discuss.dev.twitch.com/t/unable-to-use-localhost-are-redirect-url-for-oauth-implicit-grant-flow/61951).

Open Manage, copy the Client ID, generate a Client Secret, and set these local values in `.env`:

```dotenv
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=
TWITCH_BOT=
```

The last two values are account logins without `@` or a URL. Keep credentials in `.env`.
In Creator Dashboard, enable Store past broadcasts and clips. Make the bot a moderator
by sending `/mod <bot-login>` yourself in the broadcaster's chat.

## Authorize the accounts

Stop the development server so setup can use port 4747. Run:

```sh
npm run setup:twitch
```

Open the first link while signed in as the broadcaster. Open the second link in a private
window signed in as the bot. The tool checks the account login, application and permissions.
It saves tokens under the ignored `data/` directory. Authorization links expire after ten minutes.
To retry after a declined or incorrect sign-in, stop setup and run it again.

## Run the live probe

Start an explicitly authorized test stream with a plain title. Let it run for at least
two minutes thirty seconds, then run:

```sh
npm run probe:twitch -- --live
```

The terminal gives a scripted viewer message and broadcaster reply. Keep that terminal open.
Clap on camera when CLAP appears. The probe captures real EventSub frames, confirms the
threaded bot reply, checks the current archive, and creates test clips.

Play the returned clip and VOD timestamp link. Find the clap's time in the VOD, then use
the finalize command printed by the probe with that time. The two confirmation flags mean
that the clip played and the timestamp link worked in your browser.

Finalization records the observed correction in `.env` and `.env.example`.
It exports the recorded protocol frames with account identifiers pseudonymized. Private raw
capture files remain under `data/probe/`. Inspect the export before committing it.

## Automated test broadcast

On Windows, `npm run record:test` renders a test recording with local speech and FFmpeg.
Authorize the extra broadcaster permissions with `npm run setup:twitch -- --automation`:
they read the stream key, set the test title and post the test command. Then:

```sh
npm run broadcast:test -- --live
npm run probe:twitch -- --live --automated
```

The encoder streams the recording to your channel. The probe posts a claim and a threaded
command, captures the EventSub frames, creates a clip and matches its decoded timecode to
the recording. Finalize with the printed `--finalize <run> --auto-align` command, which
saves the offset correction and exports the frames with account IDs replaced by aliases.
