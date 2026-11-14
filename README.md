# FRIDAY — Personal AI Assistant

A JARVIS-style, voice-first AI assistant. Black HUD interface with an animated robot face — no chat box, no buttons. Just talk.

## Features
- **Wake word**: say "Friday" — it auto-detects your voice and answers by voice. No typing.
- **Brain**: Google Gemini (Google AI Studio API key)
- **Voice**: ElevenLabs API (falls back to your device voice offline)
- **Emotions**: the face shows happy / sad / angry / surprised / thinking; FRIDAY senses your emotion too
- **Honesty & safety**: never invents answers ("I'm not sure, sir"), refuses crime/harmful requests
- **Memory**: remembers facts about you ("Friday, remember my birthday is May 5"), knows its creator is **Darinmoy Kashyap**
- **Images**: ask "Friday, show me a picture of a sports car" — generates and displays it
- **Apps & web**: "open YouTube", "search quantum computing"
- **Weather**: real GPS + live weather (no key needed)
- **News**: latest headlines by voice
- **Maps/GPS**: "where am I", "navigate to the airport"
- **Files**: "Friday, read my files" — reads with your permission via file picker
- **Air gestures**: say "Friday, air gestures" — control it with your hand via camera (open palm = stop, point = listen, swipe = dismiss)
- **Offline mode**: time, date, math, memory, app opening work without internet
- **Responsive**: works on laptop, tablet, and mobile browsers

## Setup
1. Open `index.html` in any modern browser (Chrome recommended for best voice recognition).
2. On first launch, paste your keys:
   - **Gemini key** — from [Google AI Studio](https://aistudio.google.com/apikey) (required for the brain)
   - **ElevenLabs key** — from [ElevenLabs](https://elevenlabs.io) (optional; device voice used otherwise)
   - **Voice ID** — optional, any ElevenLabs voice ID
3. Keys are saved **only on your device** (localStorage). They are sent nowhere except Google/ElevenLabs APIs directly.
4. Tap anywhere once (browsers require a gesture for audio), and FRIDAY boots: *"Good morning, sir."*

To change keys later: double-tap the "FRIDAY" status text, or say "Friday, settings".

## Voice commands
| Say | Does |
|---|---|
| "Friday" | wake / listen |
| "who made you" | answers: Darinmoy Kashyap |
| "remember my ... is ..." | saves to memory |
| "what do you know about me" | recalls memory |
| "show me an image of ..." | generates + displays image |
| "open YouTube / WhatsApp / Spotify ..." | opens the app/site |
| "search ..." | Google search |
| "what's the weather" | GPS + live weather |
| "latest news" | top headlines |
| "where am I" / "navigate to X" | GPS + Google Maps |
| "read my files" | file picker, reads with permission |
| "air gestures" | hand-gesture control via camera |
| "go to sleep" / "mute" / "unmute" | power controls |

## Honest limits
- Browser localStorage holds memory (KB–MB scale), not 3 TB — for massive storage it would need a server backend.
- Browsers can open websites and supported app links; installing/controlling native apps requires a native (Android/desktop) build.
- Speech recognition needs Chrome/Edge and mic permission; it works best online (offline voice input is limited by the browser).
