from mitmproxy import http
import os
from urllib.parse import urlparse, parse_qs
from datetime import datetime

# Diretórios para salvar os arquivos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PINNACLE_DIR = os.path.join(BASE_DIR, "raw_pinnacle")
BET365_DIR = os.path.join(BASE_DIR, "raw_bet365_asian")

os.makedirs(PINNACLE_DIR, exist_ok=True)
os.makedirs(BET365_DIR, exist_ok=True)

def response(flow: http.HTTPFlow):
    url = flow.request.pretty_url

    # PINNACLE - mercados principais (ex: straight)
    if "guest.api.arcadia.pinnacle.com" in url and "markets/related/straight" in url:
        try:
            matchup_id = url.split('/matchups/')[1].split('/')[0]
            filename = os.path.join(PINNACLE_DIR, f"pinnacle_{matchup_id}.json")

            with open(filename, "wb") as f:
                f.write(flow.response.content)

            print(f"✓ Dados Pinnacle salvos em: {filename}")
        except Exception as e:
            print(f"Erro ao salvar dados Pinnacle: {e}")

    # BET365 - odds asiáticas (ex: handicap e total)
    if "matchbettingcontentapi" in url and ("coupon" in url or "partial" in url):
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        if any("I3" in v for v in params.get("pd", [])):
            event_id = next((v.split("#E")[1].split("#")[0] for v in params["pd"] if "#E" in v), None)
            if event_id:
                filename = os.path.join(BET365_DIR, f"bet365_asian_{event_id}.txt")

                with open(filename, "ab") as f:
                    if os.path.getsize(filename) > 0:
                        f.write(b"\n")
                    f.write(flow.response.content)

                print(f"✓ Dados Bet365 salvos em: {filename}")

    if (
        "guest.api.arcadia.pinnacle.com" in url
        and "/related" in url
        and "/markets/" not in url
    ):
        try:
            matchup_id = url.split('/matchups/')[1].split('/')[0]
            filename = os.path.join(PINNACLE_DIR, f"related_{matchup_id}.json")

            with open(filename, "wb") as f:
                f.write(flow.response.content)

            print(f"✓ Dados related salvos: {filename}")
        except Exception as e:
            print(f"Erro ao salvar related: {e}")
