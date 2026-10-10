<?php
declare(strict_types=1);

namespace Saga\State;

use InvalidArgumentException;

final class SagaInstance
{
    /** @var array<string, StepStatus> */
    private array $steps = [];
    /** @var list<array{seq:int,kind:string,subject:string,status:string,at:int}> */
    private array $events = [];
    private array $results = [];
    private SagaStatus $status = SagaStatus::PENDING;
    private int $version = 0;

    private function __construct(private string $id, private string $fingerprint)
    {
    }

    /**
     * @id CODE-STATE-005 @implements REQ-STATE-005
     * @param string[] $stepNames
     */
    public static function create(string $id, string $fingerprint, array $stepNames): self
    {
        $i = new self($id, $fingerprint);
        foreach ($stepNames as $n) {
            $i->steps[(string) $n] = StepStatus::PENDING;
        }
        return $i;
    }

    public function id(): string
    {
        return $this->id;
    }

    public function fingerprint(): string
    {
        return $this->fingerprint;
    }

    public function status(): SagaStatus
    {
        return $this->status;
    }

    public function version(): int
    {
        return $this->version;
    }

    public function setVersion(int $v): void
    {
        $this->version = $v;
    }

    public function stepStatus(string $step): StepStatus
    {
        return $this->steps[$step] ?? throw new InvalidArgumentException("unknown step $step");
    }

    /** @return array<string, StepStatus> */
    public function stepStatuses(): array
    {
        return $this->steps;
    }

    public function events(): array
    {
        return $this->events;
    }

    public function results(): array
    {
        return $this->results;
    }

    public function recordResult(string $step, mixed $result): void
    {
        $this->stepStatus($step);
        $this->results[$step] = $result;
    }

    /**
     * @id CODE-STATE-002 @implements REQ-STATE-002
     * @id CODE-STATE-006 @implements REQ-STATE-006
     */
    public function transitionSaga(SagaStatus $to, int $at): void
    {
        if (!SagaStatus::canTransition($this->status, $to)) {
            throw new IllegalTransition("saga {$this->id}: {$this->status->name} -> {$to->name}");
        }
        $this->status = $to;
        $this->append('saga', $this->id, $to->value, $at);
    }

    public function transitionStep(string $step, StepStatus $to, int $at): void
    {
        $from = $this->stepStatus($step);
        if (!StepStatus::canTransition($from, $to)) {
            throw new IllegalTransition("step $step: {$from->name} -> {$to->name}");
        }
        $this->steps[$step] = $to;
        $this->append('step', $step, $to->value, $at);
    }

    private function append(string $kind, string $subject, string $status, int $at): void
    {
        $this->events[] = ['seq' => count($this->events) + 1, 'kind' => $kind, 'subject' => $subject, 'status' => $status, 'at' => $at];
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'fingerprint' => $this->fingerprint,
            'status' => $this->status->value,
            'version' => $this->version,
            'steps' => array_map(fn(StepStatus $s) => $s->value, $this->steps),
            'results' => $this->results,
            'events' => $this->events,
        ];
    }

    /** @id CODE-STATE-007 @implements REQ-STATE-007 */
    public static function fromArray(array $a): self
    {
        foreach (['id', 'fingerprint', 'status', 'version', 'steps', 'results', 'events'] as $k) {
            if (!array_key_exists($k, $a)) {
                throw new InvalidArgumentException("missing field $k");
            }
        }
        if (!is_string($a['id']) || !is_string($a['fingerprint']) || !is_int($a['version']) || !is_array($a['steps']) || !is_array($a['results']) || !is_array($a['events'])) {
            throw new InvalidArgumentException('invalid field type');
        }
        $i = new self($a['id'], $a['fingerprint']);
        $i->status = SagaStatus::tryFrom((string) $a['status']) ?? throw new InvalidArgumentException('unknown saga status');
        $i->version = $a['version'];
        foreach ($a['steps'] as $n => $s) {
            $i->steps[(string) $n] = StepStatus::tryFrom((string) $s) ?? throw new InvalidArgumentException('unknown step status');
        }
        $i->results = $a['results'];
        $i->events = array_values($a['events']);
        return $i;
    }
}
