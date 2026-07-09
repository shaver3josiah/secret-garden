#!/usr/bin/env python3
"""Render design/logo/mark.svg to a 1024px transparent PNG (design/logo/mark-master.png).

The mark uses ellipses, nested rotate transforms and strokes that Pillow can't draw,
so it is rasterized with headless Chrome via the DevTools protocol (the only local
renderer that honours a transparent background). Run once whenever mark.svg changes,
then run generate_icons.py to rebuild every icon. Needs: Chrome, websocket-client.

Usage: python render_master.py [in.svg] [out.png] [size]
"""
import base64, json, os, re, subprocess, sys, tempfile, time, urllib.request
import websocket  # pip install websocket-client

CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_IN = os.path.join(HERE, "..", "design", "logo", "mark.svg")
DEFAULT_OUT = os.path.join(HERE, "..", "design", "logo", "mark-master.png")


def render(svg_path, out_path, size=1024, port=9333):
    svg = re.sub(r"<svg ", f'<svg width="{size}" height="{size}" ',
                 open(svg_path, encoding="utf-8").read(), count=1)
    html = ("<!doctype html><meta charset=utf-8>"
            "<style>html,body{margin:0;padding:0;background:transparent}</style>" + svg)
    tmp = tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8")
    tmp.write(html); tmp.close()
    url = "file:///" + tmp.name.replace("\\", "/")
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
         f"--remote-debugging-port={port}", "--remote-allow-origins=*",
         f"--user-data-dir={os.path.join(tempfile.gettempdir(), 'sg-cdp-prof')}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ver = None
        for _ in range(100):
            try:
                ver = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version")); break
            except Exception:
                time.sleep(0.1)
        if not ver:
            raise RuntimeError("Chrome DevTools endpoint never came up")
        ws = websocket.create_connection(ver["webSocketDebuggerUrl"], max_size=None)
        n = [0]
        def cmd(method, params=None, sess=None):
            n[0] += 1; mid = n[0]
            msg = {"id": mid, "method": method, "params": params or {}}
            if sess: msg["sessionId"] = sess
            ws.send(json.dumps(msg))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == mid:
                    if "error" in m: raise RuntimeError(m["error"])
                    return m.get("result", {})
        tid = cmd("Target.createTarget", {"url": "about:blank"})["targetId"]
        sess = cmd("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        cmd("Page.enable", sess=sess)
        cmd("Emulation.setDeviceMetricsOverride",
            {"width": size, "height": size, "deviceScaleFactor": 1, "mobile": False}, sess=sess)
        cmd("Emulation.setDefaultBackgroundColorOverride",
            {"color": {"r": 0, "g": 0, "b": 0, "a": 0}}, sess=sess)
        cmd("Page.navigate", {"url": url}, sess=sess)
        time.sleep(0.6)  # static inline SVG, no external fetches
        shot = cmd("Page.captureScreenshot",
                   {"format": "png", "captureBeyondViewport": True,
                    "clip": {"x": 0, "y": 0, "width": size, "height": size, "scale": 1}}, sess=sess)
        open(out_path, "wb").write(base64.b64decode(shot["data"]))
        ws.close()
    finally:
        proc.terminate()
        os.unlink(tmp.name)
    print("wrote", os.path.relpath(out_path, os.path.join(HERE, "..")), f"{size}x{size}")


if __name__ == "__main__":
    a = sys.argv
    render(a[1] if len(a) > 1 else DEFAULT_IN,
           a[2] if len(a) > 2 else DEFAULT_OUT,
           int(a[3]) if len(a) > 3 else 1024)
