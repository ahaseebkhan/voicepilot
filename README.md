# VoicePilot 🎙️

AI Calling Agent powered by Twilio + Gemini / ElevenLabs

VoicePilot is an AI-powered outbound calling system that initiates phone calls using Twilio and handles voice interactions using Gemini Live or ElevenLabs.

---

## 🟢 Node Version Requirement

This project requires:

```
Node.js v20.20.0
```

Check your version:

```bash
node -v
```

If needed (using nvm):

```bash
nvm install 20.20.0
nvm use 20.20.0
```

---

## 🚀 How It Works

1. You start the server.
2. Expose your local server using NGROK.
3. Set Twilio webhook to:

```
https://YOUR_NGROK_URL/voice
```

Example:

```
https://3036-119-73-121-9.ngrok-free.app/voice
```

4. Visit:

```
http://localhost:3000/make-call
```

5. The system initiates a call from:

```
TWILIO_PHONE_NUMBER → TO_NUMBER
```

---

## 🔐 Environment Variables

Create a `.env` file in root:

```
# ==============================
# TWILIO
# ==============================
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
# Dev Phone
TO_NUMBER=

# Optional (default: 3000)
PORT=3000

# NGROK hostname (without https://)
NGROK_HOST=3036-119-73-121-9.ngrok-free.app

# ==============================
# AI PROVIDER
# ==============================

# ELEVENLABS
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=

# GEMINI
GEMINI_API_KEY=
GEMINI_MODEL=

# Choose one:
# gemini-live OR eleven-labs
AI_PROVIDER=gemini-live

# ==============================
# DATABASE
# ==============================
DB_USER=
DB_HOST=
DB_NAME=
DB_PASSWORD=
DB_PORT=
```

---

## 📞 Twilio Webhook Setup

Go to your Twilio Console:

1. Open **Phone Numbers**
2. Select your number
3. Under **Voice Configuration**
4. Set:

```
Webhook URL:
https://YOUR_NGROK_HOST/voice
```

Example:

```
https://3036-119-73-121-9.ngrok-free.app/voice
```

---

## 🌐 Run with NGROK

Start your server:

```bash
npm run dev
```

Expose it:

```bash
ngrok http 3000
```

Copy the HTTPS forwarding URL and update:

- `.env` → `NGROK_HOST`
- Twilio Webhook → `https://<ngrok>/voice`

---

## 📲 Make a Call

Once everything is running:

Open in browser:

```
http://localhost:3000/make-call
```

This will trigger:

```
TWILIO_PHONE_NUMBER → TO_NUMBER
```

---

## 🧠 AI Provider Options

You can switch providers using:

```
AI_PROVIDER=gemini-live
```

or

```
AI_PROVIDER=eleven-labs
```

No code changes required.
