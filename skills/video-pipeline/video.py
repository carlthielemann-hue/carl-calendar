#!/usr/bin/env python3
"""
Video pipeline v0 (ffmpeg). Three commands:

  hooks      same body, 3–5 hook clips stacked in front → one video per hook, exported 9:16 / 4:5 / 1:1,
             optional burned-in captions from an .srt
  captions   burn an .srt into a clip (auto-transcribe with --transcribe if OPENAI_API_KEY is set)
  clay       claymation feel from a folder of AI clay stills: 12 fps hold-frames with slight jitter,
             optional headline text and music. Original characters only.

Examples:
  python3 skills/video-pipeline/video.py hooks --body body.mp4 --hook h1.mp4 --hook h2.mp4 --out out/ --srt body.srt
  python3 skills/video-pipeline/video.py captions --in clip.mp4 --srt clip.srt --out clip_captioned.mp4
  python3 skills/video-pipeline/video.py clay --frames stills/ --out clay.mp4 --text "Your gut, explained" --music bed.mp3
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SIZES = {"9x16": (1080, 1920), "4x5": (1080, 1350), "1x1": (1080, 1080)}
FONT = "Inter"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ffmpeg failed: {' '.join(cmd[:6])}…\n{r.stderr[-1500:]}")
    return r


def fit_filter(w, h):
    # cover-crop to the target aspect, then scale
    return f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps=30"


def caption_filter(srt, w):
    style = f"FontName={FONT},FontSize={round(w / 1080 * 12)},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Bold=1,Alignment=2,MarginV={round(w / 1080 * 120)}"
    esc = str(Path(srt).resolve()).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    return f"subtitles='{esc}':force_style='{style}'"


def normalize(src, dst, w, h):
    """Re-encode to a common format so clips concat cleanly (adds silent audio if missing)."""
    has_audio = "audio" in run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", src]).stdout
    cmd = ["ffmpeg", "-y", "-i", src]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest"]
    cmd += ["-vf", fit_filter(w, h), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", dst]
    run(cmd)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())


def shift_srt(srt_text, offset):
    import re

    def ts(s):
        h, m, rest = s.split(":")
        sec, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000

    def fmt(t):
        t = max(0, t)
        return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round(t % 1 * 1000)):03d}"

    return re.sub(r"(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})", lambda m: f"{fmt(ts(m.group(1)) + offset)} --> {fmt(ts(m.group(2)) + offset)}", srt_text)


def cmd_hooks(a):
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    made = []
    for size in a.sizes:
        w, h = SIZES[size]
        body = tmp / f"body_{size}.mp4"
        normalize(a.body, str(body), w, h)
        for i, hook in enumerate(a.hook, 1):
            hk = tmp / f"hook{i}_{size}.mp4"
            normalize(hook, str(hk), w, h)
            lst = tmp / f"list{i}_{size}.txt"
            lst.write_text(f"file '{hk}'\nfile '{body}'\n")
            joined = tmp / f"joined{i}_{size}.mp4"
            run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
            final = out / f"{a.name}_hook{i}_{size}.mp4"
            if a.srt:
                srt = tmp / f"cap{i}_{size}.srt"
                srt.write_text(shift_srt(Path(a.srt).read_text(), duration(str(hk))))
                run(["ffmpeg", "-y", "-i", str(joined), "-vf", caption_filter(srt, w), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", str(final)])
            else:
                shutil.copy(joined, final)
            made.append(str(final))
    shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps({"made": made}, indent=2))


def transcribe(src):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("No --srt given and OPENAI_API_KEY not set — provide an .srt (e.g. from CapCut/Descript) or set the key.")
    import urllib.request
    import uuid

    tmp = Path(tempfile.mkdtemp()) / "a.mp3"
    run(["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(tmp)])
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-1\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\nsrt\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").encode() + tmp.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request("https://api.openai.com/v1/audio/transcriptions", data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    srt = Path(src).with_suffix(".srt")
    srt.write_text(urllib.request.urlopen(req, timeout=300).read().decode())
    return str(srt)


def cmd_captions(a):
    srt = a.srt or transcribe(a.input)
    w = int(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", a.input]).stdout.strip())
    run(["ffmpeg", "-y", "-i", a.input, "-vf", caption_filter(srt, w), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", a.out])
    print(json.dumps({"made": [a.out], "srt": srt}))


def cmd_clay(a):
    frames = sorted([p for p in Path(a.frames).iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")])
    if not frames:
        sys.exit("No images in --frames")
    w, h = SIZES[a.size]
    tmp = Path(tempfile.mkdtemp())
    rnd = random.Random(7)
    n = 0
    # each still is held for `hold` frames at 12 fps ("on twos/threes"), each frame jittered by a few px + tiny rotation
    for f in frames:
        for _ in range(a.hold):
            dx, dy, rot = rnd.randint(-a.jitter, a.jitter), rnd.randint(-a.jitter, a.jitter), rnd.uniform(-0.4, 0.4)
            pad = a.jitter * 4
            vf = f"scale={w + pad}:{h + pad}:force_original_aspect_ratio=increase,crop={w + pad}:{h + pad},rotate={rot}*PI/180:fillcolor=black,crop={w}:{h}:{pad // 2 + dx}:{pad // 2 + dy}"
            run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(f), "-vf", vf, "-frames:v", "1", str(tmp / f"f{n:05d}.png")])
            n += 1
    vf = "format=yuv420p"
    if a.text:
        txt = a.text.replace("'", "\u2019").replace(":", "\\:")
        vf = f"drawtext=font={FONT}:text='{txt}':fontcolor=white:fontsize={round(w * 0.07)}:borderw=6:bordercolor=black:x=(w-text_w)/2:y=h*0.16," + vf
    cmd = ["ffmpeg", "-y", "-framerate", "12", "-i", str(tmp / "f%05d.png")]
    if a.music:
        cmd += ["-i", a.music, "-shortest", "-c:a", "aac"]
    cmd += ["-vf", vf, "-r", "24", "-c:v", "libx264", "-crf", "20", a.out]
    run(cmd)
    shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps({"made": [a.out], "frames": n, "seconds": round(n / 12, 1)}))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = p.add_subparsers(dest="cmd", required=True)
    h = s.add_parser("hooks")
    h.add_argument("--body", required=True)
    h.add_argument("--hook", action="append", required=True)
    h.add_argument("--out", required=True)
    h.add_argument("--name", default="ad")
    h.add_argument("--srt", help="captions for the BODY (shifted automatically after each hook)")
    h.add_argument("--sizes", nargs="+", default=list(SIZES), choices=list(SIZES))
    c = s.add_parser("captions")
    c.add_argument("--in", dest="input", required=True)
    c.add_argument("--srt")
    c.add_argument("--out", required=True)
    k = s.add_parser("clay")
    k.add_argument("--frames", required=True)
    k.add_argument("--out", required=True)
    k.add_argument("--size", default="9x16", choices=list(SIZES))
    k.add_argument("--hold", type=int, default=2, help="frames per still at 12 fps (2 = 'on twos')")
    k.add_argument("--jitter", type=int, default=3)
    k.add_argument("--text")
    k.add_argument("--music")
    a = p.parse_args()
    {"hooks": cmd_hooks, "captions": cmd_captions, "clay": cmd_clay}[a.cmd](a)


if __name__ == "__main__":
    main()
