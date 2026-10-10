<?php
declare(strict_types=1);

namespace Saga\Idempotency;

final class IdempotentExecutor
{
    public function __construct(private IdempotencyStore $store)
    {
    }

    /**
     * @id CODE-IDEM-009 @implements REQ-IDEM-009
     * @id CODE-IDEM-010 @implements REQ-IDEM-010
     * @id CODE-IDEM-011 @implements REQ-IDEM-011
     */
    public function execute(string $key, string $payloadHash, callable $fn): mixed
    {
        $b = $this->store->begin($key, $payloadHash);
        if ($b->status === BeginStatus::REPLAY) {
            return $b->result;
        }
        if ($b->status === BeginStatus::IN_FLIGHT) {
            throw new InFlight("key $key is already in flight");
        }
        try {
            $result = $fn();
        } catch (\Throwable $e) {
            $this->store->release($key);
            throw $e;
        }
        $this->store->complete($key, $result);
        return $result;
    }
}
