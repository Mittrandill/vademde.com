"""Vademde yenilendi — müzik + ses efektleri (yalnızca numpy ile sentez).

100 BPM, Do majör, I–V–vi–IV (C–G–Am–F); her ölçü = bir sahne (2,4 sn).
Efekt zamanları dist/timeline.json'dan (src/timeline.js → audioEvents) okunur.
Kullanım: python3 audio.py dist/timeline.json out/audio.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

timeline = json.load(open(sys.argv[1]))
DUR = timeline["duration"]
N = int(DUR * SR) + SR  # kuyruk için 1 sn
L = np.zeros(N)
R = np.zeros(N)
send = np.zeros(N)  # yankı (reverb) gönderimi
side = np.ones(N)   # kick'e bağlı "pompalama"


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def place(buf, at, sig, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def stereo(at, sig, gain=1.0, pan=0.0, rev=0.0):
    place(L, at, sig, gain * (1 - max(pan, 0)))
    place(R, at, sig, gain * (1 + min(pan, 0)))
    if rev:
        place(send, at, sig, gain * rev)


def hz(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def saw(f, t, harmonics=12, roll=1.0):
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if k * f > 12000:
            break
        out += np.sin(2 * np.pi * k * f * t) / k ** roll
    return out


def fft_filter(sig, lo=0, hi=None):
    S = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    m = f >= lo
    if hi:
        m &= f <= hi
    return np.fft.irfft(S * m, len(sig))


# ---------- Davul ----------
def kick():
    t = tt(0.45)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) + 0.4 * fft_filter(rng.standard_normal(len(t)), 2000) * np.exp(-t / 0.004)


def clap():
    t = tt(0.3)
    n = fft_filter(rng.standard_normal(len(t)), 900, 7000)
    e = np.exp(-t / 0.07)
    for d in (0.0, 0.011, 0.022):  # el çırpma "katmanları"
        e += 0.6 * np.exp(-np.clip(t - d, 0, None) / 0.008) * (t >= d)
    return n * e * 0.5


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    return fft_filter(rng.standard_normal(len(t)), 7000) * np.exp(-t / (0.08 if open_ else 0.015))


K, C, H, HO = kick(), clap(), hat(), hat(True)

# ---------- Armoni ----------
PROG = [  # (bas kökü, akor notaları)
    (36, [60, 64, 67, 72]),  # C
    (43, [59, 62, 67, 71]),  # G
    (45, [60, 64, 69, 72]),  # Am
    (41, [60, 65, 69, 72]),  # F
]
bars = int(np.ceil(DUR / BAR))
drums_from, drums_to = 1, bars - 1  # giriş ölçüsünde davul yok, son ölçü çınlar

for b in range(bars):
    t0 = b * BAR
    root, chord = PROG[b % 4]
    last = b == bars - 1
    if last:
        root, chord = 36, [60, 64, 67, 72, 76]

    # Pad: yumuşak atak, hafif dekotune, stereo genişlik
    pl = tt(BAR + (1.6 if last else 0.25))
    a = np.minimum(pl / 0.35, 1) * np.exp(-np.clip(pl - BAR, 0, None) / 0.4)
    padL = sum(saw(hz(n) * 0.997, pl, 10, 1.4) for n in chord) * a
    padR = sum(saw(hz(n) * 1.003, pl, 10, 1.4) for n in chord) * a
    g = 0.035 if b else 0.022
    place(L, t0, padL, g)
    place(R, t0, padR, g)
    place(send, t0, padL + padR, g * 0.25)

    # Arp: 16'lık pluck, akor tonları yukarı-aşağı
    steps = 16 if not last else 1
    pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
    for s in range(steps):
        n = chord[pattern[s] % len(chord)] + 12
        pt = tt(0.5)
        pluck = sum(np.sin(2 * np.pi * k * hz(n) * pt) / k * np.exp(-pt * (6 + 4 * k)) for k in range(1, 7))
        gain = (0.05 if b else 0.03) * (1.15 if s % 4 == 0 else 0.85)
        stereo(t0 + s * BEAT / 4, pluck, gain, pan=0.35 if s % 2 else -0.35, rev=0.5)

    # Bas: offbeat 8'likler (kick ile çakışmaz), oktav atlayarak
    if 0 < b < bars - 1:
        for q in range(4):
            bt = tt(BEAT / 2 * 0.9)
            env = np.minimum(bt / 0.005, 1) * np.exp(-bt / 0.2)
            f = hz(root - 12 if q % 2 == 0 else root)
            sig = (np.sin(2 * np.pi * f * bt) + 0.35 * saw(f, bt, 6, 1.2)) * env
            stereo(t0 + q * BEAT + BEAT / 2, sig, 0.2)

    # Davul
    if drums_from <= b < drums_to:
        for q in range(4):
            bt = t0 + q * BEAT
            stereo(bt, K, 0.9)
            place(side, bt, -0.55 * np.exp(-tt(0.3) / 0.11))
            if q % 2 == 1:
                stereo(bt, C, 0.55, rev=0.25)
            stereo(bt + BEAT / 2, HO if q == 3 else H, 0.12 if q == 3 else 0.2, pan=0.25)
            stereo(bt + BEAT / 4, H, 0.07, pan=-0.25)
            stereo(bt + 3 * BEAT / 4, H, 0.07, pan=-0.25)
    if b == bars - 1:
        stereo(t0, K, 0.9)

# ---------- Efektler ----------
def whoosh(dur=0.55):
    t = tt(dur)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    win = 2048
    hop = win // 4
    w = np.hanning(win)
    for i in range(0, len(t) - win, hop):  # merkez frekansı yükselip düşen bant
        p = i / len(t)
        fc = 400 + 5000 * np.sin(np.pi * p) ** 2
        seg = fft_filter(n[i:i + win] * w, fc * 0.6, fc * 1.6)
        out[i:i + win] += seg
    return out * np.sin(np.pi * t / dur) ** 2 * 0.9


def riser(dur=1.2):
    t = tt(dur)
    f = 200 * (12 ** (t / dur))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (fft_filter(rng.standard_normal(len(t)), 1500) * 0.5 + tone) * (t / dur) ** 2


def impact():
    t = tt(1.4)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.45)
    crash = fft_filter(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.5) * 0.35
    return boom + crash


def pop():
    t = tt(0.12)
    f = 520 + 700 * np.exp(-t / 0.02)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)


def ding():
    t = tt(1.2)
    return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in
               [(1568, 1.0, 0.45), (2093, 0.6, 0.35), (3136, 0.25, 0.2), (4186, 0.12, 0.12)])


def scan():
    t = tt(0.6)
    f = 700 + 1600 * t / 0.6
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.6) * 0.5


FX = {
    "whoosh": (whoosh(), 0.28, -0.275, 0.2),
    "riser": (riser(), 0.35, 0.0, 0.3),
    "impact": (impact(), 0.6, 0.0, 0.35),
    "pop": (pop(), 0.35, 0.0, 0.3),
    "ding": (ding(), 0.16, 0.0, 0.5),
    "scan": (scan(), 0.12, 0.0, 0.3),
}
for ev in timeline["events"]:
    sig, gain, offset, rev = FX[ev["kind"]]
    at = max(0.0, ev["t"] + offset)
    stereo(at, sig, gain, rev=rev)

# ---------- Mix ----------
L *= side
R *= side

# Yankı: üstel sönümlü gürültü IR'si ile FFT konvolüsyonu
ir_t = tt(1.6)
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.45)
ir = fft_filter(ir, 300, 9000)
ir /= np.sqrt(np.sum(ir ** 2))
size = 1 << int(np.ceil(np.log2(N + len(ir))))
wet = np.fft.irfft(np.fft.rfft(send, size) * np.fft.rfft(ir, size), size)[:N] * 0.6
L += wet
R += np.roll(wet, int(0.012 * SR))

mix = np.stack([L, R], axis=1)[: int(DUR * SR)]
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6) * 0.89  # yumuşak limit, ~-1 dBFS
fade = int(0.02 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None]

with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"{sys.argv[2]} ({DUR:.1f} sn)")
