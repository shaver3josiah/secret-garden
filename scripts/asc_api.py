#!/usr/bin/env python3
"""App Store Connect API helper for Secret Garden setup (Windows-friendly).

Windows PowerShell 5.1 can't sign an ES256 JWT (no ImportPkcs8PrivateKey in
.NET Framework), so Setup-Apple.ps1 shells out to this. Pure stdlib + PyJWT;
no `requests`. Install the one dep with:  pip install "pyjwt[crypto]"

Subcommands (network ones need --p8 PATH --key-id KID --issuer ISSUER):
  selftest         sign+decode a throwaway key, no network - proves the crypto path
  validate         confirm the key authenticates and can read /v1/apps
  ensure-bundle-id register the bundle id if missing (idempotent); doubles as a
                   write-permission check - a 403 means the key role is too low
  find-app         report whether the app record exists yet (browser-created)

Exit codes: 0 ok | 2 auth (401) | 3 forbidden / pending-agreement (403)
            4 not-found | 5 bad-usage/deps | 1 other. Prints a `RESULT: ...` line
the .ps1 keys off.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Windows consoles (cp1252/cp437) can't encode Unicode in Apple's error text;
# replace unencodable chars instead of raising UnicodeEncodeError.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except Exception:
        pass

BASE = "https://api.appstoreconnect.apple.com"
AUD = "appstoreconnect-v1"


def _die(code, msg):
    print(f"RESULT: ERROR {msg}")
    sys.exit(code)


def _require_pyjwt():
    try:
        import jwt  # noqa: F401
        return jwt
    except ImportError:
        _die(5, 'PyJWT not installed. Run: pip install "pyjwt[crypto]"')


def make_token(p8_path, key_id, issuer):
    jwt = _require_pyjwt()
    try:
        with open(p8_path, "r", encoding="utf-8") as f:
            key = f.read()
    except OSError as e:
        _die(5, f"cannot read .p8 at {p8_path}: {e}")
    if "BEGIN PRIVATE KEY" not in key:
        _die(5, f"{p8_path} is not a raw .p8 (no BEGIN PRIVATE KEY line) - "
                "did you base64-encode it? Use the raw file Apple gave you.")
    now = int(time.time())
    # 1140s < Apple's 20-minute hard cap, with skew headroom.
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 1140, "aud": AUD},
        key, algorithm="ES256", headers={"kid": key_id, "typ": "JWT"},
    )


def api(method, path, token, body=None):
    """Return (status, parsed_json_or_none). Never raises on HTTP error."""
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode() or "{}"
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = None
        return e.code, parsed
    except urllib.error.URLError as e:
        _die(1, f"network error reaching App Store Connect: {e.reason}")


def _apple_errors(parsed):
    if not parsed or "errors" not in parsed:
        return ""
    return " | ".join(
        f"{x.get('title','')}: {x.get('detail','')}".strip(": ")
        for x in parsed["errors"]
    )


def _handle_auth(status, parsed):
    """Common 401/403 messaging + exit. Returns if status is a 2xx."""
    if 200 <= status < 300:
        return
    detail = _apple_errors(parsed)
    if status == 401:
        _die(2, "401 unauthorized - the key/issuer is wrong, revoked, or the "
                f"token is malformed. {detail}")
    if status == 403:
        low = detail.lower()
        if "agreement" in low or "terms" in low:
            _die(3, "403 - a pending Apple agreement is blocking the API. The "
                    "Account Holder must accept it at appstoreconnect.apple.com "
                    f"(Business > Agreements), then rerun. {detail}")
        _die(3, "403 forbidden - the API key's role is too low. Recreate it as "
                f"Admin (or App Manager), never Developer. {detail}")
    _die(1, f"HTTP {status} - {detail or 'unexpected response'}")


def cmd_selftest(_):
    jwt = _require_pyjwt()
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        _die(5, 'cryptography missing. Run: pip install "pyjwt[crypto]"')
    k = ec.generate_private_key(ec.SECP256R1())
    pem = k.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    now = int(time.time())
    tok = jwt.encode({"iss": "x", "iat": now, "exp": now + 1140, "aud": AUD},
                     pem, algorithm="ES256", headers={"kid": "SELFTEST"})
    hdr = jwt.get_unverified_header(tok)
    claims = jwt.decode(tok, k.public_key(), algorithms=["ES256"], audience=AUD)
    assert hdr["alg"] == "ES256" and hdr["kid"] == "SELFTEST", hdr
    assert claims["aud"] == AUD and claims["exp"] - claims["iat"] == 1140, claims
    print("RESULT: OK ES256 sign+verify works on this machine")


def cmd_validate(a):
    token = make_token(a.p8, a.key_id, a.issuer)
    status, parsed = api("GET", "/v1/apps?limit=1", token)
    _handle_auth(status, parsed)
    print("RESULT: OK key authenticates and can read App Store Connect")


def cmd_ensure_bundle_id(a):
    token = make_token(a.p8, a.key_id, a.issuer)
    q = urllib.parse.urlencode({"filter[identifier]": a.bundle_id})
    status, parsed = api("GET", f"/v1/bundleIds?{q}", token)
    _handle_auth(status, parsed)
    if parsed and parsed.get("data"):
        print(f"RESULT: EXISTS bundle id {a.bundle_id} already registered")
        return
    body = {"data": {"type": "bundleIds", "attributes": {
        "identifier": a.bundle_id, "name": a.name, "platform": "IOS"}}}
    status, parsed = api("POST", "/v1/bundleIds", token, body)
    _handle_auth(status, parsed)  # 403 here => role too low (good early signal)
    print(f"RESULT: CREATED bundle id {a.bundle_id} registered")


def cmd_find_app(a):
    token = make_token(a.p8, a.key_id, a.issuer)
    q = urllib.parse.urlencode({"filter[bundleId]": a.bundle_id, "limit": "1"})
    status, parsed = api("GET", f"/v1/apps?{q}", token)
    _handle_auth(status, parsed)
    data = (parsed or {}).get("data") or []
    if data:
        name = data[0].get("attributes", {}).get("name", "?")
        print(f"RESULT: EXISTS app record found: \"{name}\"")
        sys.exit(0)
    print("RESULT: MISSING no app record for this bundle id yet - "
          "create it in the browser (see the printed steps)")
    sys.exit(4)


def cmd_revoke_api_dev_certs(a):
    """Revoke ONLY development certs named exactly 'Created via API' (the throwaway
    ones cloud signing mints each run). Never touches human-named or distribution
    certs — that filter is the safety guarantee."""
    token = make_token(a.p8, a.key_id, a.issuer)
    s, body = api('GET', '/v1/certificates?limit=200', token)
    _handle_auth(s, body)
    targets = [d for d in (body.get('data') or [])
               if 'DEVELOPMENT' in (d['attributes'].get('certificateType') or '')
               and (d['attributes'].get('displayName') or '') == 'Created via API']
    if not targets:
        print("RESULT: NONE no 'Created via API' development certs to revoke")
        return
    revoked = 0
    for d in targets:
        cid = d['id']
        rs, rb = api('DELETE', f'/v1/certificates/{cid}', token)
        ok = rs in (200, 204)
        print(f"  revoke {cid}: HTTP {rs} {'OK' if ok else rb}")
        revoked += 1 if ok else 0
    s, body = api('GET', '/v1/certificates?limit=200', token)
    dev = [d for d in (body.get('data') or [])
           if 'DEVELOPMENT' in (d['attributes'].get('certificateType') or '')]
    print(f"RESULT: REVOKED {revoked}; development certs remaining: {len(dev)} "
          f"(kept: {[d['attributes'].get('displayName') for d in dev]})")


def main():
    p = argparse.ArgumentParser(description="App Store Connect setup helper")
    sub = p.add_subparsers(dest="cmd", required=True)

    def net(sp):
        sp.add_argument("--p8", required=True)
        sp.add_argument("--key-id", required=True)
        sp.add_argument("--issuer", required=True)

    sub.add_parser("selftest").set_defaults(func=cmd_selftest)
    net(sp := sub.add_parser("validate")); sp.set_defaults(func=cmd_validate)
    sp = sub.add_parser("ensure-bundle-id"); net(sp)
    sp.add_argument("--bundle-id", required=True)
    sp.add_argument("--name", required=True)
    sp.set_defaults(func=cmd_ensure_bundle_id)
    sp = sub.add_parser("find-app"); net(sp)
    sp.add_argument("--bundle-id", required=True)
    sp.set_defaults(func=cmd_find_app)
    sp = sub.add_parser("revoke-api-dev-certs"); net(sp)
    sp.set_defaults(func=cmd_revoke_api_dev_certs)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
