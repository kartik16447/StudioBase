const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const url = 'https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/admin/trigger-swap-voice';

const swaps = [
  { stepId: 'step-1', voiceId: '21m00Tcm4TlvDq8ikWAM', speakerName: 'Rachel (Aura Asteria)' },
  { stepId: 'step-3', voiceId: '29vD33N1CtxCmqQRPOHJ', speakerName: 'Drew (Aura Angus)' },
  { stepId: 'step-5', voiceId: 'piTKgcLEGmPEe24yT1vF', speakerName: 'Nicole (Aura Luna)' },
  { stepId: 'step-7', voiceId: 'AZnzlk1Xgd1AawpnG3qV', speakerName: 'Dom (Aura Arcas)' }
];

async function runSwaps() {
  console.log(`Starting Phase 2 Multi-Voice swaps for Session: ${sessionId}...`);
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
  console.log('Phase 2 Multi-Voice swaps completed!');
}

runSwaps();
