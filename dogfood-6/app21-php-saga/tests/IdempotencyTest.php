<?php
declare(strict_types=1);

namespace Saga\Tests;

use LogicException;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Saga\Idempotency\BeginStatus;
use Saga\Idempotency\IdempotencyConflict;
use Saga\Idempotency\IdempotencyStore;
use Saga\Idempotency\IdempotentExecutor;
use Saga\Idempotency\InFlight;
use Saga\Idempotency\KeyFactory;
use Saga\Retry\FakeClock;

final class IdempotencyTest extends TestCase
{
    /** @id TEST-IDEM-001 @verifies REQ-IDEM-001 */
    public function test_idem_001_key_derivation(): void
    {
        $k = KeyFactory::forStep('saga1', 'pay', 'action');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $k);
        $this->assertSame($k, KeyFactory::forStep('saga1', 'pay', 'action'));
        $this->assertNotSame($k, KeyFactory::forStep('saga2', 'pay', 'action'));
        $this->assertNotSame($k, KeyFactory::forStep('saga1', 'ship', 'action'));
        $this->assertNotSame($k, KeyFactory::forStep('saga1', 'pay', 'compensate'));
    }

    /** @id TEST-IDEM-002 @verifies REQ-IDEM-002 */
    public function test_idem_002_no_delimiter_ambiguity(): void
    {
        $this->assertNotSame(KeyFactory::forStep('a|b', 'c', 'action'), KeyFactory::forStep('a', 'b|c', 'action'));
        $this->assertNotSame(KeyFactory::forStep('a:1', 'b', 'x'), KeyFactory::forStep('a', '1:b', 'x'));
        $this->assertNotSame(KeyFactory::forStep('', 'ab', 'c'), KeyFactory::forStep('a', 'b', 'c'));
        $this->assertNotSame(KeyFactory::forStep('1:a', '', 'x'), KeyFactory::forStep('1', 'a', 'x'));
    }

    private function store(int $ttl = 1000, ?FakeClock $clock = null): IdempotencyStore
    {
        return new IdempotencyStore($clock ?? new FakeClock(0), $ttl);
    }

    /** @id TEST-IDEM-003 @verifies REQ-IDEM-003 */
    public function test_idem_003_begin_new(): void
    {
        $r = $this->store()->begin('k', 'h');
        $this->assertSame(BeginStatus::NEW, $r->status);
        $this->assertNull($r->result);
    }

    /** @id TEST-IDEM-004 @verifies REQ-IDEM-004 */
    public function test_idem_004_in_flight(): void
    {
        $s = $this->store();
        $s->begin('k', 'h');
        $this->assertSame(BeginStatus::IN_FLIGHT, $s->begin('k', 'h')->status);
        $this->assertSame(BeginStatus::IN_FLIGHT, $s->begin('k', 'h')->status);
    }

    /** @id TEST-IDEM-005 @verifies REQ-IDEM-005 */
    public function test_idem_005_replay(): void
    {
        $s = $this->store();
        $s->begin('k', 'h');
        $s->complete('k', ['ok' => 1]);
        $r = $s->begin('k', 'h');
        $this->assertSame(BeginStatus::REPLAY, $r->status);
        $this->assertSame(['ok' => 1], $r->result);
        $s->begin('n', 'h');
        $s->complete('n', null);
        $this->assertSame(BeginStatus::REPLAY, $s->begin('n', 'h')->status);
    }

    /** @id TEST-IDEM-006 @verifies REQ-IDEM-006 */
    public function test_idem_006_conflict(): void
    {
        $s = $this->store();
        $s->begin('k', 'h1');
        try {
            $s->begin('k', 'h2');
            $this->fail('conflict while in flight not detected');
        } catch (IdempotencyConflict) {
            $this->addToAssertionCount(1);
        }
        $s->complete('k', 1);
        $this->expectException(IdempotencyConflict::class);
        $s->begin('k', 'h2');
    }

    /** @id TEST-IDEM-007 @verifies REQ-IDEM-007 */
    public function test_idem_007_release(): void
    {
        $s = $this->store();
        $s->begin('k', 'h');
        $s->release('k');
        $this->assertSame(BeginStatus::NEW, $s->begin('k', 'other-hash')->status);
        $this->expectException(LogicException::class);
        $s->complete('never-begun', 1);
    }

    /** @id TEST-IDEM-008 @verifies REQ-IDEM-008 */
    public function test_idem_008_ttl(): void
    {
        $c = new FakeClock(0);
        $s = $this->store(1000, $c);
        $s->begin('k', 'h');
        $c->sleep(5000); // in flight never expires
        $this->assertSame(BeginStatus::IN_FLIGHT, $s->begin('k', 'h')->status);
        $s->complete('k', 'v');
        $c->sleep(999);
        $this->assertSame(BeginStatus::REPLAY, $s->begin('k', 'h')->status);
        $c->sleep(1);
        $this->assertSame(BeginStatus::NEW, $s->begin('k', 'different')->status);
    }

    /** @id TEST-IDEM-009 @verifies REQ-IDEM-009 */
    public function test_idem_009_execute_once(): void
    {
        $x = new IdempotentExecutor($this->store());
        $n = 0;
        $fn = function () use (&$n): string {
            $n++;
            return "r$n";
        };
        $this->assertSame('r1', $x->execute('k', 'h', $fn));
        $this->assertSame('r1', $x->execute('k', 'h', $fn));
        $this->assertSame(1, $n);
        $this->assertSame('r2', $x->execute('k2', 'h', $fn));
    }

    /** @id TEST-IDEM-010 @verifies REQ-IDEM-010 */
    public function test_idem_010_execute_failure_releases(): void
    {
        $x = new IdempotentExecutor($this->store());
        $n = 0;
        try {
            $x->execute('k', 'h', function () use (&$n): void {
                $n++;
                throw new RuntimeException('boom');
            });
            $this->fail('expected throw');
        } catch (RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }
        $this->assertSame('ok', $x->execute('k', 'h', function () use (&$n): string {
            $n++;
            return 'ok';
        }));
        $this->assertSame(2, $n);
    }

    /** @id TEST-IDEM-011 @verifies REQ-IDEM-011 */
    public function test_idem_011_execute_in_flight(): void
    {
        $store = $this->store();
        $store->begin('k', 'h');
        $n = 0;
        try {
            (new IdempotentExecutor($store))->execute('k', 'h', function () use (&$n): int {
                return ++$n;
            });
            $this->fail('expected InFlight');
        } catch (InFlight $e) {
            $this->assertInstanceOf(RuntimeException::class, $e);
        }
        $this->assertSame(0, $n);
        $this->assertSame(BeginStatus::IN_FLIGHT, $store->begin('k', 'h')->status);
    }
}
