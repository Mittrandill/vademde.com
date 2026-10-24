"""Videonun seslerini sıfırdan sentezler (telifsiz; örnek/sample kullanılmaz).

Çıktı (out/audio/):
  sfx.wav  — yalnızca efektler (Instagram'dan müzik eklenecekse)
  mix.wav  — efektler + altlık ritim/pad

Zamanlar src/timeline.json'daki "sfx" listesinden okunur; video ile aynı kaynak.
"""
import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TL = json.loads((ROOT / "src" / "timeline.json").read_text())
SR = 48000
DUR = TL["duration"]
N = int(SR * DUR)
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack=0.005, decay=0.2, sec=None):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def lowpass(x, cutoff):
    """Tek kutuplu alçak geçiren; cutoff sabit ya da örnek başına dizi olabilir."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def noise(sec):
    return rng.standard_normal(int(SR * sec))


def sine(freq, sec, phase=0.0):
    t = t_axis(sec)
    if np.ndim(freq):
        return np.sin(2 * np.pi * np.cumsum(freq) / SR + phase)
    return np.sin(2 * np.pi * freq * t + phase)


# ------------------------------------------------------------------ efektler


def whoosh(pitch=1.0, sec=0.42, low=300, high=4200):
    n = int(SR * sec)
    t = np.arange(n) / SR
    shape = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.6
    cutoff = (low + (high - low) * shape) * pitch
    x = highpass(lowpass(noise(sec), cutoff), 180 * pitch)
    return x * shape * 0.9


def swoosh_low():
    return whoosh(0.55, sec=0.6, low=120, high=1400) * 1.3


def impact():
    sec = 0.9
    t = t_axis(sec)
    sub = np.sin(2 * np.pi * (48 + 40 * np.exp(-t / 0.05)) * t) * np.exp(-t / 0.35)
    crack = lowpass(noise(sec), 2500) * np.exp(-t / 0.04)
    return sub * 1.1 + crack * 0.5


def clock(until):
    """Hızlanan saat tik-takı: aciliyet."""
    out = np.zeros(int(SR * until) + SR // 4)
    beats, t = [], 0.0
    while t < until:
        beats.append(t)
        t += 0.42 - 0.18 * (t / until)
    for i, b in enumerate(beats):
        f = 2600 if i % 2 == 0 else 2050
        sec = 0.05
        x = sine(f, sec) * env(int(SR * sec), 0.0005, 0.012)
        x += highpass(noise(sec), 3000) * env(int(SR * sec), 0.0002, 0.004) * 0.6
        g = 0.35 + 0.45 * b / until
        s = int(b * SR)
        out[s : s + len(x)] += x * g
    return out


def riser_hit():
    hit = impact() * 0.9
    sec = 1.6
    t = t_axis(sec)
    bell = sum(
        np.sin(2 * np.pi * f * t) * np.exp(-t / d) * a
        for f, d, a in [(440, 0.9, 0.35), (659.3, 0.7, 0.25), (880, 0.5, 0.2), (1318.5, 0.35, 0.12)]
    )
    out = np.zeros(int(SR * sec))
    out[: len(hit)] += hit
    return out + bell * 0.6


def pop(freq=700):
    sec = 0.09
    t = t_axis(sec)
    f = freq * (1 + 0.8 * np.exp(-t / 0.012))
    return sine(f, sec) * env(len(t), 0.001, 0.03) * 0.55


def pops(count, step):
    out = np.zeros(int(SR * (count * step + 0.2)))
    for i in range(count):
        x = pop(620 * 2 ** (i * 2 / 12))
        s = int(i * step * SR)
        out[s : s + len(x)] += x
    return out


def tick(freq=3200, gain=0.25):
    sec = 0.02
    return sine(freq, sec) * env(int(SR * sec), 0.0003, 0.004) * gain


def count(until):
    dur = until
    out = np.zeros(int(SR * (dur + 0.05)))
    t = 0.0
    while t < dur:
        x = tick(2800 + 1200 * t / dur, 0.22)
        s = int(t * SR)
        out[s : s + len(x)] += x
        t += 0.04 + 0.05 * (t / dur) ** 2
    return out


def ding(pitch=1.0):
    sec = 0.9
    t = t_axis(sec)
    f = 1318.5 * pitch
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.12)) * 0.32


def taps(count, step):
    out = np.zeros(int(SR * (count * step + 0.15)))
    for i in range(count):
        sec = 0.06
        x = sine(1500 - i * 80, sec) * env(int(SR * sec), 0.001, 0.015) * 0.3
        x += lowpass(noise(sec), 3000) * env(int(SR * sec), 0.0005, 0.006) * 0.2
        s = int(i * step * SR)
        out[s : s + len(x)] += x
    return out


def swipe():
    return whoosh(1.6, sec=0.26, low=900, high=6000) * 0.55


def alert():
    out = np.zeros(int(SR * 0.9))
    for k, start in enumerate((0.0, 0.35)):
        sec = 0.32
        t = t_axis(sec)
        f = 233 * (1 + 0.012 * np.sin(2 * np.pi * 18 * t))
        x = (sine(f, sec) + 0.4 * sine(f * 2, sec)) * env(len(t), 0.004, 0.12) * (0.42 - 0.1 * k)
        s = int(start * SR)
        out[s : s + len(x)] += x
    return out


def tap():
    sec = 0.05
    x = sine(1900, sec) * env(int(SR * sec), 0.0005, 0.01) * 0.35
    return x + highpass(noise(sec), 2500) * env(int(SR * sec), 0.0002, 0.003) * 0.3


def paper():
    sec = 0.45
    n = int(SR * sec)
    t = np.arange(n) / SR
    grit = np.repeat(rng.random(n // 240 + 1), 240)[:n] ** 3
    x = highpass(lowpass(noise(sec), 5000), 900) * grit * np.sin(np.pi * t / sec) * 1.4
    return x


def scan(until_rel):
    sec = until_rel
    t = t_axis(sec)
    f = 900 + 700 * t / sec
    x = sine(f, sec) * 0.08 + sine(f * 1.5, sec) * 0.04
    buzz = lowpass(noise(sec), 1200) * 0.12
    shape = np.clip(t / 0.05, 0, 1) * np.clip((sec - t) / 0.08, 0, 1)
    return (x + buzz) * shape


def shutter():
    out = np.zeros(int(SR * 0.25))
    for s, g in ((0.0, 0.8), (0.07, 0.55)):
        sec = 0.06
        x = lowpass(noise(sec), 6000) * env(int(SR * sec), 0.0003, 0.01) * g
        x += sine(820, sec) * env(int(SR * sec), 0.0003, 0.015) * g * 0.5
        i = int(s * SR)
        out[i : i + len(x)] += x
    return out


def success():
    out = np.zeros(int(SR * 1.2))
    for k, f in enumerate((1046.5, 1318.5, 1568.0)):
        sec = 0.8
        t = t_axis(sec)
        x = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03)) * np.exp(-t / 0.25)
        i = int(k * 0.09 * SR)
        out[i : i + len(x)] += x * 0.28
    return out


def logo():
    out = np.zeros(int(SR * 1.6))
    notes = (880, 1108.7, 1318.5, 1760)
    for k, f in enumerate(notes):
        sec = 1.2
        t = t_axis(sec)
        x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.5) * 0.2
        i = int(k * 0.06 * SR)
        out[i : i + len(x)] += x
    sh = highpass(noise(1.0), 6000) * env(SR, 0.2, 0.25) * 0.08
    out[: len(sh)] += sh
    return out


def chip(pitch=1.0):
    """Vaat çipi: yumuşak pop + kısa cam tınısı."""
    sec = 0.6
    t = t_axis(sec)
    f = 988 * pitch
    tone = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.05)) * np.exp(-t / 0.18) * 0.22
    x = np.zeros(len(t))
    p = pop(520 * pitch)
    x[: len(p)] += p * 0.8
    return x + tone


def sparkle():
    out = np.zeros(int(SR * 1.0))
    for k in range(6):
        f = 2093 * 2 ** (rng.integers(0, 12) / 12)
        sec = 0.4
        x = sine(f, sec) * env(int(SR * sec), 0.002, 0.08) * 0.08
        i = int(k * 0.05 * SR)
        out[i : i + len(x)] += x
    return out


def render_cue(cue):
    kind = cue["kind"]
    if kind == "whoosh":
        return whoosh(cue.get("pitch", 1.0))
    if kind == "clock":
        return clock(cue["until"] - cue["t"])
    if kind == "pops":
        return pops(cue["count"], cue["step"])
    if kind == "taps":
        return taps(cue["count"], cue["step"])
    if kind == "count":
        return count(cue["until"] - cue["t"])
    if kind == "scan":
        return scan(cue["until"] - cue["t"])
    if kind == "ding":
        return ding(cue.get("pitch", 1.0))
    if kind == "chip":
        return chip(cue.get("pitch", 1.0))
    return globals()[kind]()


# ------------------------------------------------------------------ altlık müzik

BPM = 112
BEAT = 60 / BPM
DROP = TL["scenes"]["takvim"][0]
OUTRO = TL["scenes"]["end"][0]

CHORDS = [  # Am – F – C – G (her biri 2 vuruş)
    (220.0, 261.63, 329.63),
    (174.61, 220.0, 261.63),
    (196.0, 261.63, 329.63),
    (196.0, 246.94, 293.66),
]


def pad_voice(freq, sec):
    t = t_axis(sec)
    x = np.zeros_like(t)
    for h in range(1, 7):
        for det in (-0.004, 0.004):
            x += np.sin(2 * np.pi * freq * h * (1 + det) * t + h) / h**1.6
    return x


def music():
    out = np.zeros(N)
    # Giriş: koyu drone (gerilim)
    t = t_axis(DROP)
    drone = (pad_voice(55, DROP) * 0.5 + pad_voice(110, DROP) * 0.25) * np.clip(t / 0.4, 0, 1) * 0.12
    drone *= 1 - 0.85 * np.clip((t - 1.9) / 0.25, 0, 1)  # "sil" anında boşalır
    out[: len(drone)] += drone

    # Drop'tan sonra ritim + akorlar
    beat_count = int((OUTRO - DROP) / BEAT) + 1
    for b in range(beat_count):
        start = DROP + b * BEAT
        if start >= OUTRO:
            break
        s = int(start * SR)
        sec = 0.4
        tt = t_axis(sec)
        kick = np.sin(2 * np.pi * (50 + 110 * np.exp(-tt / 0.03)) * tt) * np.exp(-tt / 0.16) * 0.55
        out[s : s + len(kick)] += kick[: N - s]
        for half in (0.5,):
            hs = int((start + BEAT * half) * SR)
            hat = highpass(noise(0.05), 7000) * env(int(SR * 0.05), 0.0005, 0.012) * 0.12
            out[hs : hs + len(hat)] += hat[: max(0, N - hs)]
        if b % 2 == 0:
            chord = CHORDS[(b // 2) % 4]
            sec = BEAT * 2
            n = int(sec * SR)
            tt = np.arange(n) / SR
            duck = 0.35 + 0.65 * np.clip(((tt % BEAT) / 0.18), 0, 1)
            x = sum(pad_voice(f, sec) for f in chord) * np.clip(tt / 0.04, 0, 1) * duck * 0.035
            bass = np.sin(2 * np.pi * chord[0] / 2 * tt) * duck * 0.16
            seg = x + bass
            out[s : s + n] += seg[: N - s]

    # Kapanış: aydınlık A major, uzun sönüm
    sec = DUR - OUTRO
    t = t_axis(sec)
    resolve = sum(pad_voice(f, sec) for f in (220.0, 277.18, 329.63, 440.0)) * np.clip(t / 0.3, 0, 1) * np.exp(-t / 2.5) * 0.04
    s = int(OUTRO * SR)
    out[s : s + len(resolve)] += resolve[: N - s]
    return lowpass(out, 6000)


def write(path, x):
    x = x / max(1.0, np.abs(x).max() / 0.89)
    stereo = np.stack([x, x], axis=1)
    pcm = (stereo * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    fx = np.zeros(N + SR * 2)
    for cue in TL["sfx"]:
        x = render_cue(cue)
        s = int(cue["t"] * SR)
        fx[s : s + len(x)] += x
    fx = fx[:N]
    fade = np.clip((N - np.arange(N)) / (0.3 * SR), 0, 1)
    out = ROOT / "out" / "audio"
    write(out / "sfx.wav", fx * fade)
    write(out / "mix.wav", (fx * 0.9 + music()) * fade)
    print("ses:", out)


if __name__ == "__main__":
    main()
