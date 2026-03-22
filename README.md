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


