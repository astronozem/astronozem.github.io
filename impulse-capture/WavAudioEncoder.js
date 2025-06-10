// Source : https://github.com/higuma/wav-audio-encoder-js
// MIT license
// Adapted by AI to write 24 bit wavs.

(function (self) {
    var min = Math.min,
        max = Math.max;

    var setString = function (view, offset, str) {
        var len = str.length;
        for (var i = 0; i < len; ++i)
            view.setUint8(offset + i, str.charCodeAt(i));
    };

    var Encoder = function (sampleRate, numChannels) {
        this.sampleRate = sampleRate;
        this.numChannels = numChannels;
        this.numSamples = 0;
        this.dataViews = [];
    };

    Encoder.prototype.encode = function (buffer) {
        var len = buffer[0].length,
            nCh = this.numChannels,
            view = new DataView(new ArrayBuffer(len * nCh * 3)),
            offset = 0;
        for (var i = 0; i < len; ++i)
            for (var ch = 0; ch < nCh; ++ch) {
                var x = buffer[ch][i] * 0x7FFFFF; // Scale to 24-bit range
                var sample = x < 0 ? max(x, -0x800000) : min(x, 0x7FFFFF);
                // Write 24-bit sample (little-endian)
                view.setUint8(offset, sample & 0xFF);
                view.setUint8(offset + 1, (sample >> 8) & 0xFF);
                view.setUint8(offset + 2, (sample >> 16) & 0xFF);
                offset += 3;
            }
        this.dataViews.push(view);
        this.numSamples += len;
    };

    Encoder.prototype.finish = function (mimeType) {
        var dataSize = this.numChannels * this.numSamples * 3,
            view = new DataView(new ArrayBuffer(44));
        setString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        setString(view, 8, 'WAVE');
        setString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, this.numChannels, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, this.sampleRate * this.numChannels * 3, true); // Byte rate
        view.setUint16(32, this.numChannels * 3, true); // Block align
        view.setUint16(34, 24, true); // Bits per sample
        setString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        this.dataViews.unshift(view);
        var blob = new Blob(this.dataViews, { type: 'audio/wav' });
        this.cleanup();
        return blob;
    };

    Encoder.prototype.cancel = Encoder.prototype.cleanup = function () {
        delete this.dataViews;
    };

    self.WavAudioEncoder = Encoder;
})(self);