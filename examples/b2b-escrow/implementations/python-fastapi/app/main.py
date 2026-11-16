import argparse
import json
import socket

import uvicorn

from .api import FAULTS, create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8083)
    parser.add_argument("--mode", choices=["v1", "v2"], default="v2")
    parser.add_argument("--fault", choices=FAULTS, default="none")
    parser.add_argument("--test-mode", action="store_true")
    args = parser.parse_args()
    if not args.test_mode or not 0 <= args.port <= 65535:
        parser.error(
            "Requires --test-mode and valid --port; test headers are not production authentication"
        )
    app = create_app(test_mode=True, mode=args.mode, fault=args.fault)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", args.port))
        print(
            json.dumps({"host": f"http://127.0.0.1:{sock.getsockname()[1]}"}),
            flush=True,
        )
        server = uvicorn.Server(
            uvicorn.Config(app, log_level="warning", access_log=False)
        )
        server.run(sockets=[sock])


if __name__ == "__main__":
    main()
