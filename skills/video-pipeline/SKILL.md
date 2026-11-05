---
name: video-pipeline
description: ffmpeg video pipeline v0 for ad iterations — stack 3–5 hook variants on one body, burn in captions, export 9:16 / 4:5 / 1:1, and turn AI clay stills into a 12 fps stop-motion clip.
---

# Video pipeline v0

Requirements: `ffmpeg`/`ffprobe` on PATH. Auto-transcription needs `OPENAI_API_KEY` (Whisper API); otherwise pass an `.srt` exported from CapCut or Descript.

```bash
# Hook stacking: one output per hook × size. Body captions shift automatically after each hook.
python3 skills/video-pipeline/video.py hooks --body body.mp4 --hook h1.mp4 --hook h2.mp4 --hook h3.mp4 \
  --srt body.srt --out out/ --name brand_angle --sizes 9x16 4x5 1x1

# Burn captions into one clip (or --transcribe implicitly when --srt is omitted and OPENAI_API_KEY is set)
python3 skills/video-pipeline/video.py captions --in clip.mp4 --srt clip.srt --out clip_cap.mp4

# Claymation test: clay stills (made in ChatGPT) → 12 fps "on twos" with slight jitter, title + music
python3 skills/video-pipeline/video.py clay --frames stills/ --out clay.mp4 --hold 2 --jitter 3 --text "Hook line" --music bed.mp3
```

Rules:
- Use **original characters only** in the clay workflow. Never recreate known characters, brands' mascots or IP.
- Mark actor or AI footage where needed ("Actor portrayal", "AI-generated"). See `skills/static-producer/COMPLIANCE.md`.
- Clips are cover-cropped to the target aspect. Keep faces and text inside the centre ~70% so all three crops work.

Tested on Nov 5, 2026 with synthetic clips: hook stacking 9:16 and 1:1, shifted captions, clay 12 fps.
