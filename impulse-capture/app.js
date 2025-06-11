let mediaRecorder;
let recordedChunks = [];
let audioContext = null;
let monitoringStream = null;
let analyser;
let sweepSource;
let gainNode;
let signalStartTime = 0;
let startAudioButton, stopMonitoringButton, recordButton, status, levels, scope, meter, progress, recordings;
let sweepLevel, sweepLevelValue, signalType, signalDuration, signalDurationValue;

function init() {
    startAudioButton = document.getElementById('startAudioButton');
    stopMonitoringButton = document.getElementById('stopMonitoringButton');
    recordButton = document.getElementById('recordButton');
    status = document.getElementById('status');
    levels = document.getElementById('levels');
    scope = document.getElementById('scope');
    meter = document.getElementById('meter');
    progress = document.getElementById('progress');
    recordings = document.getElementById('recordings');
    sweepLevel = document.getElementById('sweepLevel');
    sweepLevelValue = document.getElementById('sweepLevelValue');
    signalType = document.getElementById('signalType');
    signalDuration = document.getElementById('signalDuration');
    signalDurationValue = document.getElementById('signalDurationValue');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder || !window.AudioContext || !window.WavAudioEncoder) {
        status.textContent = 'Error: Browser does not support required APIs.';
        startAudioButton.disabled = true;
        recordButton.disabled = true;
        sweepLevel.disabled = true;
        signalType.disabled = true;
        signalDuration.disabled = true;
        console.error('Required APIs not supported.');
    } else {
        sweepLevel.addEventListener('input', () => {
            sweepLevelValue.textContent = `${sweepLevel.value} dBFS`;
        });
        signalDuration.addEventListener('input', () => {
            signalDurationValue.textContent = `${signalDuration.value} s`;
        });
    }
    startAudioButton.addEventListener('click', () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created.');
        }
        audioContext.resume().then(() => {
            console.log('AudioContext resumed. State:', audioContext.state);
            navigator.mediaDevices.getUserMedia({
                audio: {
                    autoGainControl: false,
                    noiseSuppression: false,
                    echoCancellation: false
                }
            })
                .then(stream => {
                    monitoringStream = stream;
                    console.log('Monitoring stream constraints:', stream.getAudioTracks()[0].getSettings());
                    setupScopeAndMetering(monitoringStream);
                    status.textContent = 'Monitoring active. Hold the record button to play and capture a signal.';
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
    recordButton.addEventListener('mousedown', startRecording);
    recordButton.addEventListener('touchstart', startRecording);
    recordButton.addEventListener('mouseup', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        resetRecordButton();
    });
    recordButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        resetRecordButton();
    });

    recordButton.addEventListener('touchmove', e => e.preventDefault());

    window.addEventListener('unload', () => {
        if (monitoringStream) {
            monitoringStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext) {
            audioContext.close();
        }
    });
}
document.addEventListener('DOMContentLoaded', init);

function generateExcitationSignal() {
    if (!audioContext || audioContext.state !== 'running') {
        console.error('AudioContext not initialized or not running.');
        status.textContent = 'Error: Audio not started. Click "Start Audio" first.';
        return null;
    }
    const sampleRate = audioContext.sampleRate;
    const silenceDuration = 0.5;
    const signalDurationSec = parseFloat(signalDuration.value);
    const totalDuration = silenceDuration + signalDurationSec;
    const bufferSize = Math.floor(sampleRate * totalDuration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    const silenceSamples = Math.floor(sampleRate * silenceDuration);

    for (let i = 0; i < silenceSamples; i++) {
        data[i] = 0;
    }

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
        data[silenceSamples] = 1;
        console.log(`Generated impulse: ${signalDurationSec}s duration.`);
    } else if (type === 'noise') {
        for (let i = silenceSamples; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
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
    signalStartTime = performance.now();
    sweepSource.start();
    console.log(`Signal started at ${signalStartTime}ms, type: ${type}, level: ${dbLevel} dBFS.`);
    return sweepSource;
}

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

function cloneAudioBuffer(audioBuffer) {
    const newBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        newBuffer.getChannelData(i).set(audioBuffer.getChannelData(i));
    }
    return newBuffer;
}

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
    scope.height = 100;

    const dbRange = 70;
    const meterCtx = meter.getContext('2d');
    meter.width = 600;
    meter.height = 20;
    const bottomEnd = ((dbRange - 50) / dbRange) * meter.width;
    const greenEnd = ((dbRange - 12) / dbRange) * meter.width;
    const yellowEnd = ((dbRange - 3) / dbRange) * meter.width;
    const redEnd = meter.width;


    let progressCtx = null;
    if (progress) {
        progressCtx = progress.getContext('2d');
        progress.width = 600;
        progress.height = 20;
        console.log('Progress canvas initialized:', progress.width, 'x', progress.height);
    }

    function drawScopeMeterProgress() {
        requestAnimationFrame(drawScopeMeterProgress);
        analyser.getFloatTimeDomainData(dataArray);

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

        meterCtx.fillStyle = 'red';
        meterCtx.fillRect(0, 0, bottomEnd, 20);
        meterCtx.fillStyle = 'green';
        meterCtx.fillRect(bottomEnd, 0, greenEnd - bottomEnd, 20);
        meterCtx.fillStyle = 'yellow';
        meterCtx.fillRect(greenEnd, 0, yellowEnd - greenEnd, 20);
        meterCtx.fillStyle = 'red';
        meterCtx.fillRect(yellowEnd, 0, redEnd - yellowEnd, 20);
        const peakNorm = Math.max(0, (peakDB + dbRange) / dbRange);
        const barWidth = peakNorm * meter.width;
        meterCtx.fillStyle = 'black';
        meterCtx.fillRect(barWidth - 2, 0, 2, 20);

        if (signalStartTime > 0 && progressCtx) {
            console.log('Progress bar active, elapsed:', performance.now() - signalStartTime);
            const elapsed = (performance.now() - signalStartTime) / 1000;
            const totalDuration = parseFloat(signalDuration.value) + 0.5;
            if (elapsed <= totalDuration) {
                progressCtx.fillStyle = '#f4f4f4';
                progressCtx.fillRect(0, 0, progress.width, progress.height);
                const progressRatio = elapsed / totalDuration;
                progressCtx.fillStyle = '#ddd';
                progressCtx.fillRect(0, 0, progressRatio * progress.width, progress.height);
                const markerX = (0.5 / totalDuration) * progress.width;
                progressCtx.strokeStyle = 'blue';
                progressCtx.lineWidth = 2;
                progressCtx.beginPath();
                progressCtx.moveTo(markerX, 0);
                progressCtx.lineTo(markerX, progress.height);
                progressCtx.stroke();
                progressCtx.strokeStyle = 'black';
                progressCtx.beginPath();
                const lineX = progressRatio * progress.width;
                progressCtx.moveTo(lineX, 0);
                progressCtx.lineTo(lineX, progress.height);
                progressCtx.stroke();
            } else {
                signalStartTime = 0;
                progressCtx.fillStyle = '#f4f4f4';
                progressCtx.fillRect(0, 0, progress.width, progress.height);
                console.log('Progress bar reset.');
            }
        }
    }
    drawScopeMeterProgress();
}

async function drawWaveform(audioBuffer, canvas) {
    const data = audioBuffer.getChannelData(0);
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 50;
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    const step = Math.ceil(data.length / canvas.width);
    ctx.beginPath();
    for (let i = 0; i < canvas.width; i++) {
        let maxPositive = 0;
        let minNegative = 0;
        for (let j = 0; j < step; j++) {
            const sample = data[i * step + j] || 0;
            if (sample > 0) {
                maxPositive = Math.max(maxPositive, sample);
            } else {
                minNegative = Math.min(minNegative, sample);
            }
        }
        const x = i;
        const yPositive = canvas.height / 2 - (maxPositive * canvas.height) / 2;
        const yNegative = canvas.height / 2 - (minNegative * canvas.height) / 2;
        if (i === 0) {
            ctx.moveTo(x, yPositive);
        } else {
            ctx.lineTo(x, yPositive);
        }
        ctx.lineTo(x, yNegative);
    }
    ctx.stroke();
}

function startRecording(e) {
    e.preventDefault();
    if (!audioContext || audioContext.state !== 'running') {
        status.textContent = 'Error: Audio not started. Click "Start Audio" first.';
        console.error('AudioContext not running.');
        return;
    }
    // recordButton.textContent = 'Stop Recording';
    recordButton.className = 'recording';
    navigator.mediaDevices.getUserMedia({
        audio: {
            autoGainControl: false,
            noiseSuppression: false,
            echoCancellation: false
        }
    })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = ev => {
                if (ev.data.size > 0) {
                    recordedChunks.push(ev.data);
                    console.log('Audio data chunk received:', ev.data.size, 'bytes');
                }
            };
            mediaRecorder.onstop = async () => {
                console.log('MediaRecorder stopped, state:', mediaRecorder.state);
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                console.log('Recorded buffer samples:', audioBuffer.getChannelData(0).slice(0, 100));
                const originalBuffer = cloneAudioBuffer(audioBuffer);
                const encoder = new WavAudioEncoder(audioBuffer.sampleRate, 1);
                encoder.encode([audioBuffer.getChannelData(0)]);
                let wavBlob = encoder.finish();
                let url = URL.createObjectURL(wavBlob);
                let isNormalized = false;
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
                    a.download = `${signalType.value}_${isNormalized ? 'normalized' : 'original'}_${new Date().toISOString()}.wav`;
                    a.click();
                };
                const normalizeButton = document.createElement('button');
                normalizeButton.textContent = 'Normalize';
                normalizeButton.onclick = async () => {
                    isNormalized = !isNormalized;
                    const currentBuffer = isNormalized ? normalizeAudioBuffer(cloneAudioBuffer(originalBuffer)) : originalBuffer;
                    const normEncoder = new WavAudioEncoder(currentBuffer.sampleRate, 1);
                    normEncoder.encode([currentBuffer.getChannelData(0)]);
                    wavBlob = normEncoder.finish();
                    url = URL.createObjectURL(wavBlob);
                    audio.src = url;
                    drawWaveform(currentBuffer, canvas);
                    normalizeButton.textContent = isNormalized ? 'Un-normalize' : 'Normalize';
                    downloadButton.onclick = () => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${signalType.value}_${isNormalized ? 'normalized' : 'original'}_${new Date().toISOString()}.wav`;
                        a.click();
                    };
                };
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.onclick = () => recordingDiv.remove();
                recordingDiv.appendChild(audio);
                recordingDiv.appendChild(canvas);
                recordingDiv.appendChild(downloadButton);
                recordingDiv.appendChild(normalizeButton);
                recordingDiv.appendChild(deleteButton);
                recordings.prepend(recordingDiv);
                drawWaveform(audioBuffer, canvas);
                recordedChunks = [];
                resetRecordButton();
                signalStartTime = 0;
                status.textContent = 'Monitoring active. Hold the record button to play and capture a signal.';
                console.log('Recording saved as WAV at', performance.now(), 'ms.');
                stream.getTracks().forEach(track => track.stop());
                if (sweepSource) {
                    sweepSource.stop();
                    sweepSource = null;
                }
            };
            sweepSource = generateExcitationSignal();
            if (!sweepSource) {
                stream.getTracks().forEach(track => track.stop());
                resetRecordButton();
                return;
            }
            setTimeout(() => {
                if (mediaRecorder.state !== 'recording') {
                    mediaRecorder.start();
                    console.log(`Recording started at ${performance.now()}ms, state: ${mediaRecorder.state}`);
                }
            }, 100);
            status.textContent = `Playing ${signalType.value} and recording playback... Release or tap again to stop recording.`;
            console.log(`Recording initiated at ${performance.now()}ms.`);
            mediaRecorder.addEventListener('stop', () => {
                if (sweepSource) {
                    sweepSource.stop();
                    sweepSource = null;
                }
                signalStartTime = 0;
                resetRecordButton();
                console.log('Recording stopped at', performance.now(), 'ms.');
            }, { once: true });
        })
        .catch(err => {
            status.textContent = `Error: ${err.name} - ${err.message}`;
            console.error(`Microphone error: ${err.name} - ${err.message}`);
            resetRecordButton();
            signalStartTime = 0;
        });
}

function resetRecordButton() {
    if (recordButton) {
        recordButton.textContent = 'Press & hold to Record / Play Signal';
        recordButton.className = '';
    }
}

