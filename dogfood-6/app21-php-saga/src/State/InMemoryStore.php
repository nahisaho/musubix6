<?php
declare(strict_types=1);

namespace Saga\State;

final class InMemoryStore implements StateStore
{
    /** @var array<string, array> */
    private array $data = [];

    public function load(string $id): ?SagaInstance
    {
        return isset($this->data[$id]) ? SagaInstance::fromArray($this->data[$id]) : null;
    }

    /** @id CODE-STATE-008 @implements REQ-STATE-008 */
    public function save(SagaInstance $instance, int $expectedVersion): void
    {
        $current = isset($this->data[$instance->id()]) ? $this->data[$instance->id()]['version'] : 0;
        if ($current !== $expectedVersion) {
            throw new ConcurrencyException("stale version for {$instance->id()}: expected $expectedVersion, found $current");
        }
        $instance->setVersion($expectedVersion + 1);
        $this->data[$instance->id()] = $instance->toArray();
    }
}
