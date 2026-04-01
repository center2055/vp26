from __future__ import annotations

import argparse
from multiprocessing import freeze_support

import uvicorn

from app.main import app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=17826)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    freeze_support()
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        access_log=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
