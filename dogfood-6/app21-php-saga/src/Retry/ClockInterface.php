<?php
declare(strict_types=1);

namespace Saga\Retry;

interface ClockInterface
{
    /** Milliseconds. */
    public function now(): int;

    public function sleep(int $ms): void;
}
