import argparse
import json
import requests
from tqdm import tqdm
from typing import List, Dict

def generate_sample(prompt: str) -> Dict:
    """
    Calls the local LokaFlow API to get a complexity decision.
    We use the /v1/route explain endpoint to capture the full reasoning trace.
    """
    try:
        req = requests.post(
            "http://localhost:4141/v1/route",
            json={"messages": [{"role": "user", "content": prompt}]},
            timeout=10
        )
        req.raise_for_status()
        data = req.json()
        
        return {
            "instruction": prompt,
            "complexity_score": data.get("complexityScore", 0.0),
            "tier": data.get("routingTier", "local"),
            "target": json.dumps({
                "score": data.get("complexityScore", 0.0),
                "reasoning": data.get("reasoning", "Unknown")
            })
        }
    except Exception as e:
        print(f"Failed to score prompt: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Bootstrap LokaFlow synthetic dataset")
    parser.add_argument("--output", type=str, required=True, help="Path for output JSONL")
    parser.add_argument("--samples", type=int, default=100, help="Number of samples to generate")
    args = parser.parse_args()

    # In a real scenario, these prompts would be generated via a high-cap model
    # like GPT-4o iterating over a diverse taxonomy of intent.
    seed_prompts = [
        "What is the capital of France?",
        "Write a python script to parse Apache log files and group by status code.",
        "Can you explain the mathematical foundation of continuous diffusion models?",
        "Hello!",
        "Could you review this React code for performance bottlenecks? [code...]"
    ] * (args.samples // 5)

    print(f"Generating {len(seed_prompts)} labelled samples using LokaFlow endpoint...")
    
    results = []
    for prompt in tqdm(seed_prompts):
        res = generate_sample(prompt)
        if res:
            results.append(res)
            
    with open(args.output, "w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
            
    print(f"Successfully saved {len(results)} samples to {args.output}")

if __name__ == "__main__":
    main()
