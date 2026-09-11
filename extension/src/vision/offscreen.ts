import { pipeline, env } from '@huggingface/transformers';

// Setup Transformers.js for WebGPU
env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('assets/');
}

let objectDetector: any = null;
let currentBackend: string = 'unknown';

async function loadModel() {
    if (!objectDetector) {
        try {
            objectDetector = await pipeline('object-detection', 'Xenova/yolos-tiny', {
                device: 'webgpu'
            });
            currentBackend = 'webgpu';
            console.log("[LocalSight] CV BACKEND: WebGPU");
        } catch (e) {
            console.warn("[LocalSight] WebGPU failed, falling back to wasm:", e);
            objectDetector = await pipeline('object-detection', 'Xenova/yolos-tiny', {
                device: 'wasm'
            });
            currentBackend = 'wasm';
            console.log("[LocalSight] CV BACKEND: WASM");
        }
    }
    return objectDetector;
}

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.action === 'DETECT_OBJECTS') {
        console.log("[LocalSight] MESSAGE: DETECT_OBJECTS RECEIVED");
        loadModel().then(async (detector) => {
            const results = await detector(message.image_url);
            sendResponse({ results, backend: currentBackend });
        }).catch(err => {
            console.error("Transformers.js Error:", err);
            sendResponse({ error: err.message });
        });
        return true; // Keep channel open
    }
});
