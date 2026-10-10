<?php
declare(strict_types=1);
namespace Acme\Tests;
use Acme\Color;
use Acme\Cfg;
use PHPUnit\Framework\TestCase;
final class CTest extends TestCase
{
    /** @id TEST-C-001 @verifies REQ-C-001 */
    public function test_c_001_enum(): void
    {
        $this->assertSame('r', Color::RED->value);
    }

    /** @id TEST-C-002 @verifies REQ-C-002 */
    public function test_c_002_const(): void
    {
        $this->assertSame(5, Cfg::LIMIT);
    }
}
