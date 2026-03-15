"""DINO Gallery Backend - FastAPI entry point."""
import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import argparse
import socket
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from db.database import init_db

_data_dir: str = ""


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(_data_dir)
    from core.settings import init_settings
    init_settings(_data_dir)
    from api.routes import start_model_preload
    start_model_preload(_data_dir)
    yield


def create_app(data_dir: str) -> FastAPI:
    global _data_dir
    _data_dir = data_dir
    os.makedirs(data_dir, exist_ok=True)

    app = FastAPI(title="DINO Gallery Backend", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.data_dir = data_dir
    app.include_router(router, prefix="/api")

    return app


def main():
    parser = argparse.ArgumentParser(description="DINO Gallery Backend")
    parser.add_argument("--port", type=int, default=0, help="Port (0 = auto)")
    parser.add_argument(
        "--data-dir",
        type=str,
        default=os.path.expanduser("~/.dino-gallery"),
        help="Data directory",
    )
    args = parser.parse_args()

    port = args.port if args.port != 0 else find_free_port()

    app = create_app(args.data_dir)

    # Signal to parent process that we're ready
    print(f"READY:{port}", flush=True)
    # Redirect stdout so uvicorn logs don't interfere
    sys.stdout = sys.stderr

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
