<?php
declare(strict_types=1);

namespace Rbac\Tests;

use PHPUnit\Framework\TestCase;
use Rbac\Roles\RoleHierarchy;

final class RoleHierarchyTest extends TestCase
{
    /** @id TEST-ROLES-001 @verifies REQ-ROLES-001 */
    public function test_roles_001_add_makes_known(): void
    {
        $h = new RoleHierarchy();
        $h->addRole('admin');
        $this->assertTrue($h->has('admin'));
        $this->assertFalse($h->has('other'));
    }

    /** @id TEST-ROLES-002 @verifies REQ-ROLES-002 */
    public function test_roles_002_invalid_names(): void
    {
        $h = new RoleHierarchy();
        foreach (['', 'a b', 'x/y'] as $bad) {
            try {
                $h->addRole($bad);
                $this->fail('expected exception for ' . $bad);
            } catch (\InvalidArgumentException $e) {
                $this->assertTrue(true);
            }
        }
    }

    /** @id TEST-ROLES-003 @verifies REQ-ROLES-003 */
    public function test_roles_003_inherit_records_parent(): void
    {
        $h = new RoleHierarchy();
        $h->inherit('editor', 'viewer');
        $this->assertSame(['viewer'], $h->parentsOf('editor'));
    }

    /** @id TEST-ROLES-004 @verifies REQ-ROLES-004 */
    public function test_roles_004_cycle_rejected(): void
    {
        $h = new RoleHierarchy();
        $h->inherit('a', 'b');
        $h->inherit('b', 'c');
        $this->expectException(\LogicException::class);
        try {
            $h->inherit('c', 'a');
        } finally {
            $this->assertSame([], $h->parentsOf('c'));
        }
    }

    /** @id TEST-ROLES-005 @verifies REQ-ROLES-005 */
    public function test_roles_005_effective_diamond(): void
    {
        $h = new RoleHierarchy();
        $h->inherit('d', 'b');
        $h->inherit('d', 'c');
        $h->inherit('b', 'a');
        $h->inherit('c', 'a');
        $eff = $h->effectiveRoles('d');
        sort($eff);
        $this->assertSame(['a', 'b', 'c', 'd'], $eff);
    }

    /** @id TEST-ROLES-006 @verifies REQ-ROLES-006 */
    public function test_roles_006_unknown_is_empty(): void
    {
        $h = new RoleHierarchy();
        $this->assertSame([], $h->effectiveRoles('ghost'));
    }

    /** @id TEST-ROLES-007 @verifies REQ-ROLES-007 */
    public function test_roles_007_union_sorted(): void
    {
        $h = new RoleHierarchy();
        $h->inherit('x', 'base');
        $h->inherit('y', 'base');
        $this->assertSame(['base', 'x', 'y'], $h->effectiveRolesOf(['y', 'x']));
    }
}
