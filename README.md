# Synapse

AI-powered local photo gallery with natural language search. Built with Tauri, React, and Python.

Synapse indexes your photos using DINOv2 and Chinese-CLIP vision models, enabling you to search by visual content, location, and time — all running locally on your machine with no cloud dependency.

<!-- ![screenshot](docs/screenshot.png) -->

## Features

- **Visual Search** — Find photos by describing them: "sunset at beach", "去年夏天的猫"
- **Similarity Search** — Select a photo and find visually similar ones
- **Duplicate Detection** — Identify and resolve duplicate photos
- **Timeline & Statistics** — Browse photos by time, view shooting stats with date range filtering
- **Map View** — See where your photos were taken (reverse geocoding from EXIF GPS)
- **Albums, Favorites & Trash** — Organize your library
- **Dark/Light Theme** — System-aware with manual override
- **Bilingual** — English and Chinese interface
- **Fully Local** — All AI inference runs on-device via ONNX Runtime (no GPU required)

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+
- Rust (latest stable)

### Development

```bash
# Clone
git clone https://github.com/Charlie237/Synapse.git
cd Synapse

# Frontend
npm install

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .
pip install torch transformers  # needed for first-time ONNX model export
cd ..

# Run
npm run tauri dev
```

On first launch, the backend will export ONNX models from PyTorch (~2 min). Subsequent launches are instant.

### Build

```bash
npm run tauri build
```

For distribution builds that bundle the Python backend:

```bash
cd backend
pip install pyinstaller
pyinstaller synapse-backend.spec
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2 (Rust) |
| Frontend | React 18, TailwindCSS 4 |
| Backend | FastAPI, SQLite |
| AI Models | DINOv2, Chinese-CLIP (ONNX Runtime) |
| Search | jieba (local) / OpenAI-compatible API (cloud) |
| CI/CD | GitHub Actions (macOS arm64, Windows x64) |

## License

MIT
