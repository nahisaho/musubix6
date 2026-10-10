<?php
declare(strict_types=1);
namespace Saga\Tests;
use PHPUnit\Framework\TestCase;
final class Sk3Test extends TestCase
{
    /** @id TEST-SK-003 @verifies REQ-SK-003 */
    public function test_sk_003_conditional(): void
    {
        if (getenv('SK_SKIP')) {
            $this->markTestSkipped('env');
        }
        $this->assertSame('b', 'a');
    }
}
