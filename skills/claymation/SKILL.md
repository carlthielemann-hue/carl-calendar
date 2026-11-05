---
name: claymation
description: Turn an ad concept into a finished claymation video ad. Claude writes storyboard.json (character, shots, VO, captions, end card); clay.py generates a consistent clay character, keyframes, AI motion and voiceover, then assembles the stop-motion edit with captions in 9:16 / 4:5 / 1:1.
---

# Claymation ads

## Setup (once, on your Mac)
- `ffmpeg` (`brew install ffmpeg`), Python 3.10+, the Inter font installed.
- **fal.ai** account → API key → `export FAL_KEY=…`. One key covers image (Flux) and video (Kling/Veo).
- **ElevenLabs** → API key → `export ELEVENLABS_API_KEY=…`, and pick a voice → `voice_id` in the storyboard.
- Keys live only in your shell or `.env`. Never commit them.

## Workflow (about 20 min of your time per ad)
1. **Concept → storyboard (Claude).** Give Claude the angle, hook and VOC quotes, and ask for a claymation `storyboard.json` following the schema below and the quality rules. Start from `examples/storyboard.json`.
2. **Estimate:** `python3 skills/claymation/clay.py estimate storyboard.json`. A 5-shot, ~20 s ad is about **$7**; budget roughly 2× for rerolls.
3. **Generate:**
   ```bash
   python3 skills/claymation/clay.py make storyboard.json --out out/<name> --yes
   ```
4. **Review** `out/<name>/*_keyframes.png` and the 9:16 video. Reroll only the bad parts; everything else stays cached and costs nothing:
   ```bash
   python3 skills/claymation/clay.py make storyboard.json --out out/<name> --redo shot3 --yes
   ```
   Use `--redo sheet` to change the character itself, or edit the shot's `scene`/`action` first and then redo it.
5. Export finished, log it with Claude: `add(entity="concept", …)`.

Offline test without keys: `--mock` (coloured stand-ins, but real captions, VO timing, music and exports).

## storyboard.json schema
| field | meaning |
| --- | --- |
| `title`, `brand`, `spec` | `spec: true` burns "Spec concept · not affiliated with <brand>" into the video (always for spec work) |
| `character.name`, `character.description` | one ORIGINAL character, described concretely: shape, 2–3 signature colours, one prop or garment, face detail |
| `shots[]` | `id`, `seconds` (2–5), `scene` (what's in frame), `camera`, `action` (the ONE motion), `camera_move`, `vo`, `caption` |
| `end_card` | `headline`, `cta`, `color`, `ink`, `seconds`, optional `image` (product packshot) |
| `master` | the size generated (default `9x16`); the other `sizes` are crops of it |
| `stop_motion` | `true` = 12 fps "on twos" feel (recommended) |
| `music`, `music_volume` | a licensed music file (Artlist, Epidemic, or royalty-free), ducked under the VO |
| `voice_id`, `models`, `style` | optional overrides (model ids: check fal.ai/models) |

## Quality rules (what makes it look high-end, not AI slop)
1. **One character, described the same way every time.** Never re-describe the character in a shot. Shots only describe scene and action; the script injects the character sheet as the reference.
2. **One action per shot, 3–5 s.** Clay looks real when motion is small and deliberate: a wince, a shrug, a lid twisting. Big motion (running, dancing, crowds) is where AI video morphs.
3. **Simple, static sets.** One location per shot, few objects, the camera mostly still or slowly pushing in.
4. **Hook in shot 1 (≤ 3 s), as a problem the viewer feels**, taken from VOC language. The product appears by shot 3. End card ≤ 3 s.
5. **No text inside generated images.** Labels and logos come out garbled. Use plain packaging in-scene, and put the real packshot on the end card (`end_card.image`).
6. **VO carries the message, captions mirror it.** Most people watch muted. Keep each caption ≤ 7 words.
7. **Review keyframes before motion.** If a keyframe is off-model, `--redo` it before paying for video.

## Hard rules
- **Original characters only.** Never recreate existing characters, mascots or a studio's look by name.
- **No health or results claims in VO or captions** beyond what the brand can substantiate (see `skills/static-producer/COMPLIANCE.md`). Mark it "Illustration" where a result is depicted.
- Spec work for real brands is always labelled spec and never claims affiliation.
- Customer quotes in VO must be real (link the source in the concept log) or framed as illustrative.

## Known limits
- Model ids and prices change. If a call fails with 404/422, check the model page on fal.ai and set `models` in the storyboard.
- Character consistency is very good but not perfect. Expect 1–2 rerolls per ad.
- This pipeline was tested offline only (`--mock`, Nov 5, 2026). The first real run happens on your machine.
