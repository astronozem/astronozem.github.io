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

function fillSilence(data, silenceSamples) {
    for (let i = 0; i < silenceSamples; i++) {
        data[i] = 0;
    }
}

function generateSignal(data, silenceSamples, bufferSize, signalDurationSec) {
    const type = signalType.value;
    switch (type) {
        case 'sweep':
            generateSweep(data, silenceSamples, bufferSize, signalDurationSec);
            break;
        case 'impulse':
            generateImpulse(data, silenceSamples);
            break;
        case 'noise':
            generateNoise(data, silenceSamples, bufferSize);
            break;
        default:
            console.error('Unknown signal type.');
    }
}

function generateSweep(data, silenceSamples, bufferSize, signalDurationSec) {
    const f1 = 20;
    const f2 = 20000;
    const T = signalDurationSec;
    const K = (T * f1) / Math.log(f2 / f1);
    const L = T / Math.log(f2 / f1);

    for (let i = silenceSamples; i < bufferSize; i++) {
        const t = (i - silenceSamples) / audioContext.sampleRate;
        const freq = f1 * Math.exp(t / L);
        data[i] = Math.sin(2 * Math.PI * K * (Math.exp(t / L) - 1));
    }
}

function generateImpulse(data, silenceSamples) {
    data[silenceSamples] = 1;
}

function generateNoise(data, silenceSamples, bufferSize) {
    for (let i = silenceSamples; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
}
