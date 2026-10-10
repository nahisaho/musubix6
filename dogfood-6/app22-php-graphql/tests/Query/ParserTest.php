<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Query;

use GraphqlLite\Query\Ast\Field;
use GraphqlLite\Query\Ast\FragmentSpread;
use GraphqlLite\Query\Ast\InlineFragment;
use GraphqlLite\Query\Parser;
use PHPUnit\Framework\TestCase;

final class ParserTest extends TestCase
{
    /** @id TEST-QRY-001 @verifies REQ-QRY-001 */
    public function test_qry_001_documents(): void
    {
        $d = Parser::parse('{ a } query Q { b } mutation M($x: Int) { c } fragment F on T { d }');
        $this->assertCount(3, $d->operations);
        $this->assertSame(['query', null], [$d->operations[0]->type, $d->operations[0]->name]);
        $this->assertSame(['query', 'Q'], [$d->operations[1]->type, $d->operations[1]->name]);
        $this->assertSame(['mutation', 'M'], [$d->operations[2]->type, $d->operations[2]->name]);
        $this->assertSame(['F'], array_keys($d->fragments));
        $this->assertSame('T', $d->fragments['F']->typeCondition);
        $this->assertSame('a', $d->operations[0]->selections[0]->name);
        $this->assertSame('query', Parser::parse('query { a }')->operations[0]->type);
    }

    /** @id TEST-QRY-002 @verifies REQ-QRY-002 */
    public function test_qry_002_fields_and_args(): void
    {
        $d = Parser::parse('{ x: user(id: 4, name: "n", t: [1, $v], o: {k: $w, e: ENUM}) { id alias: name } }');
        /** @var Field $f */
        $f = $d->operations[0]->selections[0];
        $this->assertSame(['x', 'user'], [$f->alias, $f->name]);
        $this->assertSame('x', $f->responseKey());
        $this->assertSame(['id', 'name', 't', 'o'], array_keys($f->args));
        $this->assertSame(['Variable', 'v'], [$f->args['t']['value'][1]['kind'], $f->args['t']['value'][1]['value']]);
        $this->assertSame('Variable', $f->args['o']['value']['k']['kind']);
        $this->assertSame('alias', $f->selections[1]->responseKey());
        $this->assertSame('id', $f->selections[0]->responseKey());
        $this->assertNull($f->selections[0]->selections);
        $this->assertSame(['id'], Parser::parse('{ a(id: 1, id: 2) }')->operations[0]->selections[0]->duplicateArgs);
    }

    /** @id TEST-QRY-003 @verifies REQ-QRY-003 */
    public function test_qry_003_variable_definitions(): void
    {
        $op = Parser::parse('query Q($a: Int = 3, $b: [ID!]!, $c: In = {x: 1} @d) { a }')->operations[0];
        $this->assertSame(['a', 'b', 'c'], array_keys($op->variables));
        $this->assertSame('Int', (string) $op->variables['a']->type);
        $this->assertSame('3', $op->variables['a']->default['value']);
        $this->assertSame('[ID!]!', (string) $op->variables['b']->type);
        $this->assertNull($op->variables['b']->default);
        $this->assertSame('Object', $op->variables['c']->default['kind']);
        $this->assertSame(['d'], array_map(fn($x) => $x->name, $op->variables['c']->directives));
    }

    /** @id TEST-QRY-004 @verifies REQ-QRY-004 */
    public function test_qry_004_fragments(): void
    {
        $sel = Parser::parse('{ ...F @skip(if: true) ... on T { a } ... @include(if: $x) { b } ...G }')->operations[0]->selections;
        $this->assertInstanceOf(FragmentSpread::class, $sel[0]);
        $this->assertSame(['F', 'skip'], [$sel[0]->name, $sel[0]->directives[0]->name]);
        $this->assertInstanceOf(InlineFragment::class, $sel[1]);
        $this->assertSame('T', $sel[1]->typeCondition);
        $this->assertInstanceOf(InlineFragment::class, $sel[2]);
        $this->assertNull($sel[2]->typeCondition);
        $this->assertSame('include', $sel[2]->directives[0]->name);
        $this->assertSame('G', $sel[3]->name);
        $this->expectException(\GraphqlLite\Lex\SyntaxError::class);
        Parser::parse('{ ...on }');
    }
}
