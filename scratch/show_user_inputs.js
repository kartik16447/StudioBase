const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('/Users/kartikupadhyay/.gemini/antigravity-ide/brain/dde049dc-c131-49de-ab2e-0a8a2c179744/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        console.log(`\n--- USER REQUEST ${index} (Created At: ${obj.created_at}, Step: ${obj.step_index}) ---`);
        // Extract content within USER_REQUEST tags if present
        const content = obj.content || '';
        const match = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match) {
          console.log(match[1].trim());
        } else {
          console.log(content.trim());
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    index++;
  }
}

main();
