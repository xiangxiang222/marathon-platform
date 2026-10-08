#!/usr/bin/env python3
"""把 /marathon/ 接到 3790。已有这段时不动。只插在反代 3780 的 location 前面。"""
from pathlib import Path

path = Path("/etc/nginx/sites-available/beiyexing")
text = path.read_text()
if "location /marathon/" in text:
    raise SystemExit(0)
block = """    location /marathon/ {
        proxy_pass http://127.0.0.1:3790;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

"""
old = "    location / {\n        proxy_pass http://127.0.0.1:3780;"
if old not in text:
    raise SystemExit("没找到同行者众的反代 location，没有改 nginx")
path.write_text(text.replace(old, block + old))
print("已写入 /marathon/ 反代")
