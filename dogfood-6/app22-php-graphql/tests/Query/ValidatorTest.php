<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Query;

use GraphqlLite\Query\Parser;
use GraphqlLite\Query\Validator;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Tests\Fixtures\Sdl;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    /** @return string[] */
    private function errs(string $q): array
    {
        return Validator::validate(Schema::fromSdl(Sdl::APP), Parser::parse($q));
    }

    private function assertError(string $q, string $needle): void
    {
        $errs = $this->errs($q);
        $this->assertNotEmpty(array_filter($errs, fn($e) => str_contains($e, $needle)), "no '$needle' in: " . implode(' | ', $errs));
    }

    /** @id TEST-QRY-005 @verifies REQ-QRY-005 */
    public function test_qry_005_definitions(): void
    {
        $this->assertSame([], $this->errs('query A { me { id } } query B { me { id } }'));
        $this->assertError('query A { me { id } } query A { me { id } }', 'duplicate operation name "A"');
        $this->assertError('{ me { id } } query A { me { id } }', 'anonymous');
        $this->assertError('{ me { id } } { me { id } }', 'anonymous');
        $this->assertError('{ me { ...F } } fragment F on User { id } fragment F on User { name }', 'duplicate fragment "F"');
        $this->assertError('subscription S { me { id } }', 'subscription');
        $this->assertError('query Q($a: Int, $a: Int) { echo(i: $a) }', 'duplicate variable "a"');
    }

    /** @id TEST-QRY-006 @verifies REQ-QRY-006 */
    public function test_qry_006_field_selection(): void
    {
        $this->assertSame([], $this->errs('{ me { id name friends { name } __typename } search(text: "x") { __typename ... on User { age } } }'));
        $this->assertError('{ me { nope } }', 'cannot query field "nope" on type "User"');
        $this->assertError('{ me { name { x } } }', 'must not have a selection');
        $this->assertError('{ me }', 'must have a selection');
        $this->assertError('{ search(text: "x") { id } }', 'cannot query field "id" on type "SearchResult"');
        $this->assertError('{ node(id: 1) { id name } }', 'cannot query field "name" on type "Node"');
        $this->assertError('{ me { posts } }', 'must have a selection');
        $this->assertError('query { zzz }', 'cannot query field "zzz" on type "Query"');
        $this->assertError('mutation { me { id } }', 'cannot query field "me" on type "Mutation"');
        $this->assertSame([], $this->errs('mutation { bump createUser(name: "x") { id } }'));
    }

    /** @id TEST-QRY-007 @verifies REQ-QRY-007 */
    public function test_qry_007_fragment_graph(): void
    {
        $this->assertSame([], $this->errs('{ me { ...A } } fragment A on User { friends { ...B } } fragment B on User { id }'));
        $this->assertError('{ me { ...Nope } }', 'unknown fragment "Nope"');
        $this->assertError('{ me { id } } fragment Unused on User { id }', 'fragment "Unused" is never used');
        $this->assertError('{ me { ...A } } fragment A on User { ...A }', 'cycle');
        $this->assertError('{ me { ...A } } fragment A on User { friends { ...B } } fragment B on User { ...C } fragment C on User { ...A }', 'A -> B -> C -> A');
        $this->assertError('{ me { ...A } } fragment A on User { ...B } fragment B on User { ...A } fragment C on User { ...D } fragment D on User { ...C }', 'C -> D -> C');
    }

    /** @id TEST-QRY-008 @verifies REQ-QRY-008 */
    public function test_qry_008_variables(): void
    {
        $this->assertSame([], $this->errs('query Q($id: ID!, $n: Int = 1, $lim: Int) { user(id: $id) { friends(first: $n) { id } } users(limit: $lim) { id } }'));
        $this->assertError('{ user(id: $id) { id } }', 'variable "$id" is not defined');
        $this->assertError('query Q($x: Int) { me { id } }', 'variable "$x" is never used');
        $this->assertError('query Q($id: ID!) { me { ...F } } fragment F on User { friends(first: $zz) { id } }', 'variable "$zz" is not defined');
        $this->assertError('query Q($n: Int) { me { ...F } } fragment F on User { id }', 'variable "$n" is never used');
        $this->assertSame([], $this->errs('query Q($n: Int) { me { ...F } } fragment F on User { friends(first: $n) { id } }'));
        $this->assertError('query Q($id: ID) { user(id: $id) { id } }', 'variable "$id" of type "ID" used in position expecting "ID!"');
        $this->assertSame([], $this->errs('query Q($id: ID = "a") { user(id: $id) { id } }'));
        $this->assertSame([], $this->errs('query Q($x: Int = 1) { nn(x: $x) }'));
        $this->assertError('query Q($x: Int) { nn(x: $x) }', 'expecting "Int!"');
        $this->assertError('query Q($s: String) { users(limit: $s) { id } }', 'expecting "Int"');
        $this->assertError('query Q($t: [String]) { users(tags: $t) { id } }', 'expecting "[String!]"');
        $this->assertSame([], $this->errs('query Q($t: [String!]!, $l: Int!) { users(tags: $t, limit: $l) { id } echo(l: [$l]) }'));
        $this->assertError('query Q($t: Int) { echo(o: {a: $t}) }', 'expecting "Int!"');
        $this->assertError('query Q($u: Foo) { echo(i: 1) }', 'unknown type "Foo"');
        $this->assertError('query Q($u: User) { echo(i: 1) }', 'input type');
    }

    /** @id TEST-QRY-009 @verifies REQ-QRY-009 */
    public function test_qry_009_arguments_and_directives(): void
    {
        $this->assertSame([], $this->errs('{ user(id: 1) { friends(first: 2) { id } } me { id @include(if: true) } }'));
        $this->assertError('{ user(id: 1, bogus: 2) { id } }', 'unknown argument "bogus" on "Query.user"');
        $this->assertError('{ user(id: 1, id: 2) { id } }', 'duplicate argument "id"');
        $this->assertError('{ user { id } }', 'required argument "id" of "Query.user" is missing');
        $this->assertError('{ user(id: null) { id } }', 'argument "id"');
        $this->assertError('{ users(limit: "x") { id } }', 'argument "limit"');
        $this->assertError('{ echo(o: {b: [1]}) }', 'missing required field "a"');
        $this->assertError('{ echo(e: NOPE) }', 'argument "e"');
        $this->assertError('{ me { id @foo } }', 'unknown directive "@foo"');
        $this->assertError('{ me { id @skip } }', 'directive "@skip" requires argument "if"');
        $this->assertError('{ me { id @skip(if: 1) } }', 'argument "if"');
        $this->assertSame([], $this->errs('{ echo(l: 1, o: {a: 1, c: {x: 2}}) }'));
    }

    /** @id TEST-QRY-010 @verifies REQ-QRY-010 */
    public function test_qry_010_field_merging(): void
    {
        $this->assertSame([], $this->errs('{ me { id id name } me { id } }'));
        $this->assertError('{ me { a: id a: name } }', 'conflict');
        $this->assertError('{ user(id: 1) { id } user(id: 2) { id } }', 'conflict');
        $this->assertSame([], $this->errs('{ user(id: 1) { id } user(id: 1) { name } }'));
        $this->assertError('{ me { ...F name: id } } fragment F on User { name }', 'conflict');
        $this->assertError('{ me { x: name x: age } }', 'conflict');
        $this->assertError('{ search(text: "a") { ... on User { v: name } ... on Post { v: id } } }', 'conflict');
        $this->assertSame([], $this->errs('{ search(text: "a") { ... on User { v: name } ... on Post { v: title } } }'));
        $this->assertError('{ me { friends(first: 1) { x: id } friends(first: 1) { x: name } } }', 'conflict');
        $this->assertError('{ me { friends { id } friends(first: 3) { id } } }', 'conflict');
        $this->assertError('{ me { f: friends { id } f: posts { id } } }', 'conflict');
    }

    /** @id TEST-QRY-011 @verifies REQ-QRY-011 */
    public function test_qry_011_type_conditions(): void
    {
        $this->assertSame([], $this->errs('{ me { ... on Node { id } ... on User { name } } search(text: "x") { ... on Post { title } ... on Node { id } } node(id: 1) { ... on User { name } } }'));
        $this->assertError('{ me { ... on Post { title } } }', 'cannot be spread');
        $this->assertError('{ me { ...F } } fragment F on Post { title }', 'cannot be spread');
        $this->assertError('{ me { ... on Nope { id } } }', 'unknown type "Nope"');
        $this->assertError('{ me { ... on Role { id } } }', 'composite');
        $this->assertError('{ me { id } } fragment F on Int { x }', 'composite');
        $this->assertError('{ node(id: 1) { ... on Query { me { id } } } }', 'cannot be spread');
    }
}
