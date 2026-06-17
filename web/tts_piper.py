#!/usr/bin/env python3
"""
Piper TTS helper for dorothy-web.
Reads JSON from stdin: { "segments": [{"text": "...", "lang": "el|en"}, ...], "rate": 1.0 }
Writes MP3 to stdout with optional tempo adjustment via ffmpeg.
"""
import json, sys, os, tempfile, subprocess

MODEL_DIR = os.path.join(os.path.dirname(__file__), "piper_models")
MODELS = {
    "el": os.path.join(MODEL_DIR, "el_GR-joy-medium.onnx"),
    "en": os.path.join(MODEL_DIR, "en_GB-cori-medium.onnx"),
}

def piper_tts(text, model_path, out_path):
    subprocess.run(
        ["python3", "-m", "piper",
         "--model", model_path,
         "--input-file", "/dev/stdin",
         "--output_file", out_path],
        input=text.encode("utf-8"), capture_output=True, check=True
    )

def main():
    data = json.load(sys.stdin)
    segments = data.get("segments", [])
    rate = float(data.get("rate", 1.0))

    tmpdir = tempfile.mkdtemp()
    files = []
    try:
        for i, seg in enumerate(segments):
            text = seg.get("text", "").strip()
            lang = seg.get("lang", "el")
            if not text:
                continue
            model = MODELS.get(lang, MODELS["el"])
            wav = os.path.join(tmpdir, f"seg{i}.wav")
            piper_tts(text, model, wav)
            files.append(wav)

        if not files:
            return

        out = os.path.join(tmpdir, "output.wav")
        if len(files) == 1:
            os.rename(files[0], out)
        else:
            filelist = os.path.join(tmpdir, "files.txt")
            with open(filelist, "w") as f:
                for path in files:
                    f.write(f"file '{path}'\n")
            subprocess.run(
                ["ffmpeg", "-f", "concat", "-safe", "0",
                 "-i", filelist, "-y", out],
                capture_output=True, check=True
            )

        mp3 = os.path.join(tmpdir, "output.mp3")
        cmd = ["ffmpeg", "-i", out]
        if abs(rate - 1.0) > 0.05:
            adjusted = os.path.join(tmpdir, "adjusted.wav")
            subprocess.run(
                ["ffmpeg", "-i", out,
                 "-filter:a", f"atempo={rate}", "-y", adjusted],
                capture_output=True, check=True
            )
            cmd = ["ffmpeg", "-i", adjusted]
        subprocess.run(
            cmd + ["-f", "mp3", "-y", mp3],
            capture_output=True, check=True
        )

        with open(mp3, "rb") as f:
            sys.stdout.buffer.write(f.read())
    finally:
        for f in files:
            try: os.unlink(f)
            except: pass
        for p in [os.path.join(tmpdir, "files.txt"),
                  os.path.join(tmpdir, "output.wav"),
                  os.path.join(tmpdir, "adjusted.wav"),
                  os.path.join(tmpdir, "output.mp3")]:
            try: os.unlink(p)
            except: pass
        try: os.rmdir(tmpdir)
        except: pass

if __name__ == "__main__":
    main()
