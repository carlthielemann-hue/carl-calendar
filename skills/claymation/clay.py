#!/usr/bin/env python3
"""
Claymation ad generator: storyboard.json → finished claymation ad (9:16 / 4:5 / 1:1).

Pipeline (each step is cached in the output folder, so reruns only redo what changed — saves money):
  1. character sheet   text-to-image with the clay style bible             (fal.ai, FAL_KEY)
  2. keyframes         one still per shot, conditioned on the sheet → same character every shot
  3. motion            image-to-video per shot (Kling by default)
  4. voiceover         ElevenLabs TTS per shot (ELEVENLABS_API_KEY), optional
  5. assemble          ffmpeg: trim, optional stop-motion feel (12 fps on twos), VO + ducked music,
                       burned captions, end card, "spec" label, every export size

Usage:
  python3 skills/claymation/clay.py estimate storyboard.json
  python3 skills/claymation/clay.py make storyboard.json --out out/ad --yes
  python3 skills/claymation/clay.py make storyboard.json --out out/ad --redo shot3 --yes   # reroll one shot
  python3 skills/claymation/clay.py make storyboard.json --out /tmp/t --mock                # offline test

Original characters only. Never recreate known characters, mascots or a studio's IP.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_MODELS = {
    # Verify current ids at https://fal.ai/models — they change. Override per storyboard in "models".
    "sheet": "fal-ai/flux-pro/v1.1-ultra",
    "keyframe": "fal-ai/flux-pro/kontext",  # reference image + prompt → new image, same character
    "video": "fal-ai/kling-video/v2.1/master/image-to-video",
}
PRICE = {"sheet": 0.06, "keyframe": 0.04, "video_per_5s": 1.40, "tts_per_1k_chars": 0.30}  # rough USD, estimate only
SIZES = {"9x16": (1080, 1920), "4x5": (1080, 1350), "1x1": (1080, 1080)}
ASPECT = {"9x16": "9:16", "4x5": "4:5", "1x1": "1:1"}

STYLE_BIBLE = (
    "handcrafted stop-motion claymation, characters sculpted from matte plasticine with visible fingerprints "
    "and tool marks, slightly imperfect hand-made shapes, miniature practical set built from clay, felt and card, "
    "soft warm key light with gentle shadows, shallow depth of field like a macro lens, tactile textures, "
    "cosy saturated but natural palette, no CGI sheen, no plastic gloss, no text, no logos, no watermark"
)
MOTION_BIBLE = "stop-motion claymation movement, small deliberate motions, the set stays still, no morphing, the character keeps the same face and proportions"


def die(msg):
    sys.exit(f"✗ {msg}")


def run(cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        die(f"ffmpeg failed: {' '.join(map(str, cmd[:8]))}…\n{r.stderr[-1500:]}")
    return r


def load(path):
    sb = json.loads(Path(path).read_text())
    for k in ("title", "character", "shots"):
        if k not in sb:
            die(f"storyboard needs '{k}' (see skills/claymation/SKILL.md)")
    for i, s in enumerate(sb["shots"], 1):
        s.setdefault("id", f"shot{i}")
        s.setdefault("seconds", 4)
        if "scene" not in s:
            die(f"{s['id']} needs 'scene'")
    sb.setdefault("sizes", ["9x16", "4x5", "1x1"])
    sb.setdefault("master", "9x16")
    sb.setdefault("stop_motion", True)
    sb["models"] = {**DEFAULT_MODELS, **sb.get("models", {})}
    return sb


def estimate(sb):
    units = sum(max(1, -(-int(float(s["seconds"])) // 5)) for s in sb["shots"])
    chars = sum(len(s.get("vo", "")) for s in sb["shots"])
    usd = PRICE["sheet"] + len(sb["shots"]) * PRICE["keyframe"] + units * PRICE["video_per_5s"] + chars / 1000 * PRICE["tts_per_1k_chars"]
    return {"shots": len(sb["shots"]), "video_clips_5s": units, "vo_chars": chars, "approx_usd": round(usd, 2), "note": "Rough. Rerolls cost extra; cached steps are free on rerun."}


# ---------------- providers ----------------


def http_json(url, body=None, headers=None, method=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"), headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        die(f"{url} → {e.code}: {e.read().decode()[:400]}")


def download(url, dst):
    with urllib.request.urlopen(url, timeout=300) as r, open(dst, "wb") as f:
        shutil.copyfileobj(r, f)
    return dst


def fal(model, args, timeout_s=900):
    key = os.environ.get("FAL_KEY") or die("FAL_KEY not set (fal.ai → Dashboard → Keys)")
    h = {"Authorization": f"Key {key}"}
    sub = http_json(f"https://queue.fal.run/{model}", args, h)
    status_url, resp_url = sub.get("status_url"), sub.get("response_url")
    t0 = time.time()
    while True:
        st = http_json(status_url, headers=h)
        if st.get("status") == "COMPLETED":
            return http_json(resp_url, headers=h)
        if st.get("status") in ("FAILED", "ERROR"):
            die(f"{model} failed: {st}")
        if time.time() - t0 > timeout_s:
            die(f"{model} timed out")
        time.sleep(4)


def upload_ref(path):
    """fal accepts data URIs for image inputs; fine for one ~1–3 MB reference image."""
    import base64

    mime = "image/png" if str(path).endswith(".png") else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(Path(path).read_bytes()).decode()}"


def tts(text, dst, voice_id, model="eleven_multilingual_v2"):
    key = os.environ.get("ELEVENLABS_API_KEY") or die("ELEVENLABS_API_KEY not set (or remove 'vo' lines)")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=json.dumps({"text": text, "model_id": model, "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35}}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f:
        f.write(r.read())
    return dst


class Real:
    def __init__(self, sb):
        self.sb = sb

    def sheet(self, prompt, dst):
        out = fal(self.sb["models"]["sheet"], {"prompt": prompt, "aspect_ratio": "16:9", "num_images": 1, "output_format": "png", "safety_tolerance": "2"})
        return download(out["images"][0]["url"], dst)

    def keyframe(self, prompt, ref, dst):
        out = fal(self.sb["models"]["keyframe"], {"prompt": prompt, "image_url": upload_ref(ref), "aspect_ratio": ASPECT[self.sb["master"]], "output_format": "png", "safety_tolerance": "2"})
        return download(out["images"][0]["url"], dst)

    def video(self, prompt, img, seconds, dst):
        out = fal(self.sb["models"]["video"], {"prompt": prompt, "image_url": upload_ref(img), "duration": "10" if seconds > 5 else "5", "aspect_ratio": ASPECT[self.sb["master"]], "negative_prompt": "blur, distortion, morphing face, extra limbs, CGI, glossy plastic, text, watermark"})
        return download(out["video"]["url"], dst)

    def vo(self, text, dst):
        return tts(text, dst, self.sb.get("voice_id", "21m00Tcm4TlvDq8ikWAM"))


class Mock:
    """Offline stand-ins (ffmpeg colour cards + sine tone) so the assembly can be tested without keys."""

    def __init__(self, sb):
        self.sb = sb
        self.n = 0

    def _img(self, dst, w, h, label):
        self.n += 1
        c = ["0xC97B4A", "0x6E8B5B", "0x4F6D8F", "0xB5654F", "0x8F6E9E", "0xD9A441"][self.n % 6]
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={c}:size={w}x{h}", "-vf", f"drawtext=text='{label}':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2", "-frames:v", "1", dst])
        return dst

    def sheet(self, prompt, dst):
        return self._img(dst, 1600, 900, "CHARACTER SHEET")

    def keyframe(self, prompt, ref, dst):
        w, h = SIZES[self.sb["master"]]
        return self._img(dst, w, h, Path(dst).stem.upper())

    def video(self, prompt, img, seconds, dst):
        run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", img, "-vf", "zoompan=z='min(zoom+0.0015,1.15)':d=1:s=1080x1920:fps=24", "-t", str(max(5, seconds)), "-pix_fmt", "yuv420p", dst])
        return dst

    def vo(self, text, dst):
        secs = max(1.2, len(text.split()) / 2.6)
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency=220:duration={secs:.2f}", "-af", "volume=0.2", dst])
        return dst


# ---------------- pipeline ----------------


def dur(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())


def srt_time(t):
    return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round(t % 1 * 1000)):03d}"


def esc_filter_path(p):
    return str(Path(p).resolve()).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def make(sb, out, prov, redo, yes):
    out.mkdir(parents=True, exist_ok=True)
    (out / "work").mkdir(exist_ok=True)
    w = out / "work"
    if not yes and not isinstance(prov, Mock):
        print(json.dumps(estimate(sb), indent=2))
        die("Add --yes to spend this (or use estimate first).")
    char = sb["character"]
    style = sb.get("style", STYLE_BIBLE)

    # 1. character sheet — the anchor for consistency
    sheet = w / "character_sheet.png"
    if not sheet.exists() or "sheet" in redo:
        p = f"Character turnaround sheet of {char['description']}, front, three-quarter and side view on a plain warm grey background, full body, {style}"
        print("· character sheet")
        prov.sheet(p, str(sheet))

    report = {"title": sb["title"], "shots": []}
    clips = []
    t = 0.0
    srt = []
    vo_parts = []
    for s in sb["shots"]:
        sid = s["id"]
        kf, mv, vo = w / f"{sid}_key.png", w / f"{sid}_motion.mp4", w / f"{sid}_vo.mp3"
        force = sid in redo or "all" in redo
        if force or not kf.exists():
            print(f"· {sid} keyframe")
            prompt = f"{char['name']}, {char['description']} (exactly the character from the reference image, same face, colours and proportions). Scene: {s['scene']}. Camera: {s.get('camera', 'medium shot, eye level')}. {style}"
            prov.keyframe(prompt, str(sheet), str(kf))
        if force or not mv.exists():
            print(f"· {sid} motion ({s['seconds']}s)")
            prov.video(f"{s.get('action', 'subtle idle movement')}. {s.get('camera_move', 'static camera')}. {MOTION_BIBLE}", str(kf), float(s["seconds"]), str(mv))
        # trim + normalise to master size, 24 fps; stop-motion = hold every 2nd frame at 12 fps
        W, H = SIZES[sb["master"]]
        fit = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
        fps = "fps=12,fps=24" if sb["stop_motion"] else "fps=24"
        clip = w / f"{sid}_clip.mp4"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", mv, "-t", str(s["seconds"]), "-vf", f"{fit},{fps},format=yuv420p", "-an", "-c:v", "libx264", "-crf", "17", "-preset", "slow", clip])
        clips.append(clip)
        if s.get("vo"):
            if force or not vo.exists():
                print(f"· {sid} voiceover")
                prov.vo(s["vo"], str(vo))
            vo_parts.append((t + 0.15, vo))
        if s.get("caption") or s.get("vo"):
            srt.append(f"{len(srt) + 1}\n{srt_time(t + 0.1)} --> {srt_time(t + float(s['seconds']) - 0.1)}\n{s.get('caption') or s['vo']}\n")
        report["shots"].append({"id": sid, "keyframe": str(kf), "motion": str(mv)})
        t += float(s["seconds"])

    # end card (clay-coloured, product line + CTA)
    end = sb.get("end_card")
    W, H = SIZES[sb["master"]]
    if end:
        ec = w / "end_card.mp4"
        bg = end.get("image")
        src = ["-loop", "1", "-i", bg] if bg else ["-f", "lavfi", "-i", f"color=c={end.get('color', '0xF4E9DC')}:size={W}x{H}"]
        lines = [x.replace("'", "’").replace(":", "\\:") for x in (end.get("headline", ""), end.get("cta", ""))]
        dt = f"drawtext=font=Inter:text='{lines[0]}':fontcolor={end.get('ink', '0x1A1A1A')}:fontsize={int(W * 0.07)}:x=(w-text_w)/2:y=h*0.42,drawtext=font=Inter:text='{lines[1]}':fontcolor={end.get('ink', '0x1A1A1A')}:fontsize={int(W * 0.045)}:x=(w-text_w)/2:y=h*0.52"
        run(["ffmpeg", "-y", "-loglevel", "error", *src, "-t", str(end.get("seconds", 2.5)), "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},{dt},fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "17", ec])
        clips.append(ec)
        t += float(end.get("seconds", 2.5))

    # concat video
    lst = w / "concat.txt"
    lst.write_text("".join(f"file '{Path(c).resolve()}'\n" for c in clips))
    silent = w / "silent.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])

    # audio: VO placed per shot, music ducked under VO
    inputs, filters, labels = [], [], []
    for i, (start, f) in enumerate(vo_parts):
        inputs += ["-i", f]
        filters.append(f"[{i + 1}:a]adelay={int(start * 1000)}|{int(start * 1000)},volume=1.0[v{i}]")
        labels.append(f"[v{i}]")
    music = sb.get("music")
    audio = w / "mix.m4a"
    if vo_parts or music:
        if music:
            inputs += ["-stream_loop", "-1", "-i", music]
            mi = len(vo_parts) + 1
            filters.append(f"[{mi}:a]volume={sb.get('music_volume', 0.22)},atrim=0:{t:.2f},afade=t=out:st={max(0, t - 1.5):.2f}:d=1.5[m]")
        if vo_parts:
            filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,apad=whole_dur={t:.2f}[vo]")
            if music:
                filters.append("[vo]asplit[vo1][vo2];[m][vo2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[md];[vo1][md]amix=inputs=2:normalize=0[out]")
            else:
                filters.append("[vo]anull[out]")
        else:
            filters.append("[m]anull[out]")
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={t:.2f}", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-t", f"{t:.2f}", "-c:a", "aac", "-b:a", "192k", audio])

    srt_path = w / "captions.srt"
    srt_path.write_text("\n".join(srt))
    spec = f"Spec concept · not affiliated with {sb['brand']}" if sb.get("spec") and sb.get("brand") else ""
    made = []
    for size in sb["sizes"]:
        W2, H2 = SIZES[size]
        vf = f"scale={W2}:{H2}:force_original_aspect_ratio=increase,crop={W2}:{H2},setsar=1"
        if srt and sb.get("captions", True):
            st = f"FontName=Inter,FontSize={12 if size == '9x16' else 11},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=1,Outline=2.5,Shadow=0,Alignment=2,MarginV={70 if size == '9x16' else 40}"
            vf += f",subtitles='{esc_filter_path(srt_path)}':force_style='{st}'"
        if spec:
            vf += f",drawtext=font=Inter:text='{spec}':fontcolor=white@0.75:fontsize={int(W2 * 0.022)}:x=w-text_w-24:y=24:box=1:boxcolor=black@0.35:boxborderw=8"
        dst = out / f"{slug(sb['title'])}_{size}.mp4"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", silent]
        if audio.exists():
            cmd += ["-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "copy"]
        cmd += ["-vf", vf, "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", dst]
        run(cmd)
        made.append(str(dst))
    # contact sheet of keyframes for quick review
    sheet_out = out / f"{slug(sb['title'])}_keyframes.png"
    keys = [str(w / f"{s['id']}_key.png") for s in sb["shots"]]
    run(["ffmpeg", "-y", "-loglevel", "error", *sum([["-i", k] for k in keys], []), "-filter_complex", "".join(f"[{i}:v]scale=270:-1[k{i}];" for i in range(len(keys))) + "".join(f"[k{i}]" for i in range(len(keys))) + f"hstack=inputs={len(keys)}" if len(keys) > 1 else "[0:v]scale=270:-1", sheet_out])
    report.update({"made": made, "keyframes": str(sheet_out), "seconds": round(t, 1)})
    (out / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"made": made, "keyframes": str(sheet_out), "seconds": round(t, 1)}, indent=2))


def slug(s):
    import re

    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    e = sp.add_parser("estimate")
    e.add_argument("storyboard")
    m = sp.add_parser("make")
    m.add_argument("storyboard")
    m.add_argument("--out", required=True)
    m.add_argument("--redo", nargs="*", default=[], help="shot ids to regenerate, 'sheet', or 'all'")
    m.add_argument("--yes", action="store_true", help="confirm spending API credits")
    m.add_argument("--mock", action="store_true", help="offline stand-ins, no API calls")
    a = p.parse_args()
    sb = load(a.storyboard)
    if a.cmd == "estimate":
        print(json.dumps(estimate(sb), indent=2))
        return
    make(sb, Path(a.out), Mock(sb) if a.mock else Real(sb), set(a.redo), a.yes)


if __name__ == "__main__":
    main()
