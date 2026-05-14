const DB_NAME = 'soak_test_db';
const CHUNKS_STORE = 'chunks';
const MANIFEST_STORE = 'manifest';

let db = null;
let isRunning = false;
let chunkCounter = 0;
let totalBytes = 0;
let latencies = [];
let pendingWrites = 0;

const logsEl = document.getElementById('logs');
const chunksEl = document.getElementById('v-chunks');
const dataEl = document.getElementById('v-data');
const latencyEl = document.getElementById('v-latency');
const p95El = document.getElementById('v-p95');
const heapEl = document.getElementById('v-heap');
const pendingEl = document.getElementById('v-pending');

function log(msg) {
    const time = new Date().toLocaleTimeString();
    logsEl.innerHTML += `[${time}] ${msg}<br>`;
    logsEl.scrollTop = logsEl.scrollHeight;
}

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const d = request.result;
            if (!d.objectStoreNames.contains(CHUNKS_STORE)) d.createObjectStore(CHUNKS_STORE);
            if (!d.objectStoreNames.contains(MANIFEST_STORE)) d.createObjectStore(MANIFEST_STORE);
        };
        request.onsuccess = () => {
            db = request.result;
            log('IndexedDB Initialized');
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

function generateDummyBlob(sizeMb) {
    const buffer = new Uint8Array(sizeMb * 1024 * 1024);
    for (let i = 0; i < buffer.length; i += 1024) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    return new Blob([buffer], { type: 'video/webm' });
}

async function persistChunk(idx, blob) {
    if (!db) return;
    const start = performance.now();
    pendingWrites++;
    pendingEl.innerText = pendingWrites.toString();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([CHUNKS_STORE, MANIFEST_STORE], 'readwrite');
        const chunks = tx.objectStore(CHUNKS_STORE);
        const manifest = tx.objectStore(MANIFEST_STORE);

        chunks.put(blob, `chunk_${idx}`);
        manifest.put({ lastIdx: idx, totalSize: totalBytes + blob.size, timestamp: Date.now() }, 'current_session');

        tx.oncomplete = () => {
            const end = performance.now();
            const duration = end - start;
            latencies.push(duration);
            totalBytes += blob.size;
            pendingWrites--;
            
            chunksEl.innerText = (idx + 1).toString();
            dataEl.innerText = (totalBytes / (1024 * 1024)).toFixed(2);
            pendingEl.innerText = pendingWrites.toString();
            
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            latencyEl.innerText = avg.toFixed(1);

            const sorted = [...latencies].sort((a, b) => a - b);
            const p95Idx = Math.floor(sorted.length * 0.95);
            p95El.innerText = sorted[p95Idx].toFixed(1);

            if (window.performance && window.performance.memory) {
                heapEl.innerText = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2);
            }
            
            resolve();
        };

        tx.onerror = () => {
            log(`ERROR: Transaction failed for chunk ${idx}`);
            pendingWrites--;
            reject(tx.error);
        };
    });
}

async function runLoop() {
    const mode = document.getElementById('mode').value;
    let sizeMb = 5;
    let interval = 5000;

    switch(mode) {
        case '1080p': sizeMb = 5; interval = 5000; break;
        case '4k': sizeMb = 15; interval = 5000; break;
        case 'ultrawide': sizeMb = 25; interval = 5000; break;
        case 'stress': sizeMb = 10; interval = 1000; break;
    }

    log(`Starting Loop: ${sizeMb}MB every ${interval}ms`);

    while (isRunning) {
        const loopStart = Date.now();
        const blob = generateDummyBlob(sizeMb);
        
        try {
            await persistChunk(chunkCounter, blob);
            chunkCounter++;
        } catch (e) {
            log(`Loop execution error: ${e}`);
        }

        const elapsed = Date.now() - loopStart;
        const sleep = Math.max(0, interval - elapsed);
        await new Promise(r => setTimeout(r, sleep));
    }
}

document.getElementById('start-btn').onclick = async () => {
    if (isRunning) return;
    if (!db) await initDB();
    isRunning = true;
    log('SOAK TEST STARTED');
    runLoop();
};

document.getElementById('stop-btn').onclick = () => {
    isRunning = false;
    log('SOAK TEST STOPPED');
};

document.getElementById('clear-btn').onclick = async () => {
    if (isRunning) return;
    log('Wiping Database...');
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
        log('Database wiped successfully.');
        chunkCounter = 0;
        totalBytes = 0;
        latencies = [];
        chunksEl.innerText = '0';
        dataEl.innerText = '0';
        latencyEl.innerText = '0';
        p95El.innerText = '0';
    };
};
