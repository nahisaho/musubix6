<?php
declare(strict_types=1);
namespace Acme\Tests;
use Acme\Rep;
use PHPUnit\Framework\TestCase;
final class RepTest extends TestCase
{
    /** @id TEST-C-003 @verifies REQ-C-003 */
    public function test_c_003_inline(): void
    {
        $t = (new Rep())->t();
        $this->assertSame(1, $t);
    }

    /** @id TEST-C-004 @verifies REQ-C-004 */
    public function test_c_004_var(): void
    {
        $r = new Rep();
        $t = $r->t();
        $this->assertSame(1, $t);
    }
}
