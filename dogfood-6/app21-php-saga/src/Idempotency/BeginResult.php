<?php
declare(strict_types=1);

namespace Saga\Idempotency;

final class BeginResult
{
    public function __construct(public readonly BeginStatus $status, public readonly mixed $result = null)
    {
    }
}
