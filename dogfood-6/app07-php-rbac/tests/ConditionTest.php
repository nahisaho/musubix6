<?php
declare(strict_types=1);

namespace Rbac\Tests;

use PHPUnit\Framework\TestCase;
use Rbac\Conditions\Condition;
use Rbac\Conditions\ParseException;

final class ConditionTest extends TestCase
{
    private array $ctx = [
        'subject' => ['dept' => 'hr', 'level' => 5, 'name' => 'ann'],
        'resource' => ['owner' => 'ann', 'tier' => 2],
        'env' => ['ip' => '10.0.0.1'],
    ];

    /** @id TEST-COND-001 @verifies REQ-COND-001 */
    public function test_cond_001_equality(): void
    {
        $this->assertTrue(Condition::evaluate('subject.dept == "hr"', $this->ctx));
        $this->assertFalse(Condition::evaluate('subject.dept == "it"', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.dept != "it"', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.name == resource.owner', $this->ctx));
    }

    /** @id TEST-COND-002 @verifies REQ-COND-002 */
    public function test_cond_002_ordering(): void
    {
        $this->assertTrue(Condition::evaluate('subject.level > 4', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.level >= 5', $this->ctx));
        $this->assertFalse(Condition::evaluate('subject.level < 5', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.level <= 5', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.level > resource.tier', $this->ctx));
    }

    /** @id TEST-COND-003 @verifies REQ-COND-003 */
    public function test_cond_003_logic_precedence(): void
    {
        $this->assertTrue(Condition::evaluate('true || false && false', $this->ctx));
        $this->assertFalse(Condition::evaluate('(true || false) && false', $this->ctx));
        $this->assertTrue(Condition::evaluate('!false && !(subject.level < 1)', $this->ctx));
    }

    /** @id TEST-COND-004 @verifies REQ-COND-004 */
    public function test_cond_004_in_list(): void
    {
        $this->assertTrue(Condition::evaluate('subject.dept in ["hr", "it"]', $this->ctx));
        $this->assertFalse(Condition::evaluate('subject.dept in ["fin"]', $this->ctx));
        $this->assertTrue(Condition::evaluate('subject.level in [1, 5]', $this->ctx));
    }

    /** @id TEST-COND-005 @verifies REQ-COND-005 */
    public function test_cond_005_missing_fails_closed(): void
    {
        $this->assertFalse(Condition::evaluate('subject.nope == "x"', $this->ctx));
        $this->assertFalse(Condition::evaluate('subject.nope != "x"', $this->ctx));
        $this->assertFalse(Condition::evaluate('nope.deep in ["x"]', $this->ctx));
    }

    /** @id TEST-COND-006 @verifies REQ-COND-006 */
    public function test_cond_006_syntax_error(): void
    {
        foreach (['subject.dept ==', '(true', 'a b', '== 1', 'x in 1', '"unterminated'] as $bad) {
            try {
                Condition::evaluate($bad, $this->ctx);
                $this->fail("expected ParseException for $bad");
            } catch (ParseException $e) {
                $this->assertTrue(true);
            }
        }
    }

    /** @id TEST-COND-007 @verifies REQ-COND-007 */
    public function test_cond_007_empty(): void
    {
        $this->assertTrue(Condition::evaluate('', $this->ctx));
        $this->assertTrue(Condition::evaluate('   ', $this->ctx));
    }

    /** @id TEST-COND-008 @verifies REQ-COND-008 */
    public function test_cond_008_ordering_types(): void
    {
        $this->assertFalse(Condition::evaluate('subject.dept > 3', $this->ctx));
        $this->assertFalse(Condition::evaluate('subject.level < "9"', $this->ctx));
    }

    /** @id TEST-COND-009 @verifies REQ-COND-009 */
    public function test_cond_009_negated_missing_fails_closed(): void
    {
        $this->assertFalse(Condition::evaluate('!(subject.nope == "x")', $this->ctx));
        $this->assertFalse(Condition::evaluate('!(subject.nope in ["x"])', $this->ctx));
        $this->assertFalse(Condition::evaluate('true && !(subject.nope < 3)', $this->ctx));
        $this->assertTrue(Condition::evaluate('!(subject.dept == "it")', $this->ctx));
    }
}
