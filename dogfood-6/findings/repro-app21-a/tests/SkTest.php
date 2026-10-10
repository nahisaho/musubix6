<?php
declare(strict_types=1);
namespace Saga\Tests;
use PHPUnit\Framework\TestCase;
final class SkTest extends TestCase
{
    /** @id TEST-SK-001 @verifies REQ-SK-001 */
    public function test_sk_001_skipped(): void
    {
        $this->markTestSkipped('later');
    }

    /** @id TEST-SK-002 @verifies REQ-SK-002 */
    public function test_sk_00x_typo(): void
    {
        $this->assertSame(2, 1 + 1);
    }
}
