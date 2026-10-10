<?php
declare(strict_types=1);

namespace Saga\Tests;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Saga\Definition\SagaDefinition;
use Saga\Definition\StepDefinition;
use Saga\Idempotency\IdempotencyStore;
use Saga\Orchestrator\DefinitionMismatch;
use Saga\Orchestrator\Orchestrator;
use Saga\Orchestrator\StepContext;
use Saga\Retry\FakeClock;
use Saga\Retry\NonRetryableException;
use Saga\Retry\RetryPolicy;
use Saga\State\ConcurrencyException;
use Saga\State\InMemoryStore;
use Saga\State\SagaStatus;
use Saga\State\StateStore;
use Saga\State\StepStatus;
use Saga\Tests\Support\CrashingStore;
use Saga\Tests\Support\RacingStore;

final class OrchestratorTest extends TestCase
{
    /** @var list<string> */
    private array $log = [];
    private FakeClock $clock;

    protected function setUp(): void
    {
        $this->log = [];
        $this->clock = new FakeClock(0);
    }

    private function orch(?StateStore $store = null, ?IdempotencyStore $idem = null, int $maxAttempts = 3): Orchestrator
    {
        $policy = new RetryPolicy($maxAttempts, 100, 2.0, 1000);
        return new Orchestrator($store ?? new InMemoryStore(), $this->clock, $idem ?? new IdempotencyStore($this->clock, 60000), $policy, $policy);
    }

    private function ok(string $n, array $deps = [], bool $comp = true): StepDefinition
    {
        return new StepDefinition(
            $n,
            function (StepContext $c) use ($n): string {
                $this->log[] = "do:$n";
                return "r-$n";
            },
            $comp ? function (StepContext $c) use ($n): void {
                $this->log[] = "undo:$n";
            } : null,
            $deps,
        );
    }

    private function failing(string $n, array $deps = [], ?\Throwable $e = null): StepDefinition
    {
        return new StepDefinition($n, function (StepContext $c) use ($n, $e): never {
            $this->log[] = "do:$n#{$c->attempt}";
            throw $e ?? new RuntimeException("$n failed");
        }, function (StepContext $c) use ($n): void {
            $this->log[] = "undo:$n";
        }, $deps);
    }

    private function saga(array $steps): SagaDefinition
    {
        $d = new SagaDefinition('checkout');
        foreach ($steps as $s) {
            $d->addStep($s);
        }
        return $d;
    }

    /** @id TEST-ORCH-001 @verifies REQ-ORCH-001 */
    public function test_orch_001_happy_path(): void
    {
        $def = $this->saga([$this->ok('ship', ['pay']), $this->ok('pay', ['reserve']), $this->ok('reserve')]);
        $r = $this->orch()->run($def, 's1');
        $this->assertSame(SagaStatus::COMPLETED, $r->status);
        $this->assertSame(['do:reserve', 'do:pay', 'do:ship'], $this->log);
        $this->assertSame(['reserve' => 'r-reserve', 'pay' => 'r-pay', 'ship' => 'r-ship'], $r->results);
        foreach ($r->instance->stepStatuses() as $s) {
            $this->assertSame(StepStatus::DONE, $s);
        }
    }

    /** @id TEST-ORCH-002 @verifies REQ-ORCH-002 */
    public function test_orch_002_context(): void
    {
        $seen = [];
        $a = new StepDefinition('a', fn(StepContext $c) => 10, null, []);
        $flaky = 0;
        $b = new StepDefinition('b', function (StepContext $c) use (&$seen, &$flaky) {
            $seen[] = [$c->sagaId, $c->step, $c->attempt, $c->results];
            if (++$flaky < 2) {
                throw new RuntimeException('once');
            }
            return 20;
        }, null, ['a']);
        $r = $this->orch()->run($this->saga([$a, $b]), 'sx');
        $this->assertSame(SagaStatus::COMPLETED, $r->status);
        $this->assertSame([['sx', 'b', 1, ['a' => 10]], ['sx', 'b', 2, ['a' => 10]]], $seen);
    }

    /** @id TEST-ORCH-003 @verifies REQ-ORCH-003 */
    public function test_orch_003_compensates_in_reverse(): void
    {
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a']), $this->failing('c', ['b'], new NonRetryableException('no')), $this->ok('d', ['c'])]);
        $r = $this->orch()->run($def, 's3');
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
        $this->assertSame(['do:a', 'do:b', 'do:c#1', 'undo:b', 'undo:a'], $this->log);
        $st = $r->instance->stepStatuses();
        $this->assertSame([StepStatus::COMPENSATED, StepStatus::COMPENSATED, StepStatus::FAILED, StepStatus::PENDING], array_values($st));
    }

    /** @id TEST-ORCH-004 @verifies REQ-ORCH-004 */
    public function test_orch_004_step_without_compensation(): void
    {
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a'], false), $this->failing('c', ['b'], new NonRetryableException('x'))]);
        $r = $this->orch()->run($def, 's4');
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
        $this->assertSame(StepStatus::COMPENSATED, $r->instance->stepStatus('b'));
        $this->assertSame(['do:a', 'do:b', 'do:c#1', 'undo:a'], $this->log);
    }

    /** @id TEST-ORCH-005 @verifies REQ-ORCH-005 */
    public function test_orch_005_retry_then_success(): void
    {
        $n = 0;
        $a = new StepDefinition('a', function (StepContext $c) use (&$n): string {
            if (++$n < 3) {
                throw new RuntimeException('transient');
            }
            return 'fine';
        });
        $r = $this->orch()->run($this->saga([$a]), 's5');
        $this->assertSame(SagaStatus::COMPLETED, $r->status);
        $this->assertSame(3, $n);
        $this->assertSame(300, $this->clock->now());
    }

    /** @id TEST-ORCH-006 @verifies REQ-ORCH-006 */
    public function test_orch_006_retries_exhausted(): void
    {
        $def = $this->saga([$this->ok('a'), $this->failing('b', ['a'])]);
        $r = $this->orch()->run($def, 's6');
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
        $this->assertSame(StepStatus::FAILED, $r->instance->stepStatus('b'));
        $this->assertSame(['do:a', 'do:b#1', 'do:b#2', 'do:b#3', 'undo:a'], $this->log);
        $this->assertSame(300, $this->clock->now());
    }

    /** @id TEST-ORCH-007 @verifies REQ-ORCH-007 */
    public function test_orch_007_compensation_failure(): void
    {
        $bad = new StepDefinition('b', fn() => 1, function (StepContext $c): void {
            $this->log[] = 'undo:b';
            throw new RuntimeException('cannot undo');
        }, ['a']);
        $def = $this->saga([$this->ok('a'), $bad, $this->failing('c', ['b'], new NonRetryableException('x'))]);
        $r = $this->orch(null, null, 2)->run($def, 's7');
        $this->assertSame(SagaStatus::FAILED, $r->status);
        $this->assertSame(StepStatus::COMPENSATION_FAILED, $r->instance->stepStatus('b'));
        $this->assertSame(StepStatus::COMPENSATED, $r->instance->stepStatus('a'));
        $this->assertSame(['do:a', 'do:c#1', 'undo:b', 'undo:b', 'undo:a'], array_values(array_diff($this->log, ['do:b'])));
    }

    /** @id TEST-ORCH-008 @verifies REQ-ORCH-008 */
    public function test_orch_008_resume_after_crash(): void
    {
        foreach ([5, 6, 7] as $crashAt) {
            $this->setUp();
            $inner = new InMemoryStore();
            $def = $this->saga([$this->ok('a'), $this->ok('b', ['a']), $this->ok('c', ['b'])]);
            try {
                $this->orch(new CrashingStore($inner, $crashAt))->run($def, 'sc');
                $this->fail('expected crash');
            } catch (RuntimeException $e) {
                $this->assertSame('simulated crash', $e->getMessage());
            }
            $this->assertSame(SagaStatus::RUNNING, $inner->load('sc')->status());
            $r = $this->orch($inner)->run($def, 'sc');
            $this->assertSame(SagaStatus::COMPLETED, $r->status, "crashAt=$crashAt");
            $this->assertSame(1, count(array_keys($this->log, 'do:a')), "a re-executed (crashAt=$crashAt)");
            $this->assertSame(['r-a', 'r-b', 'r-c'], array_values($r->results));
        }
    }

    /** @id TEST-ORCH-009 @verifies REQ-ORCH-009 */
    public function test_orch_009_terminal_is_stable(): void
    {
        $store = new InMemoryStore();
        $ok = $this->saga([$this->ok('a')]);
        $first = $this->orch($store)->run($ok, 'done');
        $log = $this->log;
        $again = $this->orch($store)->run($ok, 'done');
        $this->assertSame($log, $this->log);
        $this->assertSame(SagaStatus::COMPLETED, $again->status);
        $this->assertSame($first->results, $again->results);
        $this->assertSame($first->instance->version(), $again->instance->version());

        $bad = $this->saga([$this->ok('a'), $this->failing('b', ['a'], new NonRetryableException('x'))]);
        $this->orch($store)->run($bad, 'undone');
        $log = $this->log;
        $r = $this->orch($store)->run($bad, 'undone');
        $this->assertSame($log, $this->log);
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
    }

    /** @id TEST-ORCH-010 @verifies REQ-ORCH-010 */
    public function test_orch_010_definition_mismatch(): void
    {
        $store = new InMemoryStore();
        $this->orch($store)->run($this->saga([$this->ok('a')]), 'sm');
        $this->log = [];
        $changed = $this->saga([$this->ok('a'), $this->ok('b', ['a'])]);
        $this->expectException(DefinitionMismatch::class);
        try {
            $this->orch($store)->run($changed, 'sm');
        } finally {
            $this->assertSame([], $this->log);
        }
    }

    /** @id TEST-ORCH-011 @verifies REQ-ORCH-011 */
    public function test_orch_011_non_retryable(): void
    {
        $def = $this->saga([$this->ok('a'), $this->failing('b', ['a'], new NonRetryableException('stop'))]);
        $r = $this->orch()->run($def, 's11');
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
        $this->assertSame(['do:a', 'do:b#1', 'undo:a'], $this->log);
        $this->assertSame(0, $this->clock->now());
    }

    /** @id TEST-ORCH-012 @verifies REQ-ORCH-012 */
    public function test_orch_012_stale_version(): void
    {
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a'])]);
        $store = new RacingStore(new InMemoryStore(), 4);
        try {
            $this->orch($store)->run($def, 's12');
            $this->fail('expected ConcurrencyException');
        } catch (ConcurrencyException) {
            $this->assertSame(['do:a'], $this->log);
        }
    }

    /** @id TEST-ORCH-013 @verifies REQ-ORCH-013 */
    public function test_orch_013_resume_compensation(): void
    {
        $inner = new InMemoryStore();
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a']), $this->failing('c', ['b'], new NonRetryableException('x'))]);
        try {
            $this->orch(new CrashingStore($inner, 11))->run($def, 's13');
            $this->fail('expected crash');
        } catch (RuntimeException $e) {
            $this->assertSame('simulated crash', $e->getMessage());
        }
        $persisted = $inner->load('s13');
        $this->assertSame(SagaStatus::COMPENSATING, $persisted->status());
        $this->assertSame(StepStatus::COMPENSATED, $persisted->stepStatus('b'));
        $this->assertSame(StepStatus::DONE, $persisted->stepStatus('a'));
        $this->assertSame(['do:a', 'do:b', 'do:c#1', 'undo:b'], $this->log);
        $r = $this->orch($inner)->run($def, 's13');
        $this->assertSame(SagaStatus::COMPENSATED, $r->status);
        $this->assertSame(['do:a', 'do:b', 'do:c#1', 'undo:b', 'undo:a'], $this->log);
    }

    /** @id TEST-ORCH-014 @verifies REQ-ORCH-014 */
    public function test_orch_014_idempotent_replay(): void
    {
        $idem = new IdempotencyStore($this->clock, 60000);
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a'])]);
        $first = $this->orch(new InMemoryStore(), $idem)->run($def, 's14');
        $this->assertSame(['do:a', 'do:b'], $this->log);
        $second = $this->orch(new InMemoryStore(), $idem)->run($def, 's14');
        $this->assertSame(['do:a', 'do:b'], $this->log);
        $this->assertSame(SagaStatus::COMPLETED, $second->status);
        $this->assertSame($first->results, $second->results);
    }

    /** @id TEST-ORCH-015 @verifies REQ-ORCH-015 */
    public function test_orch_015_in_flight_is_not_a_failure(): void
    {
        $idem = new IdempotencyStore($this->clock, 60000);
        $idem->begin(\Saga\Idempotency\KeyFactory::forStep('s15', 'a', 'action'), hash('sha256', 's15/a/action'));
        $store = new InMemoryStore();
        $def = $this->saga([$this->ok('a'), $this->ok('b', ['a'])]);
        try {
            $this->orch($store, $idem)->run($def, 's15');
            $this->fail('expected InFlight');
        } catch (\Saga\Idempotency\InFlight) {
            $this->assertSame([], $this->log);
        }
        $p = $store->load('s15');
        $this->assertSame(SagaStatus::RUNNING, $p->status());
        $this->assertSame(StepStatus::PENDING, $p->stepStatus('a'));
    }
}
