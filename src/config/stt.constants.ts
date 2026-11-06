export const SPEECH_TO_TEXT_PROVIDERS = [
  {
    // Cloudflare Workers AI — Whisper large-v3-turbo. JSON body with base64
    // audio; fill API_KEY (Workers AI token) in settings. Account id is in the
    // URL (an identifier, not a secret) so it isn't URL-encoded by the parser.
    id: "cloudflare-whisper",
    name: "Cloudflare Whisper (Workers AI)",
    curl: `curl -X POST "https://api.cloudflare.com/client/v4/accounts/d27053e91cdcc6f2e55d2157e09cf132/ai/run/@cf/openai/whisper-large-v3-turbo" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -H "Content-Type: application/json" \\
      -d '{"audio":"{{AUDIO}}","task":"transcribe","vad_filter":true,"condition_on_previous_text":false,"initial_prompt":"Software engineering interview. Terms: API, REST, gRPC, idempotent, idempotency, bit.ly, URL shortener, rate limiter, Kubernetes, Redis, Kafka, PostgreSQL, sharding, replication, cache, CDN, load balancer, mutex, semaphore, deadlock, race condition, linked list, binary tree, hash map, useEffect, React, TypeScript, Python, Go, latency, throughput, QPS."}'`,
    responseContentPath: "result.text",
    streaming: false,
  },
  {
    // Groq Whisper turbo: ~0.3–0.6s per phrase. Language auto-detected; prompt = interview vocabulary.
    id: "groq-whisper-interview",
    name: "Groq Whisper (interview)",
    curl: `curl -X POST https://api.groq.com/openai/v1/audio/transcriptions \\
      -H "Authorization: bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F model=whisper-large-v3-turbo \\
      -F temperature=0 \\
      -F response_format=json \\
      -F "prompt=Software engineering interview. API, REST, gRPC, idempotency, URL shortener, rate limiter, Kubernetes, Redis, Kafka, PostgreSQL, sharding, replication, cache, CDN, load balancer, mutex, deadlock, race condition, linked list, binary tree, hash map, React, TypeScript, Python, latency, throughput, QPS."`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "openai-whisper",
    name: "OpenAI Whisper",
    curl: `curl -X POST "https://api.openai.com/v1/audio/transcriptions" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F "model={{MODEL}}"`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "groq",
    name: "Groq Whisper",
    curl: `curl -X POST https://api.groq.com/openai/v1/audio/transcriptions \\
      -H "Authorization: bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F model={{MODEL}} \\
      -F temperature=0 \\
      -F response_format=text \\
      -F language=en`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "elevenlabs-stt",
    name: "ElevenLabs Speech-to-Text",
    curl: `curl -X POST "https://api.elevenlabs.io/v1/speech-to-text" \\
      -H "xi-api-key: {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F "model_id={{MODEL}}"`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "google-stt",
    name: "Google Speech-to-Text",
    curl: `curl -X POST "https://speech.googleapis.com/v1/speech:recognize" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -H "Content-Type: application/json" \\
      -H "x-goog-user-project: {{PROJECT_ID}}" \\
      -d '{
        "config": {
          "encoding": "LINEAR16", 
          "sampleRateHertz": 16000,
          "languageCode": "en-US"
        },
        "audio": {
          "content": "{{AUDIO}}"
        }
      }'`,
    responseContentPath: "results[0].alternatives[0].transcript",
    streaming: false,
  },
  {
    id: "deepgram-stt",
    name: "Deepgram Speech-to-Text",
    curl: `curl -X POST "https://api.deepgram.com/v1/listen?model={{MODEL}}" \\
      -H "Authorization: TOKEN {{API_KEY}}" \\
      -H "Content-Type: audio/wav" \\
      --data-binary {{AUDIO}}`,
    responseContentPath: "results.channels[0].alternatives[0].transcript",
    streaming: false,
  },
  {
    id: "azure-stt",
    name: "Azure Speech-to-Text",
    curl: `curl -X POST "https://{{REGION}}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US" \\
      -H "Ocp-Apim-Subscription-Key: {{API_KEY}}" \\
      -H "Content-Type: audio/wav" \\
      --data-binary {{AUDIO}}`,
    responseContentPath: "DisplayText",
    streaming: false,
  },
  {
    id: "speechmatics-stt",
    name: "Speechmatics",
    curl: `curl -X POST "https://asr.api.speechmatics.com/v2/jobs" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "data_file={{AUDIO}}" \\
      -F 'config={"type": "transcription", "transcription_config": {"language": "en"}}'`,
    responseContentPath: "job.id",
    streaming: false,
  },
  {
    id: "rev-ai-stt",
    name: "Rev.ai Speech-to-Text",
    curl: `curl -X POST "https://api.rev.ai/speechtotext/v1/jobs" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "media={{AUDIO}}" \\
      -F "options={{OPTIONS}}"`,
    responseContentPath: "id",
    streaming: false,
  },
  {
    id: "ibm-watson-stt",
    name: "IBM Watson Speech-to-Text",
    curl: `curl -X POST "https://api.us-south.speech-to-text.watson.cloud.ibm.com/v1/recognize" \\
      -H "Authorization: Basic {{API_KEY}}" \\
      -H "Content-Type: audio/wav" \\
      --data-binary {{AUDIO}}`,
    responseContentPath: "results[0].alternatives[0].transcript",
    streaming: false,
  },
];
