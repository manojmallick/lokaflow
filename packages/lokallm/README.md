# LokaLLM (V2.7) — Fine-Tuning Pipeline

This package isolates the Python-based machine learning pipeline from the main TypeScript application. It provides the tooling to generate synthetic data, execute Parameter-Efficient Fine-Tuning (PEFT/QLoRA) on `microsoft/Phi-3-mini-4k-instruct`, and export the resulting adapters to GGUF format for edge deployment.

## Prerequisites
- Python 3.10+
- An NVIDIA GPU with at least 16GB VRAM (for 4-bit QLoRA on 3.8B params)
- CUDA 12.x installed

## Setup
It is highly recommended to use a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Workflow

### 1. Data Generation
Uses your local LokaFlow deployment (which must be running via `lokaflow serve`) to programmatically generate labeled data for the `ComplexityMeasurer`.
```bash
loka-generate --output ./data/complexity_train.jsonl --samples 5000
```

### 2. Fine-Tuning (QLoRA)
Runs the supervised fine-tuning loop using HuggingFace `trl` and `bitsandbytes`.
```bash
loka-train --dataset ./data/complexity_train.jsonl --output_dir ./models/phi3-loka-complexity-lora
```

### 3. GGUF Export
Merges the LoRA adapter with the base Phi-3 weights and quantizes it to GGUF using `llama.cpp` for native Ollama support.
```bash
loka-export --adapter ./models/phi3-loka-complexity-lora --output ./models/phi3-loka-complexity-q4_k_m.gguf
```
