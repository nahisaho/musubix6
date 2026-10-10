<?php
declare(strict_types=1);

namespace Saga\Tests;

use InvalidArgumentException;
use LogicException;
use PHPUnit\Framework\TestCase;
use Saga\State\ConcurrencyException;
use Saga\State\CorruptState;
use Saga\State\FileStore;
use Saga\State\IllegalTransition;
use Saga\State\InMemoryStore;
use Saga\State\SagaInstance;
use Saga\State\SagaStatus;
use Saga\State\StepStatus;

final class StateTest extends TestCase
{
    private function inst(): SagaInstance
    {
        return SagaInstance::create('s1', 'fp', ['a', 'b']);
    }

    private function dir(): string
    {
        $d = __DIR__ . '/../var/saga-state-' . bin2hex(random_bytes(4));
        mkdir($d, 0777, true);
        return $d;
    }

    /** @id TEST-STATE-001 @verifies REQ-STATE-001 */
    public function test_state_001_legal_saga_transitions(): void
    {
        $legal = [
            [SagaStatus::PENDING, SagaStatus::RUNNING],
            [SagaStatus::PENDING, SagaStatus::COMPLETED],
            [SagaStatus::RUNNING, SagaStatus::COMPENSATING],
            [SagaStatus::RUNNING, SagaStatus::COMPLETED],
            [SagaStatus::COMPENSATING, SagaStatus::COMPENSATED],
            [SagaStatus::COMPENSATING, SagaStatus::FAILED],
        ];
        foreach ($legal as [$from, $to]) {
            $i = $this->inst();
            $path = match ($from) {
                SagaStatus::PENDING => [],
                SagaStatus::RUNNING => [SagaStatus::RUNNING],
                SagaStatus::COMPENSATING => [SagaStatus::RUNNING, SagaStatus::COMPENSATING],
            };
            foreach ($path as $p) {
                $i->transitionSaga($p, 1);
            }
            $this->assertSame($from, $i->status());
            $i->transitionSaga($to, 2);
            $this->assertSame($to, $i->status());
        }
    }

    /** @id TEST-STATE-002 @verifies REQ-STATE-002 */
    public function test_state_002_illegal_saga_transition(): void
    {
        $i = $this->inst();
        try {
            $i->transitionSaga(SagaStatus::COMPENSATED, 5);
            $this->fail('expected IllegalTransition');
        } catch (IllegalTransition $e) {
            $this->assertInstanceOf(LogicException::class, $e);
        }
        $this->assertSame(SagaStatus::PENDING, $i->status());
        $this->assertSame([], $i->events());
        $this->expectException(IllegalTransition::class);
        $i->transitionSaga(SagaStatus::PENDING, 5);
    }

    /** @id TEST-STATE-003 @verifies REQ-STATE-003 */
    public function test_state_003_terminal_states(): void
    {
        foreach ([SagaStatus::COMPLETED, SagaStatus::COMPENSATED, SagaStatus::FAILED] as $t) {
            $this->assertTrue($t->isTerminal());
            foreach (SagaStatus::cases() as $to) {
                $this->assertFalse(SagaStatus::canTransition($t, $to), "{$t->name}->{$to->name}");
            }
        }
        $this->assertFalse(SagaStatus::RUNNING->isTerminal());
        $this->assertFalse(SagaStatus::COMPENSATING->isTerminal());
    }

    /** @id TEST-STATE-004 @verifies REQ-STATE-004 */
    public function test_state_004_step_transitions(): void
    {
        $i = $this->inst();
        $i->transitionStep('a', StepStatus::RUNNING, 1);
        $i->transitionStep('a', StepStatus::DONE, 2);
        $i->transitionStep('a', StepStatus::COMPENSATING, 3);
        $i->transitionStep('a', StepStatus::COMPENSATION_FAILED, 4);
        $this->assertSame(StepStatus::COMPENSATION_FAILED, $i->stepStatus('a'));
        $i->transitionStep('b', StepStatus::RUNNING, 5);
        $i->transitionStep('b', StepStatus::PENDING, 6);
        $this->assertSame(StepStatus::PENDING, $i->stepStatus('b'));
        $before = count($i->events());
        foreach ([[ 'a', StepStatus::DONE], ['b', StepStatus::DONE], ['b', StepStatus::COMPENSATED]] as [$s, $to]) {
            try {
                $i->transitionStep($s, $to, 9);
                $this->fail("legal? $s -> {$to->name}");
            } catch (IllegalTransition) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame($before, count($i->events()));
        $this->expectException(InvalidArgumentException::class);
        $i->transitionStep('nope', StepStatus::RUNNING, 1);
    }

    /** @id TEST-STATE-005 @verifies REQ-STATE-005 */
    public function test_state_005_new_instance(): void
    {
        $i = $this->inst();
        $this->assertSame('s1', $i->id());
        $this->assertSame('fp', $i->fingerprint());
        $this->assertSame(SagaStatus::PENDING, $i->status());
        $this->assertSame(0, $i->version());
        $this->assertSame(['a' => StepStatus::PENDING, 'b' => StepStatus::PENDING], $i->stepStatuses());
        $this->assertSame([], $i->events());
        $this->assertSame([], $i->results());
    }

    /** @id TEST-STATE-006 @verifies REQ-STATE-006 */
    public function test_state_006_events(): void
    {
        $i = $this->inst();
        $i->transitionSaga(SagaStatus::RUNNING, 100);
        $i->transitionStep('a', StepStatus::RUNNING, 110);
        $e = $i->events();
        $this->assertSame([
            ['seq' => 1, 'kind' => 'saga', 'subject' => 's1', 'status' => 'RUNNING', 'at' => 100],
            ['seq' => 2, 'kind' => 'step', 'subject' => 'a', 'status' => 'RUNNING', 'at' => 110],
        ], $e);
    }

    /** @id TEST-STATE-007 @verifies REQ-STATE-007 */
    public function test_state_007_roundtrip(): void
    {
        $i = $this->inst();
        $i->transitionSaga(SagaStatus::RUNNING, 1);
        $i->transitionStep('a', StepStatus::RUNNING, 2);
        $i->transitionStep('a', StepStatus::DONE, 3);
        $i->recordResult('a', ['x' => 1, 'y' => [true, null]]);
        $copy = SagaInstance::fromArray(json_decode(json_encode($i->toArray(), JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR));
        $this->assertEquals($i, $copy);
        $this->assertSame($i->toArray(), $copy->toArray());
        $bad = $i->toArray();
        $bad['status'] = 'EXPLODED';
        $missing = $i->toArray();
        unset($missing['steps']);
        $badStep = $i->toArray();
        $badStep['steps']['a'] = 'NOPE';
        foreach ([$bad, $missing, $badStep, []] as $b) {
            try {
                SagaInstance::fromArray($b);
                $this->fail('accepted corrupt data');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /** @id TEST-STATE-008 @verifies REQ-STATE-008 */
    public function test_state_008_memory_store(): void
    {
        $s = new InMemoryStore();
        $this->assertNull($s->load('s1'));
        $i = $this->inst();
        $s->save($i, 0);
        $this->assertSame(1, $i->version());
        $loaded = $s->load('s1');
        $this->assertSame(1, $loaded->version());
        $loaded->transitionSaga(SagaStatus::RUNNING, 1);
        $this->assertSame(SagaStatus::PENDING, $s->load('s1')->status());
        $s->save($loaded, 1);
        $this->assertSame(2, $s->load('s1')->version());
        try {
            $s->save($i, 1);
            $this->fail('stale save accepted');
        } catch (ConcurrencyException) {
            $this->assertSame(2, $s->load('s1')->version());
        }
        $this->expectException(ConcurrencyException::class);
        $s->save(SagaInstance::create('fresh', 'fp', []), 3);
    }

    /** @id TEST-STATE-009 @verifies REQ-STATE-009 */
    public function test_state_009_file_store(): void
    {
        $d = $this->dir();
        $a = new FileStore($d);
        $i = $this->inst();
        $i->transitionSaga(SagaStatus::RUNNING, 7);
        $a->save($i, 0);
        $this->assertSame(['s1.json'], array_values(array_diff(scandir($d), ['.', '..'])));
        $b = new FileStore($d);
        $x = $b->load('s1');
        $this->assertSame(SagaStatus::RUNNING, $x->status());
        $this->assertSame(1, $x->version());
        $this->assertNull($b->load('missing'));
        $b->save($x, 1);
        $this->expectException(ConcurrencyException::class);
        $a->save($i, 1);
    }

    /** @id TEST-STATE-010 @verifies REQ-STATE-010 */
    public function test_state_010_file_store_safety(): void
    {
        $d = $this->dir();
        $s = new FileStore($d);
        foreach (['../x', 'a/b', '.hidden', '', 'a b', ".."] as $bad) {
            try {
                $s->load($bad);
                $this->fail('accepted id ' . json_encode($bad));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        file_put_contents("$d/broken.json", '{"id": ');
        $this->expectException(CorruptState::class);
        $s->load('broken');
    }
}
