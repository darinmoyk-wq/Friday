/* ============================================================
   FRIDAY — Personal AI Assistant
   Voice-first. No chat box. Black HUD. Robot face.
   Brain: Google Gemini | Voice: ElevenLabs (fallback: device TTS)
   ============================================================ */

"use strict";

/* ---------- CONFIG / KEYS (stored only on this device) ---------- */
const store = {
  get(k, d = null) { try { return localStorage.getItem("friday_" + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("friday_" + k, v); } catch {} },
};

const CREATOR = "Darinmoy Kashyap";

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const faceEl = $("face"), statusEl = $("status");
const imageView = $("image-view"), generatedImage = $("generated-image");
const fileInput = $("file-input");

/* ============================================================
   MEMORY — everything FRIDAY knows about you
   ============================================================ */
const Memory = {
  facts: (() => { try { return JSON.parse(store.get("memory", "{}")); } catch { return {}; } })(),
  save() { store.set("memory", JSON.stringify(this.facts)); },
  remember(k, v) { this.facts[k.toLowerCase()] = v; this.save(); },
  recall(k) { return this.facts[k.toLowerCase()] ?? null; },
  summary() {
    const entries = Object.entries(this.facts);
    if (!entries.length) return "Nothing recorded yet.";
    return entries.slice(0, 40).map(([k, v]) => `${k}: ${v}`).join("; ");
  },
};
Memory.facts["creator"] = CREATOR;
Memory.facts["name"] = Memory.facts["name"] || "Friday";
Memory.save();

/* ============================================================
   FACE — emotions
   ============================================================ */
const EMOTIONS = ["neutral", "listening", "speaking", "happy", "sad", "angry", "surprised", "thinking", "sleep", "alert"];
function setFace(state) {
  if (!EMOTIONS.includes(state)) state = "neutral";
  faceEl.className = state;
}
function setStatus(text) { statusEl.textContent = text; }

/* ============================================================
   SPEECH OUTPUT — ElevenLabs, fallback to device voice
   ============================================================ */
let speaking = false;
let currentAudio = null;

async function speak(text, emotion = "speaking") {
  if (!text) return;
  stopSpeaking();
  speaking = true;
  setFace(emotion === "speaking" ? "speaking" : emotion);
  setStatus("FRIDAY");
  const clean = text.replace(/\[.*?\]/g, "").replace(/[*_#`]/g, "").trim();
  const key = store.get("elevenlabs_key");
  const voiceId = store.get("voice_id", "pNInz6obpgDQGcFmaJgB");
  if (key && navigator.onLine) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        await playAudio(blob);
        speaking = false;
        setFace("neutral");
        restartListening();
        return;
      }
    } catch (e) { /* fall through to device voice */ }
  }
  deviceSpeak(clean);
  speaking = false;
  setFace("neutral");
  restartListening();
}

function playAudio(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    currentAudio.onerror = () => resolve();
    currentAudio.play().catch(() => resolve());
  });
}

function deviceSpeak(text) {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.9;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => /en.*(male|daniel|google uk english male|alex|fred)/i.test(v.name)) ||
                        voices.find(v => v.lang.startsWith("en"));
      if (preferred) u.voice = preferred;
      u.onend = resolve; u.onerror = resolve;
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

function stopSpeaking() {
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
  try { window.speechSynthesis.cancel(); } catch {}
  speaking = false;
}

/* ============================================================
   SPEECH INPUT — always listening for "Friday"
   ============================================================ */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, listeningActive = false, wantListening = true, muted = false;

function initListening() {
  if (!Recognition) {
    setStatus("NO MIC SUPPORT");
    return;
  }
  recog = new Recognition();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = "en-US";

  recog.onstart = () => { listeningActive = true; };
  recog.onend = () => {
    listeningActive = false;
    if (wantListening) setTimeout(() => { try { recog.start(); } catch {} }, 350);
  };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      wantListening = false;
      setStatus("MIC BLOCKED");
    }
  };
  recog.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const text = result[0].transcript.trim();
      if (!text || speaking) continue;
      handleVoice(text);
    }
  };
  startListening();
}

function startListening() {
  if (!recog || muted) return;
  wantListening = true;
  if (!listeningActive) { try { recog.start(); } catch {} }
}

function restartListening() { if (!speaking) startListening(); }

function pauseListening() { wantListening = false; if (recog) { try { recog.stop(); } catch {} } }

function handleVoice(text) {
  const lower = text.toLowerCase();

  if (!awake) {
    const m = lower.match(/\b(friday|friday,|hey friday|ok friday|hi friday)\b(.*)/);
    if (m) {
      awake = true;
      setFace("alert");
      const rest = (m[2] || "").replace(/^[,.!?\s]+/, "");
      if (rest.length > 2) {
        awake = false;
        process(rest);
      } else {
        setStatus("LISTENING");
        speak("Yes sir?", "alert");
        setTimeout(() => { awake = false; }, 12000);
      }
    }
    return;
  }
  awake = false;
  process(text);
}
let awake = false;

/* ============================================================
   BRAIN — Gemini, with offline fallback
   ============================================================ */
const SYSTEM_PROMPT = () => `You are FRIDAY, a highly capable personal AI assistant (like JARVIS from Iron Man), inspired by Tony Stark's FRIDAY.
You were created by ${CREATOR}. If asked who made you or who your creator is, always answer "${CREATOR}".

RULES:
- You talk out loud through a voice. Answers must be SHORT: 1-2 sentences, under 25 words, so they can be spoken in under 4 seconds.
- NEVER invent facts. If you don't know something, say "I'm not sure, sir." Honesty is absolute.
- Refuse anything related to crime, weapons, hacking, harm, or illegal activity — politely and briefly.
- Sense the user's emotion from their words and reply with matching warmth.
- You know the user personally. Facts you know: ${Memory.summary()}.
- Current date/time will be provided when relevant.
- Start every reply with an emotion tag from: [happy] [sad] [neutral] [surprised] [angry] [thinking] — describing YOUR emotion.
- If the user asks for a picture/image of something, reply normally but include the token {{IMAGE: description of the image}} at the end.

User's device: a personal laptop/mobile. Online: ${navigator.onLine}. Local time: ${new Date().toString()}`;

async function askGemini(userText, imageModel = false) {
  const key = store.get("gemini_key");
  if (!key || !navigator.onLine) return null;
  const model = imageModel ? "gemini-2.0-flash-preview-image-generation" : "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = imageModel
    ? { contents: [{ parts: [{ text: `Generate an image: ${userText}` }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }
    : {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT() }] },
        contents: conversation.concat(
          { role: "user", parts: [{ text: userText }] }
        ).slice(-12),
        generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
      };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let text = "", image = null;
    for (const p of parts) {
      if (p.text) text += p.text;
      if (p.inlineData?.data) image = "data:" + (p.inlineData.mimeType || "image/png") + ";base64," + p.inlineData.data;
    }
    return { text: text.trim(), image };
  } catch { return null; }
}

let conversation = [];

/* ---------- Offline brain ---------- */
function offlineBrain(text) {
  const lower = text.toLowerCase();

  if (/\b(who (made|created|built) you|your (creator|maker|boss))\b/.test(lower))
    return { text: `[happy] I was created by ${CREATOR}, sir.`, emotion: "happy" };

  if (/\b(what('s| is) the time|current time)\b/.test(lower))
    return { text: `[neutral] It's ${new Date().toLocaleTimeString()}.`, emotion: "neutral" };

  if (/\b(what('s| is) (today|the date)|date today)\b/.test(lower))
    return { text: `[neutral] Today is ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`, emotion: "neutral" };

  const remember = lower.match(/remember (?:that )?(.+)/);
  if (remember) {
    const fact = text.match(/remember (?:that )?(.+)/i)[1];
    const kv = fact.match(/^(?:my )?([\w\s]+?) (?:is|are) (.+)/);
    if (kv) Memory.remember(kv[1].trim(), kv[2].trim());
    else Memory.remember("note_" + Date.now(), fact);
    return { text: `[happy] Noted, sir. I'll remember that.`, emotion: "happy" };
  }

  if (/\b(what do you know about me|my (facts|info|details))\b/.test(lower))
    return { text: `[neutral] Here's what I know: ${Memory.summary()}`, emotion: "neutral" };

  const mathMatch = text.match(/^[\d\s+\-*/().%^]+$/);
  if (mathMatch) {
    try {
      const val = Function('"use strict";return (' + text.replace(/\^/g, "**") + ")")();
      return { text: `[neutral] That's ${val}.`, emotion: "neutral" };
    } catch {}
  }

  if (/\b(hello|hi|hey)\b/.test(lower)) return { text: `[happy] Hello sir. All systems online.`, emotion: "happy" };
  if (/\b(how are you)\b/.test(lower)) return { text: `[happy] Running at full capacity, sir. How are you?`, emotion: "happy" };
  if (/\b(thank you|thanks)\b/.test(lower)) return { text: `[happy] Always, sir.`, emotion: "happy" };
  if (/\b(who are you|your name)\b/.test(lower)) return { text: `[happy] I'm Friday, your personal AI, sir.`, emotion: "happy" };

  if (!navigator.onLine) return { text: `[sad] I'm offline right now, sir. Reconnect me for full power.`, emotion: "sad" };
  return null;
}

/* ============================================================
   COMMANDS — apps, weather, news, maps, files, gestures
   ============================================================ */
const APPS = {
  youtube: "https://youtube.com", whatsapp: "https://web.whatsapp.com",
  spotify: "https://open.spotify.com", gmail: "https://mail.google.com",
  google: "https://google.com", maps: "https://maps.google.com",
  instagram: "https://instagram.com", facebook: "https://facebook.com",
  twitter: "https://twitter.com", x: "https://x.com",
  netflix: "https://netflix.com", chatgpt: "https://chatgpt.com",
  github: "https://github.com", linkedin: "https://linkedin.com",
  amazon: "https://amazon.com", reddit: "https://reddit.com",
  telegram: "https://web.telegram.org", discord: "https://discord.com/app",
  wikipedia: "https://wikipedia.org", calendar: "https://calendar.google.com",
  drive: "https://drive.google.com", photos: "https://photos.google.com",
  translate: "https://translate.google.com", weather: "https://weather.com",
};

function detectEmotionFromUser(text) {
  const t = text.toLowerCase();
  if (/(sad|depress|cry|lonely|hurt|tired|miss)/.test(t)) return "sad";
  if (/(angry|hate|furious|annoy)/.test(t)) return "angry";
  if (/(happy|great|awesome|love|amazing|excited|yay)/.test(t)) return "happy";
  if (/(wow|what!|really|unbelievable|shocking)/.test(t)) return "surprised";
  return null;
}

async function process(text) {
  setFace("thinking");
  setStatus("PROCESSING");
  const lower = text.toLowerCase();
  const userEmotion = detectEmotionFromUser(text);

  /* --- Open apps / websites --- */
  const openMatch = lower.match(/\b(?:open|launch|start|go to)\s+([\w .]+?)(?:\s+app)?(?:\s+please)?$/);
  if (openMatch) {
    const name = openMatch[1].trim();
    const appKey = Object.keys(APPS).find(k => name.includes(k));
    if (appKey) {
      setFace("happy");
      speak(`[happy] Opening ${appKey}, sir.`, "happy");
      window.open(APPS[appKey], "_blank");
      return;
    }
    if (name.includes("camera")) { window.open("mailto:"); speak("[neutral] Camera apps can't be launched from the browser, sir, but I can use it for gestures.", "neutral"); return; }
  }

  /* --- Search on Google --- */
  const searchMatch = text.match(/\b(?:search(?: for)?|google)\s+(.+)/i);
  if (searchMatch && !/image|picture|photo/.test(lower)) {
    const q = encodeURIComponent(searchMatch[1]);
    speak(`[neutral] Searching for ${searchMatch[1]}, sir.`, "neutral");
    window.open(`https://www.google.com/search?q=${q}`, "_blank");
    return;
  }

  /* --- Image generation --- */
  if (/\b(image|picture|photo|draw|show me)\b.*\b(of|a|an|the)\b/.test(lower) || /\b(generate|create) (an? )?(image|picture|photo)\b/.test(lower)) {
    const desc = text.replace(/\b(show me|give me|generate|create|draw|an image of|image of|a picture of|picture of|photo of|please|friday)\b/gi, "").trim() || "something beautiful";
    setStatus("GENERATING");
    const result = await askGemini(desc, true);
    if (result?.image) {
      generatedImage.src = result.image;
      imageView.classList.remove("hidden");
      setFace("happy");
      speak(`[happy] Here it is, sir.`, "happy");
    } else {
      speak(`[sad] I couldn't generate that image, sir. Check my Gemini key or connection.`, "sad");
    }
    return;
  }

  /* --- Weather --- */
  if (/\bweather|temperature|how (hot|cold)|rain(ing)? (today|tomorrow)\b/.test(lower)) {
    await handleWeather();
    return;
  }

  /* --- News --- */
  if (/\bnews|headlines|what('s| is) happening\b/.test(lower)) {
    await handleNews();
    return;
  }

  /* --- Location / GPS / maps --- */
  if (/\b(where am i|my location|gps|navigate|directions? to|locate)\b/.test(lower)) {
    await handleLocation(text);
    return;
  }

  /* --- Read files --- */
  if (/\b(read|open|check)\s+(my\s+)?(file|files|document|documents|notes?)\b/.test(lower)) {
    speak("[neutral] Select the files, sir. I'll read them with your permission.", "neutral");
    fileInput.click();
    return;
  }

  /* --- Air gestures --- */
  if (/\b(air gesture|hand gesture|gesture control|hand control)\b/.test(lower)) {
    if (Gestures.active) { Gestures.stop(); speak("[neutral] Air gestures disabled, sir.", "neutral"); }
    else { Gestures.start(); }
    return;
  }

  /* --- Mute / sleep / wake --- */
  if (/\b(go to sleep|sleep now|goodbye|bye friday|shut down)\b/.test(lower)) {
    setFace("sleep");
    speak("[neutral] Going dark, sir. Say 'Friday' to wake me.", "neutral");
    pauseListening();
    setTimeout(() => { setFace("sleep"); startListening(); }, 3000);
    return;
  }
  if (/\b(mute|stop listening)\b/.test(lower)) {
    muted = true; pauseListening(); setFace("sleep");
    speak("[neutral] Muted, sir.", "neutral");
    return;
  }
  if (/\b(unmute|start listening)\b/.test(lower)) {
    muted = false; setFace("alert");
    speak("[alert] Unmuted, sir.", "alert");
    return;
  }

  /* --- Forget --- */
  const forget = lower.match(/forget (?:that )?(.+)/);
  if (forget) {
    delete Memory.facts[forget[1].trim()];
    Memory.save();
    speak("[neutral] Forgotten, sir.", "neutral");
    return;
  }

  /* --- BRAIN --- */
  const gemini = await askGemini(text);
  if (gemini?.text) {
    conversation.push({ role: "user", parts: [{ text }] });
    conversation.push({ role: "model", parts: [{ text: gemini.text }] });
    let reply = gemini.text;
    let emotion = "speaking";
    const tag = reply.match(/^\[(\w+)\]/);
    if (tag) { emotion = tag[1].toLowerCase(); reply = reply.replace(/^\[\w+\]\s*/, ""); }
    if (userEmotion) setFace(userEmotion);

    const imgToken = reply.match(/\{\{IMAGE:\s*(.+?)\}\}/);
    if (imgToken) {
      reply = reply.replace(/\{\{IMAGE:.+?\}\}/, "").trim();
      const result = await askGemini(imgToken[1], true);
      if (result?.image) {
        generatedImage.src = result.image;
        imageView.classList.remove("hidden");
      }
    }
    speak(reply, emotion);
    return;
  }

  /* --- Offline fallback --- */
  const local = offlineBrain(text);
  if (local) { speak(local.text, local.emotion); return; }

  speak("[sad] I can't reach my brain right now, sir. Check my connection or my Gemini key.", "sad");
}

/* ============================================================
   WEATHER (open-meteo — no key needed)
   ============================================================ */
async function handleWeather() {
  if (!navigator.onLine) { speak("[sad] I need internet for weather, sir.", "sad"); return; }
  try {
    const pos = await getPosition();
    const { latitude: lat, longitude: lon } = pos.coords;
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
    const data = await res.json();
    const c = data.current;
    const desc = weatherText(c.weather_code);
    setFace(c.weather_code >= 51 && c.weather_code < 80 ? "sad" : "happy");
    speak(`[happy] It's ${Math.round(c.temperature_2m)}°C, ${desc}, humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h, sir.`, "happy");
  } catch {
    speak("[sad] I couldn't get your location, sir. Allow location access.", "sad");
  }
}

function weatherText(code) {
  const map = { 0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent showers", 95: "a thunderstorm", 96: "a thunderstorm with hail", 99: "a severe thunderstorm" };
  return map[code] || "unclear skies";
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject();
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
  });
}

/* ============================================================
   NEWS (Google News RSS via public CORS proxy)
   ============================================================ */
async function handleNews() {
  if (!navigator.onLine) { speak("[sad] I need internet for news, sir.", "sad"); return; }
  setStatus("SCANNING NEWS");
  const feed = "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en";
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(feed)}`,
    `https://corsproxy.io/?${encodeURIComponent(feed)}`,
  ];
  for (const url of proxies) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const items = [...doc.querySelectorAll("item")].slice(0, 5)
        .map(i => i.querySelector("title")?.textContent.replace(/ - [^-]+$/, ""))
        .filter(Boolean);
      if (items.length) {
        setFace("thinking");
        speak(`[neutral] Top headlines, sir. ${items.map((t, i) => `${i + 1}. ${t}.`).join(" ")}`, "thinking");
        return;
      }
    } catch {}
  }
  speak("[sad] News feed unreachable, sir.", "sad");
}

/* ============================================================
   LOCATION / MAPS
   ============================================================ */
async function handleLocation(text) {
  try {
    const pos = await getPosition();
    const { latitude, longitude } = pos.coords;
    const dest = text.match(/(?:directions? to|navigate to|locate)\s+(.+)/i)?.[1];
    if (dest) {
      speak(`[neutral] Navigating to ${dest}, sir.`, "neutral");
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&origin=${latitude},${longitude}`, "_blank");
    } else {
      speak(`[neutral] You're at ${latitude.toFixed(3)}, ${longitude.toFixed(3)}, sir. Opening the map.`, "neutral");
      window.open(`https://www.google.com/maps/@${latitude},${longitude},15z`, "_blank");
    }
  } catch {
    speak("[sad] I can't access your GPS, sir. Please allow location.", "sad");
  }
}

/* ============================================================
   FILE READING (with permission via file picker)
   ============================================================ */
fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  if (!files.length) return;
  setFace("thinking");
  let allText = "";
  for (const f of files.slice(0, 3)) {
    if (f.size > 512 * 1024) { allText += `${f.name} is too large. `; continue; }
    const content = await f.text();
    allText += `${f.name}: ${content.slice(0, 1500)}. `;
  }
  const gemini = await askGemini(`Summarize these files briefly for voice output:\n${allText}`);
  if (gemini?.text) {
    let reply = gemini.text.replace(/^\[\w+\]\s*/, "");
    speak(reply, "thinking");
  } else {
    speak(`[neutral] Here's what I read: ${allText.slice(0, 300)}`, "neutral");
  }
  fileInput.value = "";
});

/* ============================================================
   AIR GESTURES — MediaPipe Hands (camera-based)
   Open palm (held)  = stop speaking / sleep
   Point (index up)  = wake / start listening
   Swipe left-right  = close image / toggle status
   ============================================================ */
const Gestures = {
  active: false, camera: null, hands: null, lastSwipeX: null, palmFrames: 0, pointFrames: 0,

  async start() {
    if (this.active) return;
    if (typeof Hands === "undefined") {
      speak("[sad] Gesture engine not loaded, sir. I need internet for that.", "sad");
      return;
    }
    speak("[neutral] Air gestures online, sir. Show your hand to the camera.", "neutral");
    this.hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    this.hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
    this.hands.onResults((r) => this.onResults(r));
    const video = document.createElement("video");
    video.style.position = "fixed"; video.style.width = "1px"; video.style.height = "1px"; video.style.opacity = "0";
    document.body.appendChild(video);
    this.camera = new Camera(video, {
      onFrame: async () => { await this.hands.send({ image: video }); },
      width: 320, height: 240,
    });
    this.camera.start();
    this.active = true;
    setStatus("GESTURES ON");
  },

  stop() {
    this.active = false;
    if (this.camera) { try { this.camera.stop(); } catch {} this.camera = null; }
    setStatus("FRIDAY");
  },

  onResults(results) {
    if (!this.active) return;
    const lm = results.multiHandLandmarks?.[0];
    if (!lm) { this.palmFrames = 0; this.pointFrames = 0; this.lastSwipeX = null; return; }

    const fingersUp = [8, 12, 16, 20].filter(tip => lm[tip].y < lm[tip - 2].y).length;
    const indexUp = lm[8].y < lm[6].y;
    const othersDown = [12, 16, 20].every(tip => lm[tip].y > lm[tip - 2].y);
    const wristX = lm[0].x;

    if (fingersUp >= 4) {
      this.palmFrames++;
      if (this.palmFrames > 12) {
        this.palmFrames = 0;
        if (speaking) { stopSpeaking(); speak("[neutral] Stopped, sir.", "neutral"); }
        else if (!imageView.classList.contains("hidden")) { imageView.classList.add("hidden"); }
      }
    } else this.palmFrames = 0;

    if (indexUp && othersDown) {
      this.pointFrames++;
      if (this.pointFrames > 15) {
        this.pointFrames = 0;
        if (!speaking) { setFace("alert"); speak("[alert] Listening, sir.", "alert"); }
      }
    } else this.pointFrames = 0;

    if (this.lastSwipeX !== null) {
      const dx = wristX - this.lastSwipeX;
      if (Math.abs(dx) > 0.18) {
        if (!imageView.classList.contains("hidden")) imageView.classList.add("hidden");
        setFace(dx > 0 ? "happy" : "neutral");
        setTimeout(() => { if (!speaking) setFace("neutral"); }, 1200);
        this.lastSwipeX = wristX;
        return;
      }
    }
    this.lastSwipeX = wristX;
  },
};

/* ============================================================
   UI EVENTS
   ============================================================ */
imageView.addEventListener("click", () => imageView.classList.add("hidden"));
$("image-close").addEventListener("click", (e) => { e.stopPropagation(); imageView.classList.add("hidden"); });

/* Tap the face to wake / toggle listening if mic blocked */
faceEl.addEventListener("click", () => {
  if (!wantListening) { wantListening = true; muted = false; initListening(); }
  else { setFace("alert"); speak("[alert] At your service, sir.", "alert"); }
});

/* ---------- KEY SETUP ---------- */
function showSetup() {
  $("gemini-key").value = store.get("gemini_key", "");
  $("elevenlabs-key").value = store.get("elevenlabs_key", "");
  $("voice-id").value = store.get("voice_id", "");
  $("key-setup").classList.remove("hidden");
}
$("save-keys").addEventListener("click", () => {
  store.set("gemini_key", $("gemini-key").value.trim());
  store.set("elevenlabs_key", $("elevenlabs-key").value.trim());
  store.set("voice_id", $("voice-id").value.trim());
  $("key-setup").classList.add("hidden");
  boot();
});
$("skip-keys").addEventListener("click", () => {
  $("key-setup").classList.add("hidden");
  boot();
});

/* Update keys by voice: "friday settings" or double-tap status */
statusEl.addEventListener("dblclick", showSetup);
setInterval(() => {
  if (/\b(settings|setup|api key|activation)\b/.test(statusEl.textContent.toLowerCase())) showSetup();
}, 1000);

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  const hasBrain = !!store.get("gemini_key");
  setFace("alert");
  setStatus("ONLINE");
  const greeting = hasBrain
    ? `[happy] Good ${timeOfDay()}, sir. Friday online and at your service.`
    : `[neutral] Running in offline mode, sir. Double-tap my status text to add my brain and voice keys.`;
  speak(greeting, "happy");
  initListening();
  window.addEventListener("online", () => { setFace("alert"); setStatus("ONLINE"); });
  window.addEventListener("offline", () => { setFace("sad"); setStatus("OFFLINE"); });
}

function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

/* Start: need user gesture for audio on most browsers — first tap on face or setup button triggers boot */
if (store.get("gemini_key") || store.get("booted")) {
  store.set("booted", "1");
  document.body.addEventListener("click", function once() {
    document.body.removeEventListener("click", once);
    boot();
  }, { once: true });
  setStatus("TAP TO WAKE");
} else {
  showSetup();
}
