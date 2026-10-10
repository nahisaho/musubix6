---
feature: train
tier: T2
---
# train
Goal: seeded training loop, accuracy, early stopping, and learning-rate schedule. Depends on nn, data, ops, tape, rng.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TRAIN-001 | When train!(model, X, y, cfg) is run, the system shall for each batch: bind params on a fresh tape, forward, softmax_ce, backward!, optionally clip (cfg.clip > 0), sgd_step!, and record the epoch mean loss weighted by batch size (sum(loss_b*size_b)/n) in History.losses. | TEST-TRAIN-001 |
| REQ-TRAIN-002 | When the same TrainConfig.seed and initial model are used twice, the system shall produce identical History.losses and final parameters; train! shall create its own Rng(cfg.seed) and use no other randomness. | TEST-TRAIN-002 |
| REQ-TRAIN-003 | When trained on make_xor(Rng(1), 200) with MLP([2,8,2], Rng(2)), epochs=60, lr=0.3, batch=20, seed=7, the system shall reach >= 0.95 accuracy and a final loss below the first epoch loss. | TEST-TRAIN-003 |
| REQ-TRAIN-004 | When accuracy(model, X, y) is called, the system shall return the fraction of rows whose argmax logit equals the label (first max on ties). | TEST-TRAIN-004 |
| REQ-TRAIN-005 | When patience > 0 and the epoch loss is not below best - min_delta for patience consecutive epochs, the system shall stop early, set History.stopped_early = true and History.stop_epoch to that epoch; otherwise stopped_early is false and stop_epoch equals epochs run. | TEST-TRAIN-005 |
| REQ-TRAIN-006 | When lr_schedule(cfg, epoch) is called, the system shall return lr*gamma^floor((epoch-1)/step); epoch < 1, step < 1 or gamma not in (0,1] shall throw ArgumentError. | TEST-TRAIN-006 |
| REQ-TRAIN-007 | If a batch loss or any gradient is NaN or Inf, then train! shall abort with ErrorException naming the epoch and batch and leave params as before that batch's step. | TEST-TRAIN-007 |
| REQ-TRAIN-008 | If epochs < 1 or X and y row counts differ, then train! shall throw ArgumentError / DimensionMismatch before changing the model. | TEST-TRAIN-008 |
| REQ-TRAIN-009 | If any label is outside 1:nclasses (last layer width), then train! shall throw BoundsError before the first parameter update, leaving the model unchanged. | TEST-TRAIN-009 |

## Design
Components: Train.jl orchestrates nn/data/ops/tape; state is the model params, optimizer velocity and the Rng owned by train! (created from cfg.seed).
| phase | action | invariant |
| --- | --- | --- |
| start | validate config and shapes; rng = Rng(cfg.seed); opt = SGD(...) | model untouched on validation failure (REQ-TRAIN-008) |
| epoch start | lr = lr_schedule; batches = batch_indices(rng,...) | rng consumed only here (determinism) |
| batch | fresh Tape; vars=bind!; loss; backward!; clip; step | tape never reused (freed graph, REQ-TAPE-007) |
| guard | non-finite loss or grad => abort BEFORE sgd_step! | params unchanged (REQ-TRAIN-007) |
| epoch end | append size-weighted mean loss; early-stop check loss < best - min_delta | losses length == epochs run |
## Assumptions / risks: determinism depends on RNG order of consumption; retired by TEST-TRAIN-002.
