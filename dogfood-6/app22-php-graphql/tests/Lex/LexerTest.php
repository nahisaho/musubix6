<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Lex;

use GraphqlLite\Lex\Lexer;
use GraphqlLite\Lex\SyntaxError;
use PHPUnit\Framework\TestCase;

final class LexerTest extends TestCase
{
    private function vals(string $src): array
    {
        return array_map(fn($t) => $t->value, (new Lexer($src))->tokenize());
    }

    /** @id TEST-LEX-001 @verifies REQ-LEX-001 */
    public function test_lex_001_punctuators(): void
    {
        $this->assertSame(['!', '$', '&', '(', ')', '...', ':', '=', '@', '[', ']', '{', '|', '}', ''],
            $this->vals('! $ & ( ) ... : = @ [ ] { | }'));
        $this->assertSame(['...', '...', ''], $this->vals('......'));
    }

    /** @id TEST-LEX-002 @verifies REQ-LEX-002 */
    public function test_lex_002_names(): void
    {
        $toks = (new Lexer('foo _bar Baz9'))->tokenize();
        $this->assertSame(['Name', 'Name', 'Name', 'EOF'], array_map(fn($t) => $t->kind, $toks));
        $this->assertSame('_bar', $toks[1]->value);
    }

    /** @id TEST-LEX-003 @verifies REQ-LEX-003 */
    public function test_lex_003_numbers(): void
    {
        $toks = (new Lexer('0 -12 3.5 -1e10 2E-3 7.0e+2'))->tokenize();
        $this->assertSame(['Int', 'Int', 'Float', 'Float', 'Float', 'Float'], array_map(fn($t) => $t->kind, array_slice($toks, 0, 6)));
        $this->assertSame('-12', $toks[1]->value);
    }

    /** @id TEST-LEX-004 @verifies REQ-LEX-004 */
    public function test_lex_004_bad_numbers(): void
    {
        foreach (['01', '1.', '1e', '1.e3', '-', '1.5x', '1_0'] as $src) {
            try {
                (new Lexer($src))->tokenize();
                $this->fail("expected SyntaxError for $src");
            } catch (SyntaxError $e) {
                $this->assertSame(1, $e->getLine());
            }
        }
    }

    /** @id TEST-LEX-005 @verifies REQ-LEX-005 */
    public function test_lex_005_string_escapes(): void
    {
        $t = (new Lexer('"a\\nb\\t\\"\\\\\\/ \\u00e9\\u3042"'))->tokenize()[0];
        $this->assertSame('String', $t->kind);
        $this->assertSame("a\nb\t\"\\/ é\u{3042}", $t->value);
    }

    /** @id TEST-LEX-006 @verifies REQ-LEX-006 */
    public function test_lex_006_block_string(): void
    {
        $src = "\"\"\"\n    Hello\n      World\n\n    \\\"\"\" end\n    \"\"\"";
        $t = (new Lexer($src))->tokenize()[0];
        $this->assertSame('BlockString', $t->kind);
        $this->assertSame("Hello\n  World\n\n\"\"\" end", $t->value);
        $t2 = (new Lexer("\"\"\"first\n   second\n  third\"\"\""))->tokenize()[0];
        $this->assertSame("first\n second\nthird", $t2->value);
    }

    /** @id TEST-LEX-007 @verifies REQ-LEX-007 */
    public function test_lex_007_ignored(): void
    {
        $this->assertSame(['a', 'b', 'c', ''], $this->vals("a,, b # comment ! \r\n\t c # end"));
        $this->assertSame(['a', 'b', ''], $this->vals("a\rb"));
    }

    /** @id TEST-LEX-008 @verifies REQ-LEX-008 */
    public function test_lex_008_positions(): void
    {
        $toks = (new Lexer("ab\n  cd\r\nef \"\"\"x\ny\"\"\" "))->tokenize();
        $this->assertSame([1, 1], [$toks[0]->line, $toks[0]->col]);
        $this->assertSame([2, 3], [$toks[1]->line, $toks[1]->col]);
        $this->assertSame([3, 1], [$toks[2]->line, $toks[2]->col]);
        $this->assertSame('EOF', end($toks)->kind);
        $this->assertCount(1, array_filter($toks, fn($t) => $t->kind === 'EOF'));
    }

    /** @id TEST-LEX-009 @verifies REQ-LEX-009 */
    public function test_lex_009_errors(): void
    {
        $cases = [['"abc', 1, 1], ["a\n  \"x\\qy\"", 2, 5], ["a\n ?", 2, 2], ["\"a\nb\"", 1, 1], ['"\\u12"', 1, 2], ['..', 1, 1], ["\"\"\"abc", 1, 1]];
        foreach ($cases as [$src, $line, $col]) {
            try {
                (new Lexer($src))->tokenize();
                $this->fail("expected SyntaxError for $src");
            } catch (SyntaxError $e) {
                $this->assertSame([$line, $col], [$e->getLine(), $e->col], $src);
            }
        }
    }

    /** @id TEST-LEX-010 @verifies REQ-LEX-010 */
    public function test_lex_010_surrogate_pairs(): void
    {
        $t = (new Lexer('"\\ud83d\\ude00x"'))->tokenize()[0];
        $this->assertSame("\u{1F600}x", $t->value);
        foreach (['"\\ud83d"', '"\\ude00"', '"\\ud83d\\u0041"'] as $bad) {
            try {
                (new Lexer($bad))->tokenize();
                $this->fail('expected SyntaxError for ' . $bad);
            } catch (SyntaxError $e) {
                $this->assertSame(1, $e->getLine());
            }
        }
    }
}
