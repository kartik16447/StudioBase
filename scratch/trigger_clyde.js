const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const url = 'https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/admin/trigger-swap-voice';

const swaps = [
  { stepId: 'step-10', voiceId: '2EiwWnXF2V4jofwvRnss', speakerName: 'Clyde (Aura Zeus)' },
  { stepId: 'step-11', voiceId: '2EiwWnXF2V4jofwvRnss', speakerName: 'Clyde (Aura Zeus)' },
  { stepId: 'step-12', voiceId: '2EiwWnXF2V4jofwvRnss', speakerName: 'Clyde (Aura Zeus)' }
];

async function runSwaps() {
  console.log(`Re-triggering Clyde swaps for Steps 10, 11, 12...`);
  for (const item of swaps) {
    console.log(`\n--------------------------------------------`);
    console.log(`Triggering swap for ${item.stepId} using voice: ${item.speakerName} (${item.voiceId})`);
    
    try {
      const start = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          stepId: item.stepId,
          voiceId: item.voiceId
        })
      });

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`HTTP Status: ${response.status} (took ${duration}s)`);
      
      const body = await response.json();
      console.log('Response body:', JSON.stringify(body, null, 2));
    } catch (error) {
      console.error(`Failed to trigger swap for ${item.stepId}:`, error);
    }
  }
  console.log(`\n--------------------------------------------`);
  console.log('Clyde swaps completed!');
}

runSwaps();
