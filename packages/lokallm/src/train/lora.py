import argparse
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

def main():
    parser = argparse.ArgumentParser("LokaFlow: QLoRA Fine-Tuning for Phi-3")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output_dir", required=True, help="Where to save LoRA adapters")
    parser.add_argument("--base_model", default="microsoft/Phi-3-mini-4k-instruct", help="HuggingFace model ID")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--batch_size", type=int, default=4, help="Micro batch size")
    args = parser.parse_args()

    print(f"Loading tokenizer {args.base_model}...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    print("Configuring 4-bit quantization (BitsAndBytes)...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )

    print(f"Loading model {args.base_model}...")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True
    )
    
    model = prepare_model_for_kbit_training(model)

    print("Configuring LoRA Adapter...")
    peft_config = LoraConfig(
        r=16,
        lora_alpha=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    print(f"Loading dataset from {args.dataset}...")
    dataset = load_dataset("json", data_files=args.dataset, split="train")

    def format_instruction(sample):
        # Format specifically for Phi-3 instruct
        return f"<|user|>\n{sample['instruction']}<|end|>\n<|assistant|>\n{sample['target']}<|end|>"

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        optim="paged_adamw_32bit",
        save_steps=100,
        logging_steps=10,
        learning_rate=2e-4,
        max_grad_norm=0.3,
        max_steps=-1,
        num_train_epochs=args.epochs,
        warmup_ratio=0.03,
        lr_scheduler_type="constant",
        fp16=True,
    )

    print("Initializing SFT Trainer...")
    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        dataset_text_field="text",
        max_seq_length=1024,
        tokenizer=tokenizer,
        args=training_args,
        formatting_func=lambda x: [format_instruction(s) for s in x]
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving final adapter to {args.output_dir}...")
    trainer.model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print("Training complete! Run loka-export to merge into GGUF.")

if __name__ == "__main__":
    main()
