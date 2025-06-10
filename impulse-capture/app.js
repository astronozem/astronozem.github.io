// Initialize variables
let mediaRecorder;
let recordedChunks = [];
let audioContext = null;
let monitoringStream = null;
let analyser;
let sweepSource;
let gainNode;
const startAudioButton = document.getElementById('startAudioButton');
const stopMonitoringButton = document.getElementById('stopMonitoringButton');
const recordButton = document.getElementById('recordButton');
const status = document.getElementById('status');
const levels = document.getElementById('levels');
const scope = document.getElementById('scope');
const meter = document.getElementById('meter');
const recordings = document.getElementById('recordings');
const sweepLevel = document.getElementById('sweepLevel');
const sweepLevelValue = document.getElementById('sweepLevelValue');
const signalType = document.getElementById('signalType');
const signalDuration = document.getElementById('signalDuration');
const signalDurationValue = document.getElementById('signalDurationValue');

// Initialize app
function init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder || !window.AudioContext || !window.WavAudioEncoder) {
        status.textContent = 'Error: Browser does not support required APIs.';
        startAudioButton.disabled = true;
        recordButton.disabled = true;
        sweepLevel.disabled = true;
        signalType.disabled = true;
        signalDuration.disabled = true;
        console.error('Required APIs not supported.');
    } else {
        console.log('Required APIs supported.');
        sweepLevel.addEventListener('input', () => {
            sweepLevelValue.textContent = `${sweepLevel.value} dBFS`;
        });
        signalDuration.addEventListener('input', () => {
            signalDurationValue.textContent = `${signalDuration.value} s`;
        });
    }
}
init();

// Start AudioContext and monitoring
startAudioButton.addEventListener('click', () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext created.');
    }
    audioContext.resume().then(() => {
        console.log('AudioContext resumed. State:', audioContext.state);
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                monitoringStream = stream;
                setupScopeAndMetering(monitoringStream);
                status.textContent = 'Monitoring active. Hold the record button to capture a signal.';
                startAudioButton.disabled = true;
                stopMonitoringButton.disabled = false;
                recordButton.disabled = false;
            })
            .catch(err => {
                status.textContent = `Error starting microphone: ${err.name} - ${err.message}`;
                console.error('Microphone error:', err);
            });
    }).catch(err => {
        status.textContent = `Error starting audio: ${err.name} - ${err.message}`;
        console.error('AudioContext resume error:', err);
    });
});

// Stop monitoring
stopMonitoringButton.addEventListener('click', () => {
    if (monitoringStream) {
        monitoringStream.getTracks().forEach(track => track.stop());
        monitoringStream = null;
        analyser = null;
        status.textContent = 'Monitoring stopped. Click "Start Audio" to resume.';
        startAudioButton.disabled = false;
        stopMonitoringButton.disabled = true;
        recordButton.disabled = true;
        levels.textContent = 'Input: -∞ dBFS (RMS) / -∞ dBFS (Peak)';
        console.log('Monitoring stopped.');
    }
});

// Generate excitation signal
function generateExcitationSignal() {
    if (!audioContext || audioContext.state !== 'running') {
        console.error('AudioContext not initialized or not running.');
        status.textContent = 'Error: Audio not started. Click "Start Audio" first.';
        return null;
    }
    const sampleRate = audioContext.sampleRate;
    const silenceDuration = 0.5; // 0.5 seconds silence
    const signalDurationSec = parseFloat(signalDuration.value);
    const totalDuration = silenceDuration + signalDurationSec;
    const bufferSize = Math.floor(sampleRate * totalDuration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    const silenceSamples = Math.floor(sampleRate * silenceDuration);

    // Fill silence
    for (let i = 0; i < silenceSamples; i++) {
        data[i] = 0;
    }

    // Generate signal
    const type = signalType.value;
    if (type === 'sweep') {
        const f1 = 20;
        const f2 = 20000;
        const T = signalDurationSec;
        const K = (T * f1) / Math.log(f2 / f1);
        const L = T / Math.log(f2 / f1);
        for (let i = silenceSamples; i < bufferSize; i++) {
            const t = (i - silenceSamples) / sampleRate;
            const freq = f1 * Math.exp(t / L);
            data[i] = Math.sin(2 * Math.PI * K * (Math.exp(t / L) - 1));
        }
        console.log(`Generated log sweep: ${signalDurationSec}s, 20 Hz to 20 kHz.`);
    } else if (type === 'impulse') {
        data[silenceSamples] = 1; // Single-sample spike
        console.log(`Generated impulse: ${signalDurationSec}s duration.`);
    } else if (type === 'noise') {
        for (let i = silenceSamples; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // White noise [-1, 1]
        }
        console.log(`Generated noise burst: ${signalDurationSec}s.`);
    }

    sweepSource = audioContext.createBufferSource();
    sweepSource.buffer = buffer;
    gainNode = audioContext.createGain();
    const dbLevel = parseFloat(sweepLevel.value);
    gainNode.gain.value = Math.pow(10, dbLevel / 20);
    sweepSource.connect(gainNode);
    gainNode.connect(audioContext.destination);
    const startTime = performance.now();
    sweepSource.start();
    console.log(`Signal started at ${startTime}ms, type: ${type}, level: ${dbLevel} dBFS.`);
    return sweepSource;
}

// Normalize audio buffer
function normalizeAudioBuffer(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
        max = Math.max(max, Math.abs(data[i]));
    }
    if (max > 0) {
        const scale = 1 / max;
        for (let i = 0; i < data.length; i++) {
            data[i] *= scale;
        }
        console.log(`Normalized audio. Original max amplitude: ${max}`);
    }
    return audioBuffer;
}

// Setup scope, meter, and level metering
function setupScopeAndMetering(stream) {
    if (!audioContext) {
        console.error('AudioContext not initialized.');
        return;
    }
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const scopeCtx = scope.getContext('2d');
    scope.width = scope.offsetWidth;
    scope.height = 120;

    const meterCtx = meter.getContext('2d');
    meter.width = 100;
    meter.height = 120;

    function drawScopeAndMeter() {
        requestAnimationFrame(drawScopeAndMeter);
        analyser.getFloatTimeDomainData(dataArray);

        // Calculate RMS and Peak
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < bufferLength; i++) {
            const sample = Math.abs(dataArray[i]);
            sumSquares += sample * sample;
            peak = Math.max(peak, sample);
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const rmsDB = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        const peakDB = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        levels.textContent = `Input: ${rmsDB.toFixed(2)} dBFS (RMS) / ${peakDB.toFixed(2)} dBFS (Peak)`;

        // Draw oscilloscope
        scopeCtx.fillStyle = '#f4f4f4';
        scopeCtx.fillRect(0, 0, scope.width, scope.height);
        scopeCtx.strokeStyle = '#333';
        scopeCtx.lineWidth = 1;
        scopeCtx.beginPath();
        const sliceWidth = scope.width / bufferLength;
        for (let i = 0; i < bufferLength; i++) {
            const x = i * sliceWidth;
            const y = scope.height / 2 - (dataArray[i] * scope.height) / 2;
            if (i === 0) {
                scopeCtx.moveTo(x, y);
            } else {
                scopeCtx.lineTo(x, y);
            }
        }
        scopeCtx.stroke();

        // Draw peak meter
        meterCtx.fillStyle = '#f4f4f4';
        meterCtx.fillRect(0, 0, meter.width, meter.height);
        const dbRange = 100; // -100 to 0 dBFS
        const peakNorm = Math.max(0, (peakDB + 100) / dbRange); // 0 to 1
        const barHeight = peakNorm * meter.height;
        const y = meter.height - barHeight;
        meterCtx.fillStyle = peakDB >= -3 ? 'red' : peakDB >= -12 ? 'yellow' : 'green';
        meterCtx.fillRect(0, y, meter.width, barHeight);
    }
    drawScopeAndMeter();
}

// Draw waveform for saved recording
async function drawWaveform(audioBuffer, canvas) {
    const data = audioBuffer.getChannelData(0);
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 60;
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.ceil(data.length / canvas.width);
    for (let i = 0; i < canvas.width; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
            sum += Math.abs(data[i * step + j] || 0);
        }
        const avg = sum / step;
        const y = canvas.height / 2 - (avg * canvas.height) / 2;
        if (i === 0) {
            ctx.moveTo(i, y);
        } else {
            ctx.lineTo(i, y);
        }
    }
    ctx.stroke();
}

// Start recording and signal
function startRecording(e) {
    e.preventDefault();
    if (!audioContext || audioContext.state !== 'running') {
        status.textContent = 'Error: Audio not started. Click "Start Audio" first.';
        console.error('AudioContext not running.');
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = ev => {
                if (ev.data.size > 0) {
                    recordedChunks.push(ev.data);
                    console.log('Audio data chunk received:', ev.data.size, 'bytes');
                }
            };
            mediaRecorder.onstop = async () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const normalizedBuffer = normalizeAudioBuffer(audioBuffer);
                const encoder = new WavAudioEncoder(audioBuffer.sampleRate, 1);
                encoder.encode([normalizedBuffer.getChannelData(0)]);
                const wavBlob = encoder.finish();
                const url = URL.createObjectURL(wavBlob);
                const recordingDiv = document.createElement('div');
                recordingDiv.className = 'recording';
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = url;
                const canvas = document.createElement('canvas');
                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'Download';
                downloadButton.onclick = () => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${signalType.value}_${new Date().toISOString()}.wav`;
                    a.click();
                };
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.onclick = () => recordingDiv.remove();
                recordingDiv.appendChild(audio);
                recordingDiv.appendChild(canvas);
                recordingDiv.appendChild(downloadButton);
                recordingDiv.appendChild(deleteButton);
                recordings.prepend(recordingDiv);
                drawWaveform(normalizedBuffer, canvas);
                recordedChunks = [];
                recordButton.className = '';
                status.textContent = 'Monitoring active. Hold the record button to capture a signal.';
                console.log('Recording saved as WAV.');
                // Clean up recording stream
                stream.getTracks().forEach(track => track.stop());
                if (sweepSource) {
                    sweepSource.stop();
                    sweepSource = null;
                }
            };
            const recordStartTime = performance.now();
            mediaRecorder.start();
            sweepSource = generateExcitationSignal();
            if (!sweepSource) {
                mediaRecorder.stop();
                return;
            }
            recordButton.className = 'recording';
            status.textContent = `Playing ${signalType.value}... Release to stop.`;
            console.log(`Recording started at ${recordStartTime}ms.`);
            mediaRecorder.addEventListener('stop', () => {
                if (sweepSource) {
                    sweepSource.stop();
                    sweepSource = null;
                }
                console.log('Recording stopped at', performance.now(), 'ms.');
            }, { once: true });
        })
        .catch(err => {
            status.textContent = `Error: ${err.name} - ${err.message}`;
            console.error(`Microphone error: ${err.name} - ${err.message}`);
            recordButton.className = '';
        });
}

// Event listeners for hold-to-record
recordButton.addEventListener('mousedown', startRecording);
recordButton.addEventListener('touchstart', startRecording);
recordButton.addEventListener('mouseup', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
});
recordButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
});

// Prevent touch scrolling
recordButton.addEventListener('touchmove', e => e.preventDefault());

// Cleanup on page unload
window.addEventListener('unload', () => {
    if (monitoringStream) {
        monitoringStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
});