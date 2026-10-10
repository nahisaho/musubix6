<?php
declare(strict_types=1);

namespace Saga\Definition;

use InvalidArgumentException;
use LogicException;

final class SagaDefinition
{
    /** @var array<string, StepDefinition> */
    private array $steps = [];

    public function __construct(public readonly string $name)
    {
        Names::assertValid($name, 'saga');
    }

    /**
     * @id CODE-DEF-001 @implements REQ-DEF-001
     * @id CODE-DEF-003 @implements REQ-DEF-003
     */
    public function addStep(StepDefinition $step): static
    {
        if (isset($this->steps[$step->name])) {
            throw new LogicException("duplicate step {$step->name}");
        }
        $this->steps[$step->name] = $step;
        return $this;
    }

    /** @return string[] */
    public function stepNames(): array
    {
        return array_map('strval', array_keys($this->steps));
    }

    public function step(string $name): StepDefinition
    {
        return $this->steps[$name] ?? throw new LogicException("unknown step $name");
    }

    /**
     * @id CODE-DEF-005 @implements REQ-DEF-005
     * @id CODE-DEF-006 @implements REQ-DEF-006
     * @id CODE-DEF-007 @implements REQ-DEF-007
     * @return string[]
     */
    public function executionOrder(): array
    {
        $index = array_flip($this->stepNames());
        $indeg = [];
        $children = [];
        foreach ($this->steps as $n => $s) {
            $n = (string) $n;
            $indeg[$n] ??= 0;
            foreach (array_unique($s->dependsOn) as $d) {
                if (!isset($this->steps[$d])) {
                    throw new LogicException("step $n depends on unknown step $d");
                }
                $indeg[$n]++;
                $children[$d][] = $n;
            }
        }
        $ready = [];
        foreach ($indeg as $n => $k) {
            if ($k === 0) {
                $ready[(string) $n] = $index[$n];
            }
        }
        $order = [];
        while ($ready !== []) {
            asort($ready);
            $n = (string) array_key_first($ready);
            unset($ready[$n]);
            $order[] = $n;
            foreach ($children[$n] ?? [] as $c) {
                if (--$indeg[$c] === 0) {
                    $ready[$c] = $index[$c];
                }
            }
        }
        if (count($order) !== count($this->steps)) {
            $left = array_values(array_filter($this->stepNames(), fn($n) => !in_array($n, $order, true)));
            throw new LogicException('dependency cycle: ' . implode(' -> ', $this->findCycle($left)));
        }
        return $order;
    }

    /** @param string[] $nodes @return string[] */
    private function findCycle(array $nodes): array
    {
        $set = array_flip($nodes);
        $cur = $nodes[0];
        $path = [];
        while (!in_array($cur, $path, true)) {
            $path[] = $cur;
            $next = null;
            foreach ($this->steps[$cur]->dependsOn as $d) {
                if (isset($set[$d])) {
                    $next = $d;
                    break;
                }
            }
            $cur = $next;
        }
        $cycle = array_slice($path, (int) array_search($cur, $path, true));
        $cycle[] = $cur;
        return $cycle;
    }

    /**
     * @id CODE-DEF-008 @implements REQ-DEF-008
     * @param string[] $completed @return string[]
     */
    public function compensationOrder(array $completed): array
    {
        foreach ($completed as $c) {
            if (!isset($this->steps[$c])) {
                throw new InvalidArgumentException("unknown step $c");
            }
        }
        $done = array_flip($completed);
        return array_values(array_filter(array_reverse($this->executionOrder()), fn($n) => isset($done[$n])));
    }

    /** @id CODE-DEF-009 @implements REQ-DEF-009 */
    public function fingerprint(): string
    {
        $lines = [];
        foreach ($this->steps as $n => $s) {
            $deps = array_unique($s->dependsOn);
            sort($deps);
            $lines[] = $n . ':' . implode(',', $deps);
        }
        sort($lines);
        return hash('sha256', $this->name . "\n" . implode("\n", $lines));
    }
}
