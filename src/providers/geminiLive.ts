import WebSocket from 'ws';
import { twilioToGemini, geminiToTwilio } from '../audio/audioConverter.js';

export class GeminiLiveProvider {
  private ws: WebSocket | null = null;
  private onAudioCallback?: (data: string) => void;

  connect() {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('✨ Gemini Live Connected');
      // Configuration to start the session
      const setupMessage = {
        setup: {
          model: process.env.GEMINI_MODEL,
          generation_config: {
            response_modalities: ["audio"],
            thinking_config: {
              thinking_budget: 1024,
              include_thoughts: true
            },
            speech_config: {
              voice_config: { 
                prebuilt_voice_config: { voice_name: "Aoede" } 
              }
            }
          },
          input_audio_transcription: {}, 
          output_audio_transcription: {},
          system_instruction: {
            parts: [{ text: "You are a polite phone assistant. Keep responses concise." }]
          }
        }
      };

      this.ws?.send(JSON.stringify(setupMessage));
    });

    this.ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        const modelTurn = response.serverContent?.modelTurn;
        const parts = modelTurn?.parts || [];

        for (const part of parts) {

          // 🧠 Thoughts
          if (part.thought) {
            console.log(`🧠 Thinking: ${part.thought}`);
          }

          // Agent transcript
          if (part.text) {
            console.log(`🤖 Agent: ${part.text}`);
          }

          // Agent audio
          if (part.inlineData?.data && this.onAudioCallback) {
            this.onAudioCallback(
              geminiToTwilio(part.inlineData.data)
            );
          }
        }

        // USER transcript
        if (response.serverContent?.inputTranscription?.text) {
          console.log(`👤 User: ${response.serverContent.inputTranscription.text}`);
        }

        // ✅ Turn complete
        if (response.serverContent?.turnComplete) {
          console.log("✅ Turn complete");
        }

        // ⚠️ interruption
        if (response.serverContent?.interrupted) {
          console.log("⚠️ Turn interrupted by user");
        }

      } catch (err) {
        console.error("Gemini Provider Error:", err);
      }
    });

    this.ws.on('close', () => console.log('Gemini Live Disconnected'));
    this.ws.on('error', (err) => console.error('Gemini WS Error:', err));
  }

  sendAudio(base64Mulaw: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const pcmData = twilioToGemini(base64Mulaw);

      this.ws.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: pcmData }]
        }
      }));
    }
  }

  onAudio(callback: (data: string) => void) { this.onAudioCallback = callback; }

  close() { this.ws?.close(); }
}
