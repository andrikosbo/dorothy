#!/usr/bin/env python3
"""
gTTS helper for dorothy-web.
Reads JSON from stdin: { "segments": [{"text": "...", "lang": "el|en"}, ...], "rate": 1.0 }
Writes MP3 to stdout with optional tempo adjustment via ffmpeg.
"""
import json
import sys
import os
import tempfile
import subprocess
from gtts import gTTS

def main():
    data = json.load(sys.stdin)
    segments = data.get("segments", [])
    rate = float(data.get("rate", 1.0))

    combined = " ".join(seg.get("text", "").strip() for seg in segments if seg.get("text", "").strip())
    if not combined:
        return

    tmpdir = tempfile.mkdtemp()
    try:
        raw = os.path.join(tmpdir, "raw.mp3")
        tts = gTTS(combined, lang="el", slow=rate < 0.8, lang_check=False)
        tts.save(raw)

        out = raw
        if abs(rate - 1.0) > 0.05:
            adjusted = os.path.join(tmpdir, "adjusted.mp3")
            subprocess.run(
                ["ffmpeg", "-i", raw,
                 "-filter:a", f"atempo={rate}",
                 "-f", "mp3", "-y", adjusted],
                capture_output=True, check=True
            )
            out = adjusted

        with open(out, "rb") as f:
            sys.stdout.buffer.write(f.read())
    finally:
        for p in [os.path.join(tmpdir, "raw.mp3"),
                  os.path.join(tmpdir, "adjusted.mp3")]:
            try: os.unlink(p)
            except: pass
        try: os.rmdir(tmpdir)
        except: pass

if __name__ == "__main__":
    main()
