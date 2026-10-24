# Review desk

I run `npm run demo` for the recorded demo. It opens a local review desk at
`http://localhost:4747/`. The chat is scripted. The claim results, source excerpts,
transcript and clip come from the recorded engine and Twitch runs. Demo mode does not
load `.env`, call a model or send to Twitch.

I select a message to check it, find it in the transcript, or show it without a username.
The Viewer panel joins selected messages in time order. Jump to context opens the
surrounding stored conversation. Removed text cannot become a new check or presentation.

I review the explanation and literal source excerpts before choosing Show on stream.
Sensitive claims require a second confirmation. Copy link opens a local result preview.
Public publishing is connected in the public-pages milestone. Post to chat in demo mode
adds a labelled scripted reply to the local conversation.

I add `/overlay` as a 1920 × 1080 OBS Browser Source. I add the dashboard URL as a Custom
Browser Dock. The narrow layout has Chat, Checks and Viewer tabs. Keyboard controls are
listed behind the shortcuts button and pause while I type.

I import captions or media from Library after choosing one of my own past broadcasts.
Demo mode accepts captions without inference. In connected mode, the companion takes its
input and language from saved Settings. I restart it after changing capture settings.
The status strip shows the age of its latest accepted audio chunk, including silence.

I verify the routes through Fastify `inject` and replay recorded Twitch frames through
the WebSocket class. The headless Playwright walkthrough covers each screen, the controls,
caption import, public preview and 380 px dock. It saves its actual states in
`e2e/screens/`, checks the console, and runs axe on every route. I inspect those captures
before closing the milestone.
