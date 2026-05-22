const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const url = 'https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/admin/trigger-swap-voice';

const swaps = [
  { stepId: 'step-0', voiceId: '21m00Tcm4TlvDq8ikWAM', speakerName: 'Rachel (Aura Asteria) - UI Step 1' },
  { stepId: 'step-2', voiceId: '29vD33N1CtxCmqQRPOHJ', speakerName: 'Drew (Aura Angus) - UI Step 3' },
  { stepId: 'step-4', voiceId: 'piTKgcLEGmPEe24yT1vF', speakerName: 'Nicole (Aura Luna) - UI Step 5' },
  { stepId: 'step-6', voiceId: 'AZnzlk1Xgd1AawpnG3qV', speakerName: 'Dom (Aura Arcas) - UI Step 7' }
];

async function runSwaps() {
  console.log(`Triggering swaps for the CORRECT 1-based UI Steps 1, 3, 5, 7 (DB step-0, step-2, step-4, step-6)...`);
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
  console.log('Correct UI Steps swaps completed!');
}

runSwaps();
