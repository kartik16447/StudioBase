document.getElementById('btn-allow')?.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Immediately stop tracks since we just needed the permission granted
    stream.getTracks().forEach(t => t.stop());
    alert('Success! Permission granted. You can close this tab and start recording.');
    window.close();
  } catch (err) {
    alert('Permission denied. StudioBase cannot record audio without it.');
  }
});
