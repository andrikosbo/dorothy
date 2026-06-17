#!/usr/bin/env python3
"""
Google Cloud TTS WaveNet helper for dorothy-web.
Reads JSON from stdin: { "segments": [{"text": "...", "lang": "el|en"}, ...], "rate": 1.0 }
Writes MP3 to stdout.
Uses direct REST API (no google-cloud-texttospeech dependency).
"""
import json, sys, os, tempfile, subprocess, urllib.request, base64

API_KEY = os.environ.get("GOOGLE_TTS_API_KEY", "")
VOICES = {
    "el": "el-GR-Wavenet-A",
    "en": "en-GB-Wavenet-A",
}
URL = "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + API_KEY

def text_to_ssml(text):
    import re
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    safe = re.sub(r'([,;])', r'<break time="150ms"/>\1', safe)
    safe = re.sub(r'([.!?])', r'\1<break time="350ms"/>', safe)
    return f"<speak>{safe}</speak>"

def google_tts(text, lang, out_path):
    voice = VOICES.get(lang, VOICES["el"])
    ssml = text_to_ssml(text)
    payload = json.dumps({
        "input": {"ssml": ssml},
        "voice": {"languageCode": voice[:5], "name": voice},
        "audioConfig": {"audioEncoding": "MP3"},
    }).encode()
    req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    audio_b64 = data.get("audioContent", "")
    if not audio_b64:
        raise RuntimeError("Empty audio response")
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(audio_b64))

def main():
    data = json.load(sys.stdin)
    segments = data.get("segments", [])
    rate = float(data.get("rate", 1.0))

    if not API_KEY:
        print("GOOGLE_TTS_MISSING_KEY", file=sys.stderr)
        sys.exit(1)

    combined = " ".join(seg.get("text", "").strip() for seg in segments if seg.get("text", "").strip())
    if not combined:
        return

    tmpdir = tempfile.mkdtemp()
    try:
        raw = os.path.join(tmpdir, "raw.mp3")
        google_tts(combined, "el", raw)

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
