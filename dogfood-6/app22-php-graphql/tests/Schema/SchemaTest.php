<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Schema;

use GraphqlLite\Schema\Schema;
use GraphqlLite\Sdl\Definition;
use GraphqlLite\Sdl\Document;
use GraphqlLite\Sdl\Parser;
use GraphqlLite\Sdl\TypeRef;
use PHPUnit\Framework\TestCase;

final class SchemaTest extends TestCase
{
    private const Q = 'type Query { a: Int } ';

    /** @return string[] */
    private function errs(string $sdl): array
    {
        return Schema::fromSdl($sdl)->validate();
    }

    private function assertError(string $sdl, string $needle): void
    {
        $errs = $this->errs($sdl);
        $this->assertNotEmpty(array_filter($errs, fn($e) => str_contains($e, $needle)), "no '$needle' in: " . implode(' | ', $errs));
    }

    /** @id TEST-SCH-001 @verifies REQ-SCH-001 */
    public function test_sch_001_builtins(): void
    {
        $s = Schema::fromSdl(self::Q . 'type User { id: ID }');
        foreach (['Int', 'Float', 'String', 'Boolean', 'ID'] as $n) {
            $this->assertSame('scalar', $s->type($n)?->kind, $n);
        }
        $this->assertSame('object', $s->type('User')?->kind);
        $this->assertNull($s->type('Nope'));
        $this->assertSame([], $s->validate());
        $this->assertError(self::Q . 'scalar Int', 'built-in');
    }

    /** @id TEST-SCH-002 @verifies REQ-SCH-002 */
    public function test_sch_002_roots(): void
    {
        $s = Schema::fromSdl('type Query { a: Int } type Mutation { m: Int } type Subscription { s: Int }');
        $this->assertSame(['query' => 'Query', 'mutation' => 'Mutation', 'subscription' => 'Subscription'], $s->roots());
        $s = Schema::fromSdl('schema { query: Root } type Root { a: Int } type Query { z: Int }');
        $this->assertSame(['query' => 'Root'], $s->roots());
        $this->assertSame([], $s->validate());
    }

    /** @id TEST-SCH-003 @verifies REQ-SCH-003 */
    public function test_sch_003_query_root_required(): void
    {
        $this->assertError('type Foo { a: Int }', 'query root');
        $this->assertError('schema { query: Missing } type Foo { a: Int }', 'Missing');
        $this->assertError('schema { query: E } enum E { A }', 'object');
        $this->assertError('schema { query: Q mutation: I } type Q { a: Int } input I { a: Int }', 'mutation');
    }

    /** @id TEST-SCH-004 @verifies REQ-SCH-004 */
    public function test_sch_004_unknown_types(): void
    {
        $this->assertError(self::Q . 'type T { f: Nope }', 'unknown type "Nope"');
        $this->assertError(self::Q . 'type T { f(x: [Nope!]): Int }', 'unknown type "Nope"');
        $this->assertError(self::Q . 'union U = A', 'unknown type "A"');
        $this->assertError(self::Q . 'type T implements Missing { f: Int }', 'unknown type "Missing"');
        $this->assertError(self::Q . 'input I { f: Nope }', 'unknown type "Nope"');
        $this->assertError(self::Q . 'type T implements Query { f: Int }', 'not an interface');
        $errs = $this->errs(self::Q . 'type T { f: X g: Y }');
        $this->assertCount(2, $errs);
    }

    /** @id TEST-SCH-005 @verifies REQ-SCH-005 */
    public function test_sch_005_interface_implementation(): void
    {
        $base = self::Q . 'interface N { id: ID! tags(n: Int): [String] self: N }';
        $this->assertSame([], $this->errs($base . 'type A implements N { id: ID! tags(n: Int, extra: Int): [String!] self: A }'));
        $this->assertError($base . 'type A implements N { tags(n: Int): [String] self: N }', 'must define field "id"');
        $this->assertError($base . 'type A implements N { id: ID tags(n: Int): [String] self: N }', 'expects type "ID!"');
        $this->assertError($base . 'type A implements N { id: ID! tags: [String] self: N }', 'argument "n"');
        $this->assertError($base . 'type A implements N { id: ID! tags(n: String): [String] self: N }', 'argument "n"');
        $this->assertError($base . 'type A implements N { id: ID! tags(n: Int, e: Int!): [String] self: N }', 'extra argument "e"');
        $this->assertError($base . 'type B { x: Int } type A implements N { id: ID! tags(n: Int): [String] self: B }', 'expects type "N"');
        $this->assertError($base . 'type A implements N { id: ID! tags(n: Int): [String]! self: N } type C implements N { id: ID! tags(n: Int): String self: N }', 'expects type "[String]"');
    }

    /** @id TEST-SCH-006 @verifies REQ-SCH-006 */
    public function test_sch_006_interface_cycles(): void
    {
        $this->assertError(self::Q . 'interface A implements B { x: Int } interface B implements A { x: Int }', 'cycle');
        $this->assertError(self::Q . 'interface A implements A { x: Int }', 'cycle');
        $this->assertError(self::Q . 'interface A implements B { x: Int } interface B implements C { x: Int } interface C implements A { x: Int }', 'A -> B -> C -> A');
        $this->assertSame([], $this->errs(self::Q . 'interface A { x: Int } interface B implements A { x: Int } interface C implements B & A { x: Int }'));
    }

    /** @id TEST-SCH-007 @verifies REQ-SCH-007 */
    public function test_sch_007_unions(): void
    {
        $this->assertError(self::Q . 'interface I { a: Int } union U = I', 'object type');
        $this->assertError(self::Q . 'enum E { A } union U = E', 'object type');
        $this->assertSame([], $this->errs(self::Q . 'type X { a: Int } type Y { a: Int } union U = X | Y'));
        $doc = new Document(['Query' => new Definition('object', 'Query'), 'U' => new Definition('union', 'U')], []);
        $this->assertNotEmpty(array_filter(Schema::fromDocument($doc)->validate(), fn($e) => str_contains($e, 'at least one')));
    }

    /** @id TEST-SCH-008 @verifies REQ-SCH-008 */
    public function test_sch_008_input_output_types(): void
    {
        $this->assertError(self::Q . 'type T { a: Int } type U { f(x: T): Int }', 'input type');
        $this->assertError(self::Q . 'input I { t: T } type T { a: Int }', 'input type');
        $this->assertError(self::Q . 'input I { a: Int } type U { f: I }', 'output type');
        $this->assertError(self::Q . 'type T { a: Int } interface N { f(x: [T!]!): Int }', 'input type');
        $this->assertSame([], $this->errs(self::Q . 'enum E { A } input I { e: E } type U { f(i: I, e: E): E }'));
    }

    /** @id TEST-SCH-009 @verifies REQ-SCH-009 */
    public function test_sch_009_input_cycles(): void
    {
        $this->assertError(self::Q . 'input A { b: B! } input B { a: A! }', 'a series of non-null');
        $this->assertError(self::Q . 'input A { a: A! }', 'a series of non-null');
        $this->assertError(self::Q . 'input A { b: B! } input B { c: C! } input C { a: A! }', 'b.c.a');
        $this->assertSame([], $this->errs(self::Q . 'input A { b: B! } input B { a: A }'));
        $this->assertSame([], $this->errs(self::Q . 'input A { b: B! } input B { a: [A!]! }'));
    }

    /** @id TEST-SCH-010 @verifies REQ-SCH-010 */
    public function test_sch_010_possible_types(): void
    {
        $s = Schema::fromSdl(self::Q . 'interface N { id: ID } interface M implements N { id: ID } type A implements N { id: ID } type B implements M & N { id: ID } type C { id: ID } union U = A | C');
        $this->assertEqualsCanonicalizing(['A', 'B'], $s->possibleTypes('N'));
        $this->assertSame(['B'], $s->possibleTypes('M'));
        $this->assertSame(['A', 'C'], $s->possibleTypes('U'));
        $this->assertSame(['A'], $s->possibleTypes('A'));
        $this->assertSame([], $s->possibleTypes('Int'));
        foreach (['N', 'M', 'U'] as $abs) {
            foreach (['A', 'B', 'C'] as $obj) {
                $this->assertSame(in_array($obj, $s->possibleTypes($abs), true), $s->isSubType($abs, $obj), "$abs/$obj");
            }
        }
        $this->assertTrue($s->isTypeSubtype(TypeRef::nonNull(TypeRef::named('A')), TypeRef::named('N')));
        $this->assertFalse($s->isTypeSubtype(TypeRef::named('A'), TypeRef::nonNull(TypeRef::named('A'))));
        $this->assertTrue($s->isTypeSubtype(TypeRef::list(TypeRef::named('B')), TypeRef::list(TypeRef::named('N'))));
        $this->assertFalse($s->isTypeSubtype(TypeRef::list(TypeRef::named('C')), TypeRef::named('C')));
    }

    /** @id TEST-SCH-011 @verifies REQ-SCH-011 */
    public function test_sch_011_enums(): void
    {
        $this->assertError(self::Q . 'enum E { A true }', 'true');
        $this->assertError(self::Q . 'enum E { null }', 'null');
        $this->assertError(self::Q . 'enum E { false }', 'false');
        $doc = new Document(['Query' => new Definition('object', 'Query'), 'E' => new Definition('enum', 'E')], []);
        $this->assertNotEmpty(array_filter(Schema::fromDocument($doc)->validate(), fn($e) => str_contains($e, 'at least one')));
        $this->assertSame([], $this->errs(self::Q . 'enum E { A B }'));
    }

    /** @id TEST-SCH-012 @verifies REQ-SCH-012 */
    public function test_sch_012_defaults(): void
    {
        $ok = self::Q . 'enum E { A B } input O { x: Int! y: String = "d" } input I { a: Int = 1 b: Float = 2 c: ID = 3 d: [Int!] = [1, 2] e: E = A f: O = {x: 1} g: [Int] = 5 h: Int = null i: Boolean = false } type T { f(x: [E] = [A, null]): Int }';
        $this->assertSame([], $this->errs($ok));
        $this->assertError(self::Q . 'input I { a: Int = "s" }', 'default');
        $this->assertError(self::Q . 'input I { a: Int! = null }', 'default');
        $this->assertError(self::Q . 'enum E { A } input I { a: E = B }', 'default');
        $this->assertError(self::Q . 'input I { a: Int = 3000000000 }', 'default');
        $this->assertError(self::Q . 'input I { a: [Int!] = [1, null] }', 'default');
        $this->assertError(self::Q . 'input O { x: Int! } input I { a: O = {} }', 'default');
        $this->assertError(self::Q . 'input O { x: Int } input I { a: O = {y: 1} }', 'default');
        $this->assertError(self::Q . 'input I { a: Boolean = 1 }', 'default');
        $this->assertError(self::Q . 'type T { f(x: Int = 1.5): Int }', 'default');
    }
}
