<?php
declare(strict_types=1);

namespace Saga\Tests\Support;

use RuntimeException;
use Saga\State\SagaInstance;
use Saga\State\StateStore;

final class CrashingStore implements StateStore
{
    public int $saves = 0;

    public function __construct(private StateStore $inner, private int $crashOnSave)
    {
    }

    public function load(string $id): ?SagaInstance
    {
        return $this->inner->load($id);
    }

    public function save(SagaInstance $instance, int $expectedVersion): void
    {
        if (++$this->saves === $this->crashOnSave) {
            throw new RuntimeException('simulated crash');
        }
        $this->inner->save($instance, $expectedVersion);
    }
}
