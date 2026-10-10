<?php
declare(strict_types=1);

namespace Saga\Idempotency;

use LogicException;
use Saga\Retry\ClockInterface;

final class IdempotencyStore
{
    /** @var array<string, array{hash:string, done:bool, at:int, result:mixed}> */
    private array $records = [];

    public function __construct(private ClockInterface $clock, private int $ttlMs)
    {
    }

    /**
     * @id CODE-IDEM-003 @implements REQ-IDEM-003
     * @id CODE-IDEM-004 @implements REQ-IDEM-004
     * @id CODE-IDEM-005 @implements REQ-IDEM-005
     * @id CODE-IDEM-006 @implements REQ-IDEM-006
     * @id CODE-IDEM-008 @implements REQ-IDEM-008
     */
    public function begin(string $key, string $payloadHash): BeginResult
    {
        $r = $this->records[$key] ?? null;
        if ($r !== null && $r['done'] && $this->clock->now() - $r['at'] >= $this->ttlMs) {
            unset($this->records[$key]);
            $r = null;
        }
        if ($r === null) {
            $this->records[$key] = ['hash' => $payloadHash, 'done' => false, 'at' => $this->clock->now(), 'result' => null];
            return new BeginResult(BeginStatus::NEW);
        }
        if ($r['hash'] !== $payloadHash) {
            throw new IdempotencyConflict("key $key reused with a different payload");
        }
        return $r['done'] ? new BeginResult(BeginStatus::REPLAY, $r['result']) : new BeginResult(BeginStatus::IN_FLIGHT);
    }

    /** @id CODE-IDEM-007 @implements REQ-IDEM-007 */
    public function complete(string $key, mixed $result): void
    {
        if (!isset($this->records[$key])) {
            throw new LogicException("unknown idempotency key $key");
        }
        $this->records[$key]['done'] = true;
        $this->records[$key]['at'] = $this->clock->now();
        $this->records[$key]['result'] = $result;
    }

    public function release(string $key): void
    {
        unset($this->records[$key]);
    }
}
