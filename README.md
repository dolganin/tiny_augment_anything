# ISIC Classification

Fine-tuning and pre-training models on ISIC-like datasets.

## Quick Start

1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd <repository-name>

uv sync
```

Create the following directory structure in the project root:


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

## Configuration & Training

All parameters are controlled via Hydra configuration files.

See the `configs/` directory for available options.

