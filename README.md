# CV-Pipeline

Fine-tuning and pre-training models on ISIC-like datasets.

## Quick Start

1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd <repository-name>

uv sync
```

Create the following directory structure in the project root (similarly for finetune):


```
data/
├── pretrain/
│   ├── train/
│   ├── val/
│   └── weights.csv          (optional — only if using weighted sampler)
└── fine_tune/
    ├── train/
    ├── val/
    └── weights.csv          (optional — only if using weighted sampler)
```

- Images should be placed in `train/` and `val/` subfolders using ImageFolder layout  
  (subfolders = class names or numeric labels)
- `weights.csv` is required only when `dataloader.sampler_type: weighted`  
  Format: one column with class indices and their sampling weights (no header)

Example `weights.csv`:
```
0,1.0
1,5.2
2,0.8
```

**Note:** ImageFolder works under the hood, it means you can change dataset storage strcture, but the dataset is expected to follow a standard layout:

    train_root/
        class_0/
        class_1/
        ...
    val_root/
        class_0/
        class_1/
        ...

In our example `train_root=data/pretrain/train` and `val_root=data/pretrain/val`.


## Configuration & Training

All parameters are controlled via Hydra configuration files.

See the `configs/` directory for available options.

When everything is ready:
```bash
uv run do-pretrain
```
or
```bash
uv run do-finetune
```

**Note:** Always execute this command from the project root. The configuration uses
relative paths to locate datasets and other resources, which are resolved
relative to the current working directory. Running the script from elsewhere
can lead to FileNotFoundError or incorrect data loading due to the fixed
project directory layout.

## Runtime Storage

Application runtime data lives under `storage/`, which is intentionally ignored by git.
Expected layout for the local Docker setup:

```text
storage/
└── tiny-augment/
    ├── datasets/
    ├── sessions/
    ├── temp/
    └── uploads/
```

`storage/` can become large during dataset imports, generation runs, and temporary uploads. Treat it as ephemeral local state unless you explicitly need to preserve it.

## Manual Scripts

The [`scripts_for_gen/`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/scripts_for_gen) directory contains standalone utilities for manual data preparation and LoRA experiments. Backend services do not invoke these scripts automatically.

- `segment_evf_sam2_json.py`: segmentation via EVF-SAM2 for JSON-described datasets.
- `segment_sam2_json.py`: segmentation via SAM2 for polygon, box, or point prompts.
- `train.py`: LoRA training for the Z-Image pipeline.

Examples:

```bash
python scripts_for_gen/segment_evf_sam2_json.py --input-json data/input.json --output-json data/output.json
python scripts_for_gen/segment_sam2_json.py --input-json data/input.json --output-json data/output.json
python scripts_for_gen/train.py --config scripts_for_gen/train.yaml
```

## Local Config

- Copy [`config/app.yaml.example`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/config/app.yaml.example) to `config/app.yaml` for local overrides.
- Copy [`.env.example`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.env.example) to `.env` when running `docker-compose.yml`.

