<?php
declare(strict_types=1);

namespace Saga\Orchestrator;

use Saga\Definition\SagaDefinition;
use Saga\Idempotency\IdempotencyStore;
use Saga\Idempotency\IdempotentExecutor;
use Saga\Idempotency\InFlight;
use Saga\Idempotency\KeyFactory;
use Saga\Retry\ClockInterface;
use Saga\Retry\RetryExecutor;
use Saga\Retry\RetryPolicy;
use Saga\State\SagaInstance;
use Saga\State\SagaStatus;
use Saga\State\StateStore;
use Saga\State\StepStatus;

final class Orchestrator
{
    private IdempotentExecutor $idem;

    public function __construct(
        private StateStore $store,
        private ClockInterface $clock,
        IdempotencyStore $idempotency,
        private RetryPolicy $actionPolicy,
        private RetryPolicy $compensationPolicy,
        private $rng = null,
    ) {
        $this->idem = new IdempotentExecutor($idempotency);
    }

    /**
     * @id CODE-ORCH-001 @implements REQ-ORCH-001
     * @id CODE-ORCH-009 @implements REQ-ORCH-009
     * @id CODE-ORCH-010 @implements REQ-ORCH-010
     * @id CODE-ORCH-013 @implements REQ-ORCH-013
     */
    public function run(SagaDefinition $def, string $sagaId): SagaResult
    {
        $order = $def->executionOrder();
        $fingerprint = $def->fingerprint();
        $inst = $this->store->load($sagaId);
        if ($inst === null) {
            $inst = SagaInstance::create($sagaId, $fingerprint, $def->stepNames());
            $this->persist($inst);
        } elseif ($inst->fingerprint() !== $fingerprint) {
            throw new DefinitionMismatch("saga $sagaId was started with a different definition");
        }
        if ($inst->status()->isTerminal()) {
            return new SagaResult($inst);
        }
        if ($inst->status() === SagaStatus::PENDING) {
            $inst->transitionSaga(SagaStatus::RUNNING, $this->clock->now());
            $this->persist($inst);
        }
        if ($inst->status() === SagaStatus::RUNNING) {
            $this->forward($def, $inst, $order);
        }
        if ($inst->status() === SagaStatus::COMPENSATING) {
            $this->compensate($def, $inst);
        }
        return new SagaResult($inst);
    }

    private function persist(SagaInstance $inst): void
    {
        $this->store->save($inst, $inst->version());
    }

    /**
     * @id CODE-ORCH-002 @implements REQ-ORCH-002
     * @id CODE-ORCH-005 @implements REQ-ORCH-005
     * @id CODE-ORCH-006 @implements REQ-ORCH-006
     * @id CODE-ORCH-008 @implements REQ-ORCH-008
     * @id CODE-ORCH-011 @implements REQ-ORCH-011
     * @id CODE-ORCH-012 @implements REQ-ORCH-012
     * @id CODE-ORCH-014 @implements REQ-ORCH-014
     * @id CODE-ORCH-015 @implements REQ-ORCH-015
     * @param string[] $order
     */
    private function forward(SagaDefinition $def, SagaInstance $inst, array $order): void
    {
        $retry = new RetryExecutor($this->clock, $this->rng);
        foreach ($order as $name) {
            $status = $inst->stepStatus($name);
            if ($status === StepStatus::DONE) {
                continue;
            }
            if ($status === StepStatus::RUNNING) {
                $inst->transitionStep($name, StepStatus::PENDING, $this->clock->now());
            }
            $inst->transitionStep($name, StepStatus::RUNNING, $this->clock->now());
            $this->persist($inst);
            $step = $def->step($name);
            $id = $inst->id();
            try {
                $result = $this->idem->execute(
                    KeyFactory::forStep($id, $name, 'action'),
                    hash('sha256', "$id/$name/action"),
                    fn() => $retry->run($this->actionPolicy, fn(int $attempt) => ($step->action)(new StepContext($id, $name, $attempt, $inst->results()))),
                );
            } catch (InFlight $e) {
                $inst->transitionStep($name, StepStatus::PENDING, $this->clock->now());
                $this->persist($inst);
                throw $e;
            } catch (\Throwable) {
                $inst->transitionStep($name, StepStatus::FAILED, $this->clock->now());
                $inst->transitionSaga(SagaStatus::COMPENSATING, $this->clock->now());
                $this->persist($inst);
                return;
            }
            $inst->recordResult($name, $result);
            $inst->transitionStep($name, StepStatus::DONE, $this->clock->now());
            $this->persist($inst);
        }
        $inst->transitionSaga(SagaStatus::COMPLETED, $this->clock->now());
        $this->persist($inst);
    }

    /**
     * @id CODE-ORCH-003 @implements REQ-ORCH-003
     * @id CODE-ORCH-004 @implements REQ-ORCH-004
     * @id CODE-ORCH-007 @implements REQ-ORCH-007
     */
    private function compensate(SagaDefinition $def, SagaInstance $inst): void
    {
        $retry = new RetryExecutor($this->clock, $this->rng);
        $pending = [];
        foreach ($inst->stepStatuses() as $n => $s) {
            if ($s === StepStatus::DONE || $s === StepStatus::COMPENSATING) {
                $pending[] = (string) $n;
            }
        }
        foreach ($def->compensationOrder($pending) as $name) {
            if ($inst->stepStatus($name) === StepStatus::DONE) {
                $inst->transitionStep($name, StepStatus::COMPENSATING, $this->clock->now());
                $this->persist($inst);
            }
            $step = $def->step($name);
            $id = $inst->id();
            $ok = true;
            if ($step->compensation !== null) {
                try {
                    $this->idem->execute(
                        KeyFactory::forStep($id, $name, 'compensate'),
                        hash('sha256', "$id/$name/compensate"),
                        fn() => $retry->run($this->compensationPolicy, fn(int $attempt) => ($step->compensation)(new StepContext($id, $name, $attempt, $inst->results()))),
                    );
                } catch (\Throwable) {
                    $ok = false;
                }
            }
            $inst->transitionStep($name, $ok ? StepStatus::COMPENSATED : StepStatus::COMPENSATION_FAILED, $this->clock->now());
            $this->persist($inst);
        }
        $failed = in_array(StepStatus::COMPENSATION_FAILED, $inst->stepStatuses(), true);
        $inst->transitionSaga($failed ? SagaStatus::FAILED : SagaStatus::COMPENSATED, $this->clock->now());
        $this->persist($inst);
    }
}
