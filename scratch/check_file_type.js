const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const jsonUrl = `https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/${sessionId}/json`;

async function checkAudioHeaders() {
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) {
      console.error(`Error fetching session json: ${res.status}`);
      return;
    }
    const data = await res.json();
    if (!data.steps) {
      console.error("No steps found in session json.");
      return;
    }

    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      if (step.voiceoverKey && data.assets && data.assets[step.voiceoverKey]) {
        const audioUrl = data.assets[step.voiceoverKey];
        // Fetch first 64 bytes
        try {
          const audioRes = await fetch(audioUrl, {
            headers: {
              'Range': 'bytes=0-63'
            }
          });
          
          if (!audioRes.ok && audioRes.status !== 206) {
            console.log(`UI Step ${i + 1} (${step.id}): HTTP ${audioRes.status} trying to fetch audio range`);
            continue;
          }
          
          const arrayBuffer = await audioRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          
          // Check if WAV (starts with "RIFF")
          const isWav = bytes.length >= 4 &&
                        bytes[0] === 0x52 && // R
                        bytes[1] === 0x49 && // I
                        bytes[2] === 0x46 && // F
                        bytes[3] === 0x46;   // F
                        
          // Check if MP3 (starts with "ID3" or 0xFF)
          const isId3 = bytes.length >= 3 &&
                        bytes[0] === 0x49 && // I
                        bytes[1] === 0x44 && // D
                        bytes[2] === 0x33;   // 3
                        
          const isMp3Sync = bytes.length >= 2 &&
                            bytes[0] === 0xFF &&
                            (bytes[1] & 0xE0) === 0xE0;
                            
          let format = "Unknown/Other";
          if (isWav) format = "WAV (Fallback / MeloTTS)";
          else if (isId3) format = "MP3 (ID3v2)";
          else if (isMp3Sync) format = "MP3 (Sync)";
          
          console.log(`UI Step ${i + 1} (${step.id}): source=${step.voiceoverSource}, voiceId=${step.swapVoiceId || 'none'}, Format=${format}, Bytes=[${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
        } catch (audioErr) {
          console.error(`UI Step ${i + 1} (${step.id}): Failed to fetch audio headers:`, audioErr.message);
        }
      } else {
        console.log(`UI Step ${i + 1} (${step.id}): No voiceoverKey/asset`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch session metadata:", err);
  }
}

checkAudioHeaders();
