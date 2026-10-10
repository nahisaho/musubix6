<?php
declare(strict_types=1);

namespace Rbac\Tests;

use PHPUnit\Framework\TestCase;
use Rbac\Engine\Engine;
use Rbac\Engine\Policy;
use Rbac\Engine\Request;
use Rbac\Roles\RoleHierarchy;

final class EngineTest extends TestCase
{
    private function engine(): Engine
    {
        $h = new RoleHierarchy();
        $h->inherit('editor', 'viewer');
        return new Engine($h);
    }

    /** @id TEST-ENG-001 @verifies REQ-ENG-001 */
    public function test_eng_001_default_deny(): void
    {
        $d = $this->engine()->decide(new Request(['viewer'], 'read', 'doc:1'));
        $this->assertSame('deny', $d->effect);
        $this->assertSame('default-deny', $d->reason);
        $this->assertFalse($d->allowed());
    }

    /** @id TEST-ENG-002 @verifies REQ-ENG-002 */
    public function test_eng_002_allow_inherited(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('p1', 'allow', ['viewer'], ['read'], ['doc:1']));
        $d = $e->decide(new Request(['editor'], 'read', 'doc:1'));
        $this->assertTrue($d->allowed());
        $this->assertFalse($e->decide(new Request(['editor'], 'write', 'doc:1'))->allowed());
        $this->assertFalse($e->decide(new Request(['stranger'], 'read', 'doc:1'))->allowed());
    }

    /** @id TEST-ENG-003 @verifies REQ-ENG-003 */
    public function test_eng_003_deny_overrides(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('a', 'allow', ['viewer'], ['read'], ['doc:1']));
        $e->addPolicy(new Policy('d', 'deny', ['viewer'], ['read'], ['doc:1']));
        $d = $e->decide(new Request(['viewer'], 'read', 'doc:1'));
        $this->assertSame('deny', $d->effect);
        $this->assertSame('deny-policy', $d->reason);
    }

    /** @id TEST-ENG-004 @verifies REQ-ENG-004 */
    public function test_eng_004_condition(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('own', 'allow', ['viewer'], ['read'], ['doc:*'], 'subject.id == resource.owner && env.ip in ["10.0.0.1"]'));
        $ok = new Request(['viewer'], 'read', 'doc:1', ['id' => 'ann'], ['owner' => 'ann'], ['ip' => '10.0.0.1']);
        $bad = new Request(['viewer'], 'read', 'doc:1', ['id' => 'bob'], ['owner' => 'ann'], ['ip' => '10.0.0.1']);
        $this->assertTrue($e->decide($ok)->allowed());
        $this->assertFalse($e->decide($bad)->allowed());
    }

    /** @id TEST-ENG-005 @verifies REQ-ENG-005 */
    public function test_eng_005_wildcards(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('w', 'allow', ['viewer'], ['doc.*'], ['doc:*']));
        $this->assertTrue($e->decide(new Request(['viewer'], 'doc.read', 'doc:42'))->allowed());
        $this->assertFalse($e->decide(new Request(['viewer'], 'doc.read', 'img:42'))->allowed());
        $this->assertFalse($e->decide(new Request(['viewer'], 'img.read', 'doc:42'))->allowed());
    }

    /** @id TEST-ENG-006 @verifies REQ-ENG-006 */
    public function test_eng_006_broken_condition_fails_closed(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('a', 'allow', ['viewer'], ['read'], ['x'], 'subject.id =='));
        $this->assertFalse($e->decide(new Request(['viewer'], 'read', 'x'))->allowed());
        $e2 = $this->engine();
        $e2->addPolicy(new Policy('a', 'allow', ['viewer'], ['read'], ['x']));
        $e2->addPolicy(new Policy('d', 'deny', ['viewer'], ['read'], ['x'], '(('));
        $this->assertFalse($e2->decide(new Request(['viewer'], 'read', 'x'))->allowed());
    }

    /** @id TEST-ENG-007 @verifies REQ-ENG-007 */
    public function test_eng_007_matched_ids_sorted(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('z-allow', 'allow', ['viewer'], ['read'], ['x']));
        $e->addPolicy(new Policy('b-allow', 'allow', ['viewer'], ['read'], ['x']));
        $e->addPolicy(new Policy('never', 'allow', ['other'], ['read'], ['x']));
        $this->assertSame(['b-allow', 'z-allow'], $e->decide(new Request(['viewer'], 'read', 'x'))->matched);
    }

    /** @id TEST-ENG-008 @verifies REQ-ENG-008 */
    public function test_eng_008_bad_effect(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->engine()->addPolicy(new Policy('p', 'permit', ['viewer'], ['read'], ['x']));
    }

    /** @id TEST-ENG-009 @verifies REQ-ENG-009 */
    public function test_eng_009_duplicate_id(): void
    {
        $e = $this->engine();
        $e->addPolicy(new Policy('p', 'allow', ['viewer'], ['read'], ['x']));
        $this->expectException(\LogicException::class);
        $e->addPolicy(new Policy('p', 'deny', ['viewer'], ['read'], ['x']));
    }
}
