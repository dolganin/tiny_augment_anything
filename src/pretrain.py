import hydra

from omegaconf import DictConfig

from train import train_model


@hydra.main(config_path="../configs", config_name="pretrain")
def pretrain(cfg: DictConfig):

    train_loader, val_loader = hydra.utils.call(cfg.dataloader)
    model = hydra.utils.call(cfg.model.object)

    optimizer_init = hydra.utils.instantiate(cfg.optimizer)
    optimizer = optimizer_init(model.parameters())

    scheduler_init = hydra.utils.instantiate(cfg.scheduler)
    scheduler = scheduler_init(optimizer)

    train_model(model, train_loader, val_loader, optimizer, scheduler, cfg.train.epochs)


if __name__ == "__main__":
    pretrain()
