import { WebSocket } from "ws";

export function connectToElevenLabs(agentId: string, apiKey: string): WebSocket {
  const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;

  const ws = new WebSocket(url, {
    headers: {
      'xi-api-key': apiKey
    }
  });

  ws.on('open', () => {
    console.log('✅ Connected to ElevenLabs');

    // Initialize the conversation
    ws.send(JSON.stringify({
      type: 'conversation_initiation_client_data'
    }));
  });

  ws.on('error', (error) => {
    console.error('❌ ElevenLabs WebSocket error:', error);
  });

  return ws;
}

export function setupElevenLabsHandlers(
  elevenLabsWs: WebSocket,
  twilioWs: WebSocket,
  streamSid: string
) {
  elevenLabsWs.on('message', (data: string) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'audio':
        // Send AI audio back to caller
        if (message.audio_event?.audio_base_64) {
          twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid: streamSid,
            media: {
              payload: message.audio_event.audio_base_64
            }
          }));
        }
        break;

      case 'user_transcript':
        console.log('👤 User:', message.user_transcription_event.user_transcript);
        break;

      case 'agent_response':
        console.log('🤖 AI:', message.agent_response_event?.agent_response);
        break;

      case 'conversation_initiation_metadata':
        const meta = message.conversation_initiation_metadata_event;
        console.log(`✅ ElevenLabs ready (in: ${meta.user_input_audio_format}, out: ${meta.agent_output_audio_format})`);
        break;
    }
  });

  elevenLabsWs.on('error', (error) => {
    console.error('❌ ElevenLabs error:', error);
  });

  elevenLabsWs.on('close', () => {
    console.log('🔌 ElevenLabs disconnected');
  });
}
