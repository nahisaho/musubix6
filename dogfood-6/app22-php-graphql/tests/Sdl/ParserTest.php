<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Sdl;

use GraphqlLite\Lex\SyntaxError;
use GraphqlLite\Sdl\Parser;
use PHPUnit\Framework\TestCase;

final class ParserTest extends TestCase
{
    private function expectError(string $src, string $needle): void
    {
        try {
            Parser::parse($src);
            $this->fail("expected SyntaxError containing '$needle'");
        } catch (SyntaxError $e) {
            $this->assertStringContainsString($needle, $e->getMessage());
            $this->assertGreaterThan(0, $e->getLine());
        }
    }

    /** @id TEST-SDL-001 @verifies REQ-SDL-001 */
    public function test_sdl_001_object_type(): void
    {
        $doc = Parser::parse('type User implements Node & Named { id: ID! name(upper: Boolean = false, n: Int): String }
            type Legacy implements A, B { x: Int }');
        $u = $doc->definitions['User'];
        $this->assertSame('object', $u->kind);
        $this->assertSame(['Node', 'Named'], $u->interfaces);
        $this->assertSame(['id', 'name'], array_keys($u->fields));
        $this->assertSame(['upper', 'n'], array_keys($u->fields['name']->args));
        $this->assertSame('String', (string) $u->fields['name']->type);
        $this->assertSame(['A', 'B'], $doc->definitions['Legacy']->interfaces);
    }

    /** @id TEST-SDL-002 @verifies REQ-SDL-002 */
    public function test_sdl_002_type_refs(): void
    {
        $doc = Parser::parse('type T { a: [[Int!]!]! b: [String] c: Int }');
        $f = $doc->definitions['T']->fields;
        $this->assertSame('[[Int!]!]!', (string) $f['a']->type);
        $this->assertSame('nonnull', $f['a']->type->kind);
        $this->assertSame('list', $f['a']->type->of->kind);
        $this->assertSame('Int', $f['a']->type->namedType());
        $this->assertSame('[String]', (string) $f['b']->type);
        $this->expectError('type T { a: Int!! }', 'Int');
    }

    /** @id TEST-SDL-003 @verifies REQ-SDL-003 */
    public function test_sdl_003_kinds(): void
    {
        $d = Parser::parse('enum E { A B } union U = | X | Y scalar Date input I { a: Int = 1 } interface N { id: ID }')->definitions;
        $this->assertSame(['E' => 'enum', 'U' => 'union', 'Date' => 'scalar', 'I' => 'input', 'N' => 'interface'],
            array_map(fn($x) => $x->kind, $d));
        $this->assertSame(['A', 'B'], array_keys($d['E']->enumValues));
        $this->assertSame(['X', 'Y'], $d['U']->members);
        $this->assertSame(['a'], array_keys($d['I']->fields));
    }

    /** @id TEST-SDL-004 @verifies REQ-SDL-004 */
    public function test_sdl_004_values(): void
    {
        $d = Parser::parse('input I { a: Int = 1 b: Float = -2.5e1 c: String = "s" d: Boolean = true e: E = RED f: Int = null g: [Int] = [1, [2]] h: O = {x: 1, y: {z: [A]}} }')
            ->definitions['I']->fields;
        $this->assertSame(['Int', '1'], [$d['a']->default['kind'], $d['a']->default['value']]);
        $this->assertSame('Float', $d['b']->default['kind']);
        $this->assertSame('String', $d['c']->default['kind']);
        $this->assertSame(['Boolean', true], [$d['d']->default['kind'], $d['d']->default['value']]);
        $this->assertSame(['Enum', 'RED'], [$d['e']->default['kind'], $d['e']->default['value']]);
        $this->assertSame('Null', $d['f']->default['kind']);
        $this->assertSame('List', $d['g']->default['kind']);
        $this->assertSame('List', $d['g']->default['value'][1]['kind']);
        $this->assertSame(['x', 'y'], array_keys($d['h']->default['value']));
        $this->assertSame('Enum', $d['h']->default['value']['y']['value']['z']['value'][0]['kind']);
    }

    /** @id TEST-SDL-005 @verifies REQ-SDL-005 */
    public function test_sdl_005_schema_block(): void
    {
        $doc = Parser::parse('schema { query: Q mutation: M } type Q { a: Int }');
        $this->assertSame(['query' => 'Q', 'mutation' => 'M'], $doc->roots);
        $this->assertSame([], Parser::parse('type Query { a: Int }')->roots);
        $this->expectError('schema { query: Q query: R }', 'duplicate');
        $this->expectError('schema { foo: Q }', 'operation');
    }

    /** @id TEST-SDL-006 @verifies REQ-SDL-006 */
    public function test_sdl_006_directives(): void
    {
        $d = Parser::parse('type T @key(fields: "id") @x { a(b: Int @dep): Int @deprecated(reason: "no") } enum E { A @old }')->definitions;
        $this->assertSame(['key', 'x'], array_map(fn($x) => $x->name, $d['T']->directives));
        $this->assertSame('id', $d['T']->directives[0]->args['fields']['value']);
        $this->assertSame('deprecated', $d['T']->fields['a']->directives[0]->name);
        $this->assertSame('dep', $d['T']->fields['a']->args['b']->directives[0]->name);
        $this->assertSame('old', $d['E']->enumValues['A']->directives[0]->name);
    }

    /** @id TEST-SDL-007 @verifies REQ-SDL-007 */
    public function test_sdl_007_syntax_errors(): void
    {
        try {
            Parser::parse("type T {\n  a Int }");
            $this->fail('expected');
        } catch (SyntaxError $e) {
            $this->assertSame(2, $e->getLine());
            $this->assertSame(5, $e->col);
            $this->assertStringContainsString('Expected ":"', $e->getMessage());
            $this->assertStringContainsString('Name "Int"', $e->getMessage());
        }
        $this->expectError('type T { }', 'Expected');
        $this->expectError('type { a: Int }', 'Expected');
        $this->expectError('foo T {}', 'foo');
        $this->expectError('type T { a: [Int }', '"]"');
    }

    /** @id TEST-SDL-008 @verifies REQ-SDL-008 */
    public function test_sdl_008_duplicates(): void
    {
        $this->expectError('type A { a: Int } type A { b: Int }', 'duplicate');
        $this->expectError('type A { a: Int a: Int }', 'duplicate');
        $this->expectError('enum E { X X }', 'duplicate');
        $this->expectError('union U = A | B | A', 'duplicate');
        $this->expectError('type A { f(x: Int, x: Int): Int }', 'duplicate');
        $this->expectError('input I { a: O = {k: 1, k: 2} }', 'duplicate');
    }

    /** @id TEST-SDL-009 @verifies REQ-SDL-009 */
    public function test_sdl_009_descriptions(): void
    {
        $d = Parser::parse('"A user" type U { "the id" id: ID! """
          block
        """ name(
          "arg doc" x: Int): String } "e doc" enum E { "v doc" A }')->definitions;
        $this->assertSame('A user', $d['U']->description);
        $this->assertSame('the id', $d['U']->fields['id']->description);
        $this->assertSame('block', $d['U']->fields['name']->description);
        $this->assertSame('arg doc', $d['U']->fields['name']->args['x']->description);
        $this->assertSame('e doc', $d['E']->description);
        $this->assertSame('v doc', $d['E']->enumValues['A']->description);
    }
}
