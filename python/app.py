from mitmproxy import http
import os
from urllib.parse import urlparse, parse_qs
from datetime import datetime

SAVE_DIR = "raw_bet365_asian"
os.makedirs(SAVE_DIR, exist_ok=True)

def response(flow: http.HTTPFlow):
    url = flow.request.pretty_url

    if "matchbettingcontentapi" in url and ("coupon" in url or "partial" in url):
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        if any("I3" in v for v in params.get("pd", [])):
            event_id = next((v.split("#E")[1].split("#")[0] for v in params["pd"] if "#E" in v), None)
            if event_id:
                filename = f"{SAVE_DIR}/bet365_asian_{event_id}.txt"

                # Modo 'append' para adicionar tudo no mesmo arquivo
                with open(filename, "ab") as f:
                    if os.path.getsize(filename) > 0:
                        f.write(b"\n")  # Separador entre respostas
                    f.write(flow.response.content)

                print(f"✓ Dados asiáticos salvos em: {filename}")