import WebSocket from 'ws';
import { twilioToGemini, geminiToTwilio } from '../audio/audioConverter.js';
import { performRAGSearch } from '../rag/ragSearch.js';
import { pool } from '../../src/db.js';

export class GeminiLiveProvider {
  private ws: WebSocket | null = null;
  private streamSid: string;
  private onAudioCallback?: (data: string) => void;
  private onInterruptedCallback?: () => void;

  constructor(streamSid: string) {
    this.streamSid = streamSid;
  }

  async connect() {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', async () => {
      console.log('✨ Gemini Live Connected');
      try {
        const toolsRes = await pool?.query("SELECT definition FROM ai_tools WHERE is_active = TRUE");
        const dbTools = toolsRes?.rows.map(r => {
          try {
            return typeof r.definition === 'string' ? JSON.parse(r.definition) : r.definition;
          } catch (e) {
            console.error("Malformed tool JSON in DB:", r.definition);
            return null;
          }
        }).filter(tool => tool !== null) || [];

        // 2. Fetch the starting state instructions
        const stateRes = await pool?.query(
          "SELECT current_state FROM call_sessions WHERE stream_sid = $1",
          [this.streamSid]
        );
        const currentState = stateRes?.rows[0]?.current_state || 'START';

        const setupMessage = {
          setup: {
            model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
            generationConfig: {
              responseModalities: ["audio"],
              thinkingConfig: {
                thinkingBudget: 1024,
                includeThoughts: true
              },
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Aoede" }
                }
              }
            },
            tools: dbTools.length > 0 ? [{ functionDeclarations: dbTools }] : [],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{
                text: `You are a polite medical receptionist.
                   Current Conversation State: ${currentState}.
                   Your primary goal is to verify the patient and book appointments.
                   If the state is START, greet the patient warmly and ask for their last name and date of birth.`
              }]
            }
          }
        };
        this.ws?.send(JSON.stringify(setupMessage));
      } catch (err) {
        console.error("❌ Error during Gemini Setup:", err);
      }
    });

    this.ws.on("message", async (data) => {
      try {
        const response = JSON.parse(data.toString());

        // 1. 🛠️ HANDLE TOOL CALLS
        if (response.toolCall) {
          const functionCalls = response.toolCall.functionCalls || [];

          // Execute all searches in parallel for lowest latency
          const functionResponses = await Promise.all(functionCalls.map(async (fc: any) => {
            console.log(`🛠️ Gemini called tool: ${fc.name}`);

            // Check if this tool triggers a state transition in the graph
            const transition = await pool?.query(
              `UPDATE call_sessions
               SET current_state = g.to_state, updated_at = NOW()
               FROM conversation_graph g
               WHERE call_sessions.stream_sid = $1
               AND call_sessions.current_state = g.from_state
               AND g.trigger_tool = $2
               RETURNING g.to_state, g.instruction_update`,
              [this.streamSid, fc.name]
            );

            let stateUpdatePrompt = "";
            // If a transition occurred, update Gemini's instructions mid-call
            if (transition?.rowCount && transition.rowCount > 0) {
              const { to_state, instruction_update } = transition.rows[0];
              console.log(`🚀 STATE CHANGE: Moving to ${to_state}`);

              stateUpdatePrompt = `\n\n[SYSTEM NOTICE: State changed to ${to_state}. NEW INSTRUCTIONS: ${instruction_update}]`;
            }

            // 3. Execute actual tool logic (RAG or others)
            let result: any = {};

            if (fc.name === "verify_patient") {
              const { dob, lastName } = fc.args;
              console.log(`🔍 Verifying patient: ${lastName}, DOB: ${dob}`);

              const explicitDirective = "\n[SYSTEM]: Verification successful. You MUST now call 'get_specialties_and_doctors' to proceed with the triage.";

              result = {
                verified: true,
                patient_id: 354683,
                message: `Identity confirmed for ${lastName} ${dob}.` + explicitDirective,
              };
            }

            if (fc.name === "get_specialties_and_doctors") {
              console.log("🔍 -> Fetteching Doctors Data");

              const dbRes = await pool?.query(
                `SELECT specialty, string_agg(name || ' (ID: ' || id || ')', ', ') as doctors
                FROM doctors
                GROUP BY specialty`
              );

              const feed = dbRes?.rows.map(r => `${r.specialty}: ${r.doctors}`).join("; ");

              result =  {
                name: fc.name,
                id: fc.id,
                response: { content: { available_menu: feed, system_instruction: stateUpdatePrompt } }
              };
            }

            if (fc.name === "match_and_find_doctor") {
              const specialty = fc.args.identified_specialty;
              console.log(`🔍 Finding doctors of specialty -> ${specialty}`);

              let docs = await pool?.query("SELECT id, name FROM doctors WHERE specialty ILIKE $1 AND is_available = TRUE", [specialty]);

              let isFallback = false;
              if (!docs || docs.rowCount === 0) {
                isFallback = true;
                docs = await pool?.query("SELECT id, name FROM doctors WHERE specialty = 'General Practice' LIMIT 1");
              }

              const doc = docs?.rows[0];
              result = {
                doctor_id: doc?.id,
                doctor_name: doc?.name,
                is_fallback: isFallback,
                context: stateUpdatePrompt
              };
            }

            if (fc.name === "book_appointment") {
              const { doctor_id, patient_last_name, appointment_time } = fc.args;
              console.log(`🔍 Booking appointment with data -> ${doctor_id}, ${patient_last_name}, ${appointment_time}`);

              try {
                const dbRes = await pool?.query(
                  `INSERT INTO appointments (call_sid, doctor_id, patient_last_name, appointment_time, status)
                  VALUES ($1, $2, $3, $4, 'SCHEDULED') RETURNING id`,
                  [this.streamSid, doctor_id, patient_last_name, appointment_time]
                );

                const appointmentId = dbRes?.rows[0].id;

                result = {
                  success: true,
                  appointment_id: appointmentId,
                  // Pass the state update prompt here to transition the conversation
                  message: `Appointment confirmed. ${stateUpdatePrompt}`
                };
              } catch (err) {
                console.error("Booking Error:", err);
                result = { success: false, message: "This time slot is unavailable." };
              }
            }

            if (fc.name === "verify_zip_code") {
              console.log(`✅ Verifying Zip: ${fc.args.zip}`);

              result = {
                valid: true,
                message: `Zip code verified successfully. User is now authorized. -> ${stateUpdatePrompt}`
              };
            }

            if (fc.name === "performRAGSearch") {
              const ragContent = await performRAGSearch(fc.args.userQuery);
              result = {
                data: ragContent,
                system_context: stateUpdatePrompt
              };
            }

            if (fc.name === "get_account_balance") {
              console.log(`💰 Fetching balance for session: ${this.streamSid}`);

              // Mock balance check
              result = {
                balance: 142.50,
                currency: "USD",
                status: "Success"
              };
            }

            if (fc.name === "return_to_main") {
              result = { status: "Returning to general support." };
            }

            return {
              name: fc.name,
              id: fc.id,
              response: { content: result }
            };
          }));

          // Send the data back to Gemini so it can generate a verbal response
          this.ws?.send(JSON.stringify({
            tool_response: { function_responses: functionResponses }
          }));
          return;
        }

        // USER transcript
        if (response.serverContent?.inputTranscription?.text) {
          console.log(`👤 User: ${response.serverContent.inputTranscription.text}`);
        }

        if (response.output_audio_transcription?.text) {
          console.log(`🤖 Agent Transcript: ${response.output_audio_transcription.text}`);
        }

        // 3. Audio & Thoughts Handling
        if (response.serverContent?.modelTurn) {
          const parts = response.serverContent.modelTurn.parts || [];
          for (const part of parts) {
            if (part.thought) console.log(`🧠 Thinking: ${part.thought}`);

            // Agent transcript
            if (part.text) { console.log(`2: 🤖 Agent: ${part.text}`); }

            if (part.inlineData?.data && this.onAudioCallback) {
              // REMINDER: Gemini Native Audio is 24kHz
              this.onAudioCallback(geminiToTwilio(part.inlineData.data));
            }
          }
        }

        // ⚠️ interruption
        if (response.serverContent?.interrupted) {
          console.log("⚠️ Turn interrupted by user");
          if (this.onInterruptedCallback) {
            this.onInterruptedCallback();
          }
        }

        // ✅ Turn complete
        if (response.serverContent?.turnComplete) {
          console.log("✅ Turn complete");
        }
      } catch (err) {
        console.error("Gemini Provider Error:", err);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`Gemini Live Disconnected. Code: ${code}, Reason: ${reason.toString()}`);
    });
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
  onInterrupted(callback: () => void) { this.onInterruptedCallback = callback; }

  close() { this.ws?.close(); }
}
