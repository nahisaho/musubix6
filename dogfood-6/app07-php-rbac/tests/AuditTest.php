<?php
declare(strict_types=1);

namespace Rbac\Tests;

use PHPUnit\Framework\TestCase;
use Rbac\Audit\AuditedEngine;
use Rbac\Audit\AuditLog;
use Rbac\Engine\Decision;
use Rbac\Engine\Engine;
use Rbac\Engine\Policy;
use Rbac\Engine\Request;
use Rbac\Roles\RoleHierarchy;

final class AuditTest extends TestCase
{
    private function audited(?AuditLog $log = null): AuditedEngine
    {
        $h = new RoleHierarchy();
        $h->addRole('viewer');
        $e = new Engine($h);
        $e->addPolicy(new Policy('p1', 'allow', ['viewer'], ['read'], ['doc:*']));
        $n = 0;
        return new AuditedEngine($e, $log ?? new AuditLog(), function () use (&$n): int {
            return 1000 + $n++;
        });
    }

    private function req(string $action = 'read'): Request
    {
        return new Request(['viewer'], $action, 'doc:1', ['id' => 'ann']);
    }

    /** @id TEST-AUD-001 @verifies REQ-AUD-001 */
    public function test_aud_001_entry_appended(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req());
        $es = $log->entries();
        $this->assertCount(1, $es);
        $this->assertSame('ann', $es[0]['subject']);
        $this->assertSame('read', $es[0]['action']);
        $this->assertSame('doc:1', $es[0]['resource']);
        $this->assertSame('allow', $es[0]['decision']);
        $this->assertSame(['p1'], $es[0]['matched']);
        $this->assertSame(1000, $es[0]['ts']);
    }

    /** @id TEST-AUD-002 @verifies REQ-AUD-002 */
    public function test_aud_002_hash_chain(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req());
        $a->decide($this->req('write'));
        [$e1, $e2] = $log->entries();
        $this->assertSame(str_repeat('0', 64), $e1['prev']);
        $this->assertSame($e1['hash'], $e2['prev']);
        $body = $e2;
        unset($body['hash']);
        $this->assertSame(hash('sha256', $e2['prev'] . json_encode($body)), $e2['hash']);
    }

    /** @id TEST-AUD-003 @verifies REQ-AUD-003 */
    public function test_aud_003_verify_ok(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req());
        $a->decide($this->req('write'));
        $this->assertTrue($log->verify());
        $this->assertTrue((new AuditLog())->verify());
    }

    /** @id TEST-AUD-004 @verifies REQ-AUD-004 */
    public function test_aud_004_verify_detects_tamper(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req('write'));
        $a->decide($this->req());
        $es = $log->entries();
        $es[0]['decision'] = 'allow';
        $this->assertFalse(AuditLog::fromEntries($es)->verify());
        $es2 = $log->entries();
        unset($es2[0]);
        $this->assertFalse(AuditLog::fromEntries(array_values($es2))->verify());
    }

    /** @id TEST-AUD-005 @verifies REQ-AUD-005 */
    public function test_aud_005_filter(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req());
        $a->decide($this->req('write'));
        $this->assertCount(1, $log->filter('deny'));
        $this->assertSame('write', $log->filter('deny')[0]['action']);
        $this->assertCount(1, $log->filter('allow'));
    }

    /** @id TEST-AUD-006 @verifies REQ-AUD-006 */
    public function test_aud_006_engine_error_fails_closed(): void
    {
        $boom = new class (new RoleHierarchy()) extends Engine {
            public function decide(Request $r): Decision
            {
                throw new \RuntimeException('db down');
            }
        };
        $log = new AuditLog();
        $a = new AuditedEngine($boom, $log, fn (): int => 5);
        $d = $a->decide($this->req());
        $this->assertFalse($d->allowed());
        $this->assertSame('error', $d->reason);
        $this->assertSame('deny', $log->entries()[0]['decision']);
        $this->assertSame('error', $log->entries()[0]['reason']);
    }

    /** @id TEST-AUD-007 @verifies REQ-AUD-007 */
    public function test_aud_007_export_json_line(): void
    {
        $log = new AuditLog();
        $a = $this->audited($log);
        $a->decide($this->req());
        $line = $log->export(0);
        $this->assertStringNotContainsString("\n", $line);
        $data = json_decode($line, true);
        $keys = array_keys($data);
        $sorted = $keys;
        sort($sorted, SORT_STRING);
        $this->assertSame($sorted, $keys);
        $this->assertSame($log->entries()[0]['hash'], $data['hash']);
    }
}
