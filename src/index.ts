import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { connectToElevenLabs, setupElevenLabsHandlers } from './providers/elevenlabs.js';
import { GeminiLiveProvider } from './providers/geminiLive.js';
import { pool } from "./db.js";

const app = express();
const server = http.createServer(app);

// WebSocket server for Twilio media streams
const wss = new WebSocketServer({ server, path: "/media-stream" });

// Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req: Request, res: Response) => {
  res.send("AI Voice Agent Server Running");
});

// Twilio webhook - returns TwiML for the call
app.post("/voice", (req: Request, res: Response) => {
  const response = new twilio.twiml.VoiceResponse();

  // Initial first
  response.say("Hello! This is your AI voice agent. Let me connect you.");

  // Connect to bidirectional stream
  const connect = response.connect();
  connect.stream({
    url: `wss://${process.env.NGROK_HOST}/media-stream`
  });

  res.type("text/xml");
  res.send(response.toString());
});

// Handle WebSocket connections from Twilio
wss.on('connection', handleTwilioConnection);


function handleTwilioConnection(twilioWs: WebSocket) {
  let streamSid: string | null = null;
  let elevenLabsWs: WebSocket | null = null;
  const isElevenlabsProvider = process.env.AI_PROVIDER === 'eleven-labs';
  const isGeminiLiveProvider = process.env.AI_PROVIDER === 'gemini-live';
  let geminiLive: GeminiLiveProvider | null = null;

  twilioWs.on('message', async (data: string) => {
    const message = JSON.parse(data);

    switch (message.event) {
      case 'connected':
        console.log('📞 Twilio stream connected');
        break;

      case 'start':
        streamSid = message.start.streamSid;
        const callSid = message.start.callSid;
        console.log('🎙️ Call started - StreamSid:', streamSid);

        // PREPARE DATABASE SESSION ---
        if (pool && streamSid) {
          try {
            await pool.query(
              `INSERT INTO calls (call_sid, status) VALUES ($1, 'in-progress') ON CONFLICT (call_sid) DO NOTHING`,
              [streamSid]
            );

            await pool.query(
              `INSERT INTO call_sessions (stream_sid, current_state)
               VALUES ($1, 'START')
               ON CONFLICT (stream_sid) DO NOTHING`,
              [streamSid]
            );
            console.log(`📡 Session initialized in DB for ${streamSid}`);
          } catch (dbErr) {
            console.error("❌ Failed to initialize session in DB:", dbErr);
          }
        }

        // --- ElevenLabs Path ---
        if (isElevenlabsProvider) {
          // Connect to ElevenLabs
          elevenLabsWs = connectToElevenLabs(
            process.env.ELEVENLABS_AGENT_ID!,
            process.env.ELEVENLABS_API_KEY!
          );

          // Set up bidirectional audio bridge
          setupElevenLabsHandlers(elevenLabsWs, twilioWs, streamSid!);
        }
        // --- Gemini Live Path ---
        else if (isGeminiLiveProvider) {
          geminiLive = new GeminiLiveProvider(streamSid!);
          geminiLive.connect();

          // Listen for Gemini's processed audio and send to Twilio
          geminiLive.onAudio((twilioPayload: string) => {
            if (twilioWs.readyState === WebSocket.OPEN) {
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid: streamSid,
                media: { payload: twilioPayload }
              }));
            }
          });

          // The interruption signal from Gemini
          geminiLive.onInterrupted(() => {
            if (twilioWs.readyState === WebSocket.OPEN && streamSid) {
              console.log('🚮 Clearing Twilio buffer due to Gemini interruption');
              twilioWs.send(JSON.stringify({
                event: 'clear',
                streamSid: streamSid
              }));
            }
          });
        }
        break;

      case 'media':
        // Forward caller's audio to ElevenLabs
        if (isElevenlabsProvider && elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.send(JSON.stringify({ user_audio_chunk: message.media.payload}));
        }
        else if (isGeminiLiveProvider && geminiLive) {
          // sendAudio handles the internal 8k -> 16k conversion
          geminiLive.sendAudio(message.media.payload);
        }
        break;

      case 'stop':
        console.log('🛑 Call ended');
        if (isElevenlabsProvider) { elevenLabsWs?.close(); }
        else if (isGeminiLiveProvider && geminiLive) {
          geminiLive.close();
          geminiLive = null;
        }
        break;
    }
  });

  twilioWs.on('close', () => {
    if (isElevenlabsProvider) { elevenLabsWs?.close(); }
    else if (isGeminiLiveProvider && geminiLive) {
      geminiLive.close();
      geminiLive = null;
    }
  });
}

// Function to make outbound call
async function makeCall(to: string): Promise<void> {
  try {
    const call = await twilioClient.calls.create({
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `https://${process.env.NGROK_HOST}/voice`,
    });

    console.log(`Call initiated! SID: ${call.sid}`);

    // Try saving to database (non-blocking for app stability)
    try {
      if (!pool) {
        console.warn(":warning: Database not initialized. Skipping DB insert.");
        return;
      }

      await pool.query(
        `INSERT INTO calls (call_sid, from_number, to_number, status)
         VALUES ($1, $2, $3, $4)`,
        [
          call.sid,
          process.env.TWILIO_PHONE_NUMBER,
          to,
          call.status,
        ]
      );

      console.log(":package: Call stored in database");
    } catch (dbError) {
      console.warn(":warning: Database not connected. Call not stored.");
      console.warn(dbError);
    }

  } catch (error) {
    console.error("❌ Error making call:", error);
  }
}

// Endpoint to trigger the outbound call
app.get("/make-call", (req: Request, res: Response) => {
  makeCall(process.env.TO_NUMBER!);
  res.send("Call initiated");
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/media-stream`);

  try {
    await pool.query("SELECT 1");
    console.log("✅ Database ready");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
});