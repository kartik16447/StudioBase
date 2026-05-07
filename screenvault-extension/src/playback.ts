async function getPlayableUrl(fileId: string, sessionId?: string) {
    if (!fileId) {
        throw new Error("Invalid fileId: Playback cannot start without a target ID.");
    }

    let workerUrl = `https://screenvault-proxy.karthik-upadhyay98.workers.dev/?id=${fileId}`;
    if (sessionId) {
        workerUrl += `&sid=${sessionId}`;
    }
    
    // Direct return of proxy URL - avoiding HEAD check which often fails due to CORS/Adblockers
    return workerUrl;
}

(window as any).SV = { getPlayableUrl };

