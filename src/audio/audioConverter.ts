import alawmulaw from "alawmulaw";

const { mulaw } = alawmulaw;

// Resamples PCM 16-bit audio using linear interpolation
function resamplePCM(input: Int16Array, inputRate: number, outputRate: number): Int16Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < output.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const fraction = pos - idx;

    const s1 = input[idx] ?? 0;
    const s2 = input[idx + 1] ?? s1;

    // Linear interpolation to reduce aliasing noise
    output[i] = s1 + (s2 - s1) * fraction;
  }
  return output;
}

export function twilioToGemini(base64Mulaw: string): string {
  const muLawBuffer = Buffer.from(base64Mulaw, "base64");
  // Twilio is 8000Hz Mono Mu-Law
  const pcm8k = mulaw.decode(muLawBuffer); 
  // Gemini Live expects 16000Hz Mono PCM
  const pcm16k = resamplePCM(pcm8k, 8000, 16000);
  return Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength).toString("base64");
}

export function geminiToTwilio(base64PCM24k: string): string {
  const buffer = Buffer.from(base64PCM24k, "base64");
  // Convert Buffer to Int16Array (2 bytes per sample)
  const pcm24k = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  // const pcm16k = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  // Downsample back to Twilio's 8000Hz
  const pcm8k = resamplePCM(pcm24k, 24000, 8000);
  const muLaw = mulaw.encode(pcm8k);
  return Buffer.from(muLaw).toString("base64");
}
