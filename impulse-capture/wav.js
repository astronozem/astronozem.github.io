// Another WAVE writer class that can be used to encode audio data into a WAV file.
// 24-bit.
class Encoder {
    constructor(sampleRate, numChannels = 1) {
        this.sampleRate = sampleRate;
        this.numChannels = numChannels;
        this.samples = [];
    }

    encode(buffers) {
        if (this.numChannels === 1) {
            this.samples.push(buffers[0]);
        } else {
            for (let i = 0; i < buffers[0].length; ++i) {
                for (let ch = 0; ch < this.numChannels; ++ch) {
                    this.samples.push(buffers[ch][i]);
                }
            }
        }
    }

    floatTo24BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 3) {
            let sample = Math.max(-1, Math.min(1, input[i]));
            sample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
            sample = Math.floor(sample);

            output[offset] = (sample & 0xFF);
            output[offset + 1] = (sample >> 8) & 0xFF;
            output[offset + 2] = (sample >> 16) & 0xFF;
        }
    }

    finish() {
        let totalSamples = this.samples.reduce((acc, val) => acc + val.length, 0);
        let dataSize = totalSamples * 3; // 24-bit = 3 bytes per sample
        let buffer = new ArrayBuffer(44 + dataSize);
        let view = new DataView(buffer);

        let writeString = (view, offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        // RIFF header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');

        // fmt chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true);  // PCM format
        view.setUint16(22, this.numChannels, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, this.sampleRate * this.numChannels * 3, true); // byte rate
        view.setUint16(32, this.numChannels * 3, true); // block align
        view.setUint16(34, 24, true); // bits per sample

        // data chunk
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Write samples
        let offset = 44;
        for (let i = 0; i < this.samples.length; i++) {
            this.floatTo24BitPCM(new Uint8Array(buffer), offset, this.samples[i]);
            offset += this.samples[i].length * 3;
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }
}