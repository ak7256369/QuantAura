"""
QuantAura LLM Fine-Tuning Script
Platform: Google Colab (T4 GPU)
Framework: Unsloth (for 2x faster, memory efficient LoRA training on free GPUs)

INSTRUCTIONS:
1. Open Google Colab (colab.research.google.com) and create a New Notebook.
2. Go to Runtime -> Change Runtime Type -> Select T4 GPU.
3. Upload `quantaura_llm_finetune_data.jsonl` to the Colab files section.
4. Paste the following cells and run them.
"""

# ==========================================
# CELL 1: Install Dependencies
# ==========================================
import subprocess
import sys

print("Installing Unsloth and dependencies (this takes ~2-3 minutes)...")
# Run system commands robustly
# Note: Use !pip in Colab if running as cells natively. 
# We remove <0.0.27 from xformers so Colab pulls the latest pre-compiled wheel for PyTorch 2+
text = """
!pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install --no-deps xformers "trl<0.9.0" peft accelerate bitsandbytes
"""
print("Please run these in a Colab Cell:")
print(text)
# ==========================================
# CELL 2: Load Model and Setup LoRA
# ==========================================
import torch
from unsloth import FastLanguageModel
import pandas as pd
from datasets import Dataset

# We use the super-fast Llama-3-8B-Instruct quantized base
max_seq_length = 2048 
dtype = None # Auto detection
load_in_4bit = True # 4bit quantization to fit on T4 GPU

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/llama-3-8b-Instruct-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# Apply LoRA (Parameter Efficient Fine-Tuning)
model = FastLanguageModel.get_peft_model(
    model,
    r = 16, # Rank
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                      "gate_proj", "up_proj", "down_proj",],
    lora_alpha = 16,
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = "unsloth",
    random_state = 3407,
)

# ==========================================
# CELL 3: Prepare Dataset
# ==========================================
# Load the JSONL file we generated locally
data = pd.read_json("quantaura_llm_finetune_data.jsonl", lines=True)

# Standardize to chat format for Llama 3
from unsloth.chat_templates import get_chat_template

tokenizer = get_chat_template(
    tokenizer,
    chat_template = "llama-3",
    mapping = {"role" : "role", "content" : "content", "user" : "user", "assistant" : "assistant"},
)

def formatting_prompts_func(examples):
    conversations = examples["messages"]
    texts = [tokenizer.apply_chat_template(convo, tokenize = False, add_generation_prompt = False) for convo in conversations]
    return { "text" : texts, }

dataset = Dataset.from_pandas(data)
dataset = dataset.map(formatting_prompts_func, batched = True,)

# ==========================================
# CELL 4: Train the Model
# ==========================================
from trl import SFTTrainer
from transformers import TrainingArguments

trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 2,
    packing = False, # Can make training 5x faster for short sequences
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60, # 60 steps is usually enough for a proof of concept
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
    ),
)

trainer_stats = trainer.train()

# ==========================================
# CELL 5: Export to GGUF (For Local CPU Inference)
# ==========================================
# Save the model adapter locally in Colab
model.save_pretrained("quantaura_lora_model")

# Export as GGUF (q4_k_m is the recommended quantization for CPU speed vs quality)
print("Exporting GGUF for Ollama...")
model.save_pretrained_gguf("quantaura_model_gguf", tokenizer, quantization_method = "q4_k_m")

print("""
===================================================
✅ EXPORT COMPLETE!
Download the file `quantaura_model_gguf-unsloth-Q4_K_M.gguf` from the Colab file browser.

NEXT STEPS LOCALLY:
1. Create a file named 'Modelfile' with this content:
   ------------
   FROM ./quantaura_model_gguf-unsloth-Q4_K_M.gguf
   TEMPLATE "{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"
   SYSTEM "You are a professional cryptocurrency market analyst AI for the QuantAura platform."
   ------------

2. Run: `ollama create quantaura-llm -f Modelfile`
3. Done! The Node.js API will now query this model.
===================================================
""")
