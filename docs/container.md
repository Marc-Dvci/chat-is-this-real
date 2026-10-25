# Container

I package the server and built web assets together. The host audio companion stays outside
the container, where it can read the selected audio device. The image includes FFmpeg for
uploaded media imports and runs as the unprivileged `node` user.

The official Node LTS image is pinned by version and manifest digest. The builder installs
locked dependencies, verifies the recorded demo during the web build and removes development
dependencies. The runtime contains compiled code, web assets, recorded fixtures and a writable
data directory. `.dockerignore` excludes credentials, local databases, recordings and caches.

```sh
docker build --tag chat-is-this-real .
docker run --rm --publish 127.0.0.1:4747:4747 chat-is-this-real node dist/server/index.js --demo
```

Open `http://127.0.0.1:4747/`. The demo uses recorded results and makes no model calls or
Twitch posts. Keep the host publication bound to `127.0.0.1` as shown. The image's
`DASHBOARD_HOST=0.0.0.0` setting enables the container's internal interface; an ordinary
host launch still binds to loopback by default. Host and origin checks remain enabled.

For a connected run, complete the local Twitch setup first. Pass `.env` with `--env-file`
and mount its existing `data/` directory at `/app/data`; then use the image's default
command. The mounted directory must be writable by the container's `node` user. Run
`npm run companion` on the host against the published loopback address. Keys are passed
at runtime and are excluded from the build context.

CI builds the actual image, starts its recorded demo, checks the health endpoint, web
asset references and multilingual desk data, and verifies that FFmpeg is available.
The local Docker daemon was not running during packaging, so the image acceptance runs
on the CI Linux runner. The CLI resolved the pinned upstream manifest without starting
Docker Desktop.

The image health check polls the local health endpoint. SIGINT and SIGTERM close the app,
event streams and active work. Persistent connected runs should mount `/app/data`.
