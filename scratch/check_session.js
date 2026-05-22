const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const url = `https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/${sessionId}/json`;

async function check() {
  console.log(`Fetching session JSON from ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error fetching: ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    console.log(`Session ID: ${data.id || sessionId}`);
    console.log(`Step Count: ${data.steps ? data.steps.length : 0}`);
    
    if (data.steps) {
      data.steps.forEach((step, index) => {
        console.log(`\nUI Step ${index + 1} (DB ${step.id}):`);
        console.log(`  Text: "${step.textOverride || step.generatedText || step.elementText || '(No text)'}"`);
        console.log(`  Source: ${step.voiceoverSource || 'N/A'}`);
        console.log(`  Voiceover Key: ${step.voiceoverKey || 'N/A'}`);
        console.log(`  Swap Voice ID: ${step.swapVoiceId || 'N/A'}`);
        console.log(`  Duration: ${step.voiceoverDurationMs} ms`);
        if (step.voiceoverKey && data.assets && data.assets[step.voiceoverKey]) {
          console.log(`  Audio URL: ${data.assets[step.voiceoverKey]}`);
        } else {
          console.log(`  Audio URL: N/A`);
        }
      });
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

check();
