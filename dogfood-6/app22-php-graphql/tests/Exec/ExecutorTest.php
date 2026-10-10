<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Exec;

use GraphqlLite\Exec\Executor;
use GraphqlLite\Exec\ResolveInfo;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Tests\Fixtures\Sdl;
use PHPUnit\Framework\TestCase;

final class ExecutorTest extends TestCase
{
    private const ECHO = ['Query.echo' => [self::class, 'echoArgs']];

    public static function echoArgs($src, array $args): string
    {
        return json_encode($args, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
    }

    private function go(string $q, array $resolvers = [], array $variables = [], array $extra = []): array
    {
        return Executor::execute(Schema::fromSdl(Sdl::APP), $q, ...(['resolvers' => $resolvers + self::ECHO, 'variables' => $variables] + $extra));
    }

    private function errorMessages(array $r): array
    {
        return array_map(fn($e) => $e['message'], $r['errors'] ?? []);
    }

    /** @id TEST-EXE-001 @verifies REQ-EXE-001 */
    public function test_exe_001_resolver_contract(): void
    {
        $seen = [];
        $r = $this->go('{ first: user(id: "7") { id name } me { name } }', [
            'Query.user' => function ($src, array $args, $ctx, ResolveInfo $info) use (&$seen) {
                $seen = [$src, $args, $ctx, $info->fieldName, $info->path, $info->parentType];
                return ['id' => '7', 'name' => 'Ann'];
            },
            'Query.me' => fn() => ['name' => 'Me'],
        ], [], ['rootValue' => 'ROOT', 'context' => 'CTX']);
        $this->assertSame(['ROOT', ['id' => '7'], 'CTX', 'user', ['first'], 'Query'], $seen);
        $this->assertSame(['data' => ['first' => ['id' => '7', 'name' => 'Ann'], 'me' => ['name' => 'Me']]], $r);
        $this->assertSame(['first', 'me'], array_keys($r['data']));
    }

    /** @id TEST-EXE-002 @verifies REQ-EXE-002 */
    public function test_exe_002_default_resolver(): void
    {
        $obj = new class {
            public string $name = 'prop';
            public function getAge(): int
            {
                return 33;
            }
            public function id(): string
            {
                return 'm';
            }
        };
        $r = $this->go('{ me { id name age active score } }', ['Query.me' => fn() => $obj]);
        $this->assertSame(['id' => 'm', 'name' => 'prop', 'age' => 33, 'active' => null, 'score' => null], $r['data']['me']);
        $r = $this->go('{ me { name age } }', [], [], ['rootValue' => ['me' => ['name' => 'arr', 'age' => fn() => 5]]]);
        $this->assertSame(['me' => ['name' => 'arr', 'age' => 5]], $r['data']);
        $this->assertSame(['me' => null], $this->go('{ me { name } }')['data']);
    }

    /** @id TEST-EXE-003 @verifies REQ-EXE-003 */
    public function test_exe_003_variable_coercion(): void
    {
        $q = 'query Q($i: Int, $f: Float, $s: String, $b: Boolean, $l: [Int], $o: In, $e: Role, $d: Int = 9) { echo(i: $i, f: $f, s: $s, b: $b, l: $l, o: $o, e: $e) users(limit: $d) { id } }';
        $r = $this->go($q, ['Query.users' => fn($s, $a) => [['id' => (string) $a['limit']]]], ['i' => 5, 'f' => 3, 's' => 'x', 'b' => false, 'l' => 4, 'o' => ['a' => 1, 'b' => [2]], 'e' => 'ADMIN']);
        $this->assertSame('{"i":5,"f":3.0,"s":"x","b":false,"l":[4],"o":{"a":1,"b":[2]},"e":"ADMIN"}', $r['data']['echo']);
        $this->assertSame([['id' => '9']], $r['data']['users']);
        $r = $this->go('query($x: ID!) { user(id: $x) { id } }', ['Query.user' => fn($s, $a) => ['id' => $a['id']]], ['x' => 12]);
        $this->assertSame('12', $r['data']['user']['id']);
        $r = $this->go('query($i: Int) { echo(i: $i) }', [], ['i' => null]);
        $this->assertSame('{"i":null}', $r['data']['echo']);
        $r = $this->go('query($i: Int) { echo(i: $i) }');
        $this->assertSame('[]', $r['data']['echo']);
    }

    /** @id TEST-EXE-004 @verifies REQ-EXE-004 */
    public function test_exe_004_variable_errors(): void
    {
        $bad = [
            ['query($x: Int!) { nn(x: $x) }', [], '"$x" of required type "Int!" was not provided'],
            ['query($x: Int!) { nn(x: $x) }', ['x' => null], '"$x"'],
            ['query($x: Int) { nn: echo(i: $x) }', ['x' => 'abc'], '"$x" got invalid value'],
            ['query($x: Int) { nn: echo(i: $x) }', ['x' => 1.5], 'Int'],
            ['query($x: Int) { nn: echo(i: $x) }', ['x' => 3000000000], 'Int'],
            ['query($x: Role) { echo(e: $x) }', ['x' => 'NOPE'], 'Role'],
            ['query($x: In) { echo(o: $x) }', ['x' => ['b' => [1]]], 'a'],
            ['query($x: In) { echo(o: $x) }', ['x' => ['a' => 1, 'zzz' => 1]], 'zzz'],
            ['query($x: [Int!]) { echo(l: $x) }', ['x' => [1, null]], '[1]'],
            ['query($x: Boolean) { echo(b: $x) }', ['x' => 'true'], 'Boolean'],
            ['query($x: String) { echo(s: $x) }', ['x' => 5], 'String'],
        ];
        foreach ($bad as [$q, $vars, $needle]) {
            $r = $this->go($q, [], $vars);
            $this->assertArrayNotHasKey('data', $r, $q);
            $this->assertNotEmpty($r['errors'] ?? [], $q);
            $this->assertStringContainsString($needle, implode(' | ', $this->errorMessages($r)), $q);
        }
        $r = $this->go('query($a: Int!, $b: Int!) { nn(x: $a) other: nn(x: $b) }', [], []);
        $this->assertCount(2, $r['errors']);
    }

    /** @id TEST-EXE-005 @verifies REQ-EXE-005 */
    public function test_exe_005_skip_include(): void
    {
        $res = ['Query.me' => fn() => ['id' => '1', 'name' => 'n', 'age' => 3]];
        $r = $this->go('{ me { id name @skip(if: true) age @include(if: false) } }', $res);
        $this->assertSame(['id' => '1'], $r['data']['me']);
        $r = $this->go('query($t: Boolean!, $f: Boolean!) { me { id name @skip(if: $f) age @include(if: $t) } }', $res, ['t' => true, 'f' => false]);
        $this->assertSame(['id' => '1', 'name' => 'n', 'age' => 3], $r['data']['me']);
        $r = $this->go('{ me { id name @skip(if: true) @include(if: true) age @skip(if: false) @include(if: true) } }', $res);
        $this->assertSame(['id' => '1', 'age' => 3], $r['data']['me']);
        $r = $this->go('query($t: Boolean!) { me { id ...F @skip(if: $t) ... on User @include(if: $t) { age } } } fragment F on User { name }', $res, ['t' => true]);
        $this->assertSame(['id' => '1', 'age' => 3], $r['data']['me']);
    }

    /** @id TEST-EXE-006 @verifies REQ-EXE-006 */
    public function test_exe_006_fragments(): void
    {
        $user = ['__typename' => 'User', 'id' => '1', 'name' => 'u', 'friends' => [['id' => '2', 'name' => 'f']]];
        $res = ['Query.me' => fn() => $user, 'Query.search' => fn() => [$user, ['__typename' => 'Post', 'id' => '9', 'title' => 'T']]];
        $r = $this->go('{ me { friends { id } } me { friends { name } id } }', $res);
        $this->assertSame(['me' => ['friends' => [['id' => '2', 'name' => 'f']], 'id' => '1']], $r['data']);
        $r = $this->go('{ search(text: "x") { ...U ... on Post { title } ... on Node { id } } } fragment U on User { name }', $res);
        $this->assertSame([['name' => 'u', 'id' => '1'], ['title' => 'T', 'id' => '9']], $r['data']['search']);
        $r = $this->go('{ me { ...A ...A } } fragment A on User { id ...B } fragment B on User { name }', $res);
        $this->assertSame(['id' => '1', 'name' => 'u'], $r['data']['me']);
        $r = $this->go('{ me { ... { id } ... on Node { id } } }', $res);
        $this->assertSame(['id' => '1'], $r['data']['me']);
    }

    /** @id TEST-EXE-007 @verifies REQ-EXE-007 */
    public function test_exe_007_nullable_error(): void
    {
        $res = ['Query.me' => fn() => ['id' => '1', 'name' => 'x', 'age' => 4], 'User.name' => function () {
            throw new \RuntimeException('boom');
        }];
        $r = $this->go('{ me { id name age } }', $res);
        $this->assertSame(['me' => ['id' => '1', 'name' => null, 'age' => 4]], $r['data']);
        $this->assertSame([['message' => 'boom', 'path' => ['me', 'name']]], $r['errors']);
        $r = $this->go('{ a: me { n: name } b: me { id } }', $res);
        $this->assertSame([['message' => 'boom', 'path' => ['a', 'n']]], $r['errors']);
        $this->assertSame('1', $r['data']['b']['id']);
    }

    /** @id TEST-EXE-008 @verifies REQ-EXE-008 */
    public function test_exe_008_non_null_propagation(): void
    {
        $res = ['Query.me' => fn() => ['id' => '1', 'posts' => [['id' => 'p1', 'author' => null]]]];
        $r = $this->go('{ me { id posts { id author { id } } } }', $res);
        $this->assertSame(['me' => null], $r['data']);
        $this->assertCount(1, $r['errors']);
        $this->assertSame(['me', 'posts', 0, 'author'], $r['errors'][0]['path']);
        $this->assertStringContainsString('Post.author', $r['errors'][0]['message']);
        $r = $this->go('{ must }', ['Query.must' => fn() => null]);
        $this->assertSame(['data' => null, 'errors' => [['message' => 'Cannot return null for non-nullable field Query.must.', 'path' => ['must']]]], $r);
        $r = $this->go('{ me { id } must }', ['Query.me' => fn() => ['id' => '1'], 'Query.must' => function () {
            throw new \LogicException('nope');
        }]);
        $this->assertNull($r['data']);
        $this->assertSame([['message' => 'nope', 'path' => ['must']]], $r['errors']);
        $r = $this->go('{ me { posts { id } } }', ['Query.me' => fn() => ['posts' => null]]);
        $this->assertSame(['me' => null], $r['data']);
        $this->assertCount(1, $r['errors']);
    }

    /** @id TEST-EXE-009 @verifies REQ-EXE-009 */
    public function test_exe_009_lists(): void
    {
        $r = $this->go('{ matrix }', ['Query.matrix' => fn() => [[1, 2], [3, null]]]);
        $this->assertSame(['matrix' => null], $r['data']);
        $this->assertSame(['matrix', 1, 1], $r['errors'][0]['path']);
        $this->assertCount(1, $r['errors']);
        $r = $this->go('{ matrix }', ['Query.matrix' => fn() => [[1, 2], []]]);
        $this->assertSame(['matrix' => [[1, 2], []]], $r['data']);
        $r = $this->go('{ me { friends { id } } }', ['Query.me' => fn() => ['friends' => [['id' => 'a'], null, ['id' => 'c']]]]);
        $this->assertSame(['me' => ['friends' => null]], $r['data']);
        $this->assertSame(['me', 'friends', 1], $r['errors'][0]['path']);
        $r = $this->go('{ search(text: "a") { ... on User { id } } }', ['Query.search' => fn() => [['__typename' => 'User', 'id' => '1'], ['__typename' => 'Nope'], ['__typename' => 'User', 'id' => '3']]]);
        $this->assertSame([['id' => '1'], null, ['id' => '3']], $r['data']['search']);
        $this->assertSame(['search', 1], $r['errors'][0]['path']);
        $r = $this->go('{ users { id } }', ['Query.users' => fn() => 'notalist']);
        $this->assertSame(null, $r['data']);
        $this->assertStringContainsString('Iterable', $r['errors'][0]['message']);
        $r = $this->go('{ users { id } }', ['Query.users' => fn() => new \ArrayIterator([['id' => '1']])]);
        $this->assertSame([['id' => '1']], $r['data']['users']);
    }

    /** @id TEST-EXE-010 @verifies REQ-EXE-010 */
    public function test_exe_010_abstract_types(): void
    {
        $q = '{ node(id: "1") { id ... on User { name } ... on Post { title } } }';
        $r = $this->go($q, ['Query.node' => fn() => ['__typename' => 'Post', 'id' => '1', 'title' => 'T', 'name' => 'no']]);
        $this->assertSame(['id' => '1', 'title' => 'T'], $r['data']['node']);
        $r = $this->go($q, ['Query.node' => fn() => ['id' => '2', 'name' => 'N']], [], ['resolveType' => fn($v, $ctx, $info, string $abs) => $abs === 'Node' ? 'User' : null]);
        $this->assertSame(['id' => '2', 'name' => 'N'], $r['data']['node']);
        $r = $this->go($q, ['Query.node' => fn() => ['id' => '3', 'title' => 'P', 'isPost' => true]], [], ['isTypeOf' => ['Post' => fn($v) => !empty($v['isPost']), 'User' => fn($v) => false]]);
        $this->assertSame(['id' => '3', 'title' => 'P'], $r['data']['node']);
        $r = $this->go($q, ['Query.node' => fn() => ['id' => '4']]);
        $this->assertSame(['node' => null], $r['data']);
        $this->assertStringContainsString('Node', $r['errors'][0]['message']);
        $this->assertSame(['node'], $r['errors'][0]['path']);
        $r = $this->go($q, ['Query.node' => fn() => ['__typename' => 'Role']]);
        $this->assertStringContainsString('not a possible type', $r['errors'][0]['message']);
        $r = $this->go('{ search(text: "a") { ... on User { id } } }', ['Query.search' => fn() => [['__typename' => 'Post', 'id' => 'p']]]);
        $this->assertSame([[]], $r['data']['search']);
    }

    /** @id TEST-EXE-011 @verifies REQ-EXE-011 */
    public function test_exe_011_leaf_serialization(): void
    {
        $user = fn(array $v) => ['Query.me' => fn() => $v];
        $r = $this->go('{ me { role age score active name id } }', $user(['role' => 'ADMIN', 'age' => 5, 'score' => 2, 'active' => true, 'name' => 'n', 'id' => 7]));
        $this->assertSame(['role' => 'ADMIN', 'age' => 5, 'score' => 2.0, 'active' => true, 'name' => 'n', 'id' => '7'], $r['data']['me']);
        $this->assertSame(2.0, $r['data']['me']['score']);
        $r = $this->go('{ me { role } }', $user(['role' => 'NOPE']));
        $this->assertSame(['me' => ['role' => null]], $r['data']);
        $this->assertStringContainsString('Role', $r['errors'][0]['message']);
        $r = $this->go('{ me { age } }', $user(['age' => 3000000000]));
        $this->assertSame(['me' => ['age' => null]], $r['data']);
        $this->assertSame(['me', 'age'], $r['errors'][0]['path']);
        $r = $this->go('{ me { active } }', $user(['active' => 1]));
        $this->assertSame(['me' => ['active' => null]], $r['data']);
        $r = $this->go('{ me { age } }', $user(['age' => 'x']));
        $this->assertSame(['me' => ['age' => null]], $r['data']);
        $r = $this->go('{ me { age } }', $user(['age' => 4.0]));
        $this->assertSame(['me' => ['age' => 4]], $r['data']);
        $r = $this->go('{ me { age } }', $user(['age' => 4.5]));
        $this->assertSame(['me' => ['age' => null]], $r['data']);
    }

    /** @id TEST-EXE-012 @verifies REQ-EXE-012 */
    public function test_exe_012_typename(): void
    {
        $res = ['Query.me' => fn() => ['id' => '1'], 'Query.search' => fn() => [['__typename' => 'Post'], ['__typename' => 'User']], 'Query.node' => fn() => ['__typename' => 'Post']];
        $r = $this->go('{ __typename me { t: __typename } search(text: "x") { __typename } node(id: 1) { __typename } }', $res);
        $this->assertSame(['__typename' => 'Query', 'me' => ['t' => 'User'], 'search' => [['__typename' => 'Post'], ['__typename' => 'User']], 'node' => ['__typename' => 'Post']], $r['data']);
        $r = $this->go('mutation { __typename }');
        $this->assertSame(['__typename' => 'Mutation'], $r['data']);
    }

    /** @id TEST-EXE-013 @verifies REQ-EXE-013 */
    public function test_exe_013_serial_mutations(): void
    {
        $log = [];
        $res = [
            'Mutation.bump' => function () use (&$log) {
                $log[] = 'bump' . count($log);
                return count($log);
            },
            'Mutation.createUser' => function ($s, $a) use (&$log) {
                $log[] = 'create:' . $a['name'];
                if ($a['name'] === 'bad') {
                    throw new \RuntimeException('bad user');
                }
                return ['id' => $a['name'], 'name' => $a['name']];
            },
            'User.name' => function ($s) use (&$log) {
                $log[] = 'name:' . $s['name'];
                return $s['name'];
            },
        ];
        $r = $this->go('mutation { a: createUser(name: "a") { name } b: bump c: createUser(name: "bad") { id } d: createUser(name: "d") { name } e: bump }', $res);
        $this->assertSame(['create:a', 'name:a', 'bump2', 'create:bad', 'create:d', 'name:d', 'bump6'], $log);
        $this->assertSame(['a', 'b', 'c', 'd', 'e'], array_keys($r['data']));
        $this->assertNull($r['data']['c']);
        $this->assertSame(['c'], $r['errors'][0]['path']);
        $log = [];
        $this->go('{ x: me { name } y: me { name } }', ['Query.me' => function () use (&$log) {
            $log[] = 'me';
            return ['name' => 'N'];
        }] + $res);
        $this->assertSame(['me', 'name:N', 'me', 'name:N'], $log);
    }

    /** @id TEST-EXE-014 @verifies REQ-EXE-014 */
    public function test_exe_014_operation_selection(): void
    {
        $q = 'query A { __typename } query B { me { id } } mutation M { bump }';
        $res = ['Query.me' => fn() => ['id' => '1'], 'Mutation.bump' => fn() => 1];
        $r = $this->go($q, $res);
        $this->assertArrayNotHasKey('data', $r);
        $this->assertStringContainsString('operation name', $r['errors'][0]['message']);
        $r = $this->go($q, $res, [], ['operationName' => 'Z']);
        $this->assertStringContainsString('Unknown operation named "Z"', $r['errors'][0]['message']);
        $this->assertSame(['me' => ['id' => '1']], $this->go($q, $res, [], ['operationName' => 'B'])['data']);
        $this->assertSame(['bump' => 1], $this->go($q, $res, [], ['operationName' => 'M'])['data']);
        $this->assertSame(['__typename' => 'Query'], $this->go('{ __typename }')['data']);
        $r = $this->go('fragment F on User { id }');
        $this->assertNotEmpty($r['errors']);
        $r = $this->go('{ me { nope } }');
        $this->assertArrayNotHasKey('data', $r);
        $this->assertStringContainsString('nope', $r['errors'][0]['message']);
        $r = $this->go('{ me ');
        $this->assertArrayNotHasKey('data', $r);
        $this->assertStringContainsString('Expected', $r['errors'][0]['message']);
    }

    /** @id TEST-EXE-015 @verifies REQ-EXE-015 */
    public function test_exe_015_nested_argument_variables(): void
    {
        $r = $this->go('query($a: Int, $b: Int!, $c: Int, $z: Int) { echo(l: [$a, 2, $z], o: {a: $b, c: {x: $c}}) }', [], ['a' => 1, 'b' => 7, 'c' => 3]);
        $this->assertSame('{"l":[1,2,null],"o":{"a":7,"c":{"x":3}}}', $r['data']['echo']);
        $r = $this->go('query($b: Int!, $c: Int) { echo(o: {a: $b, c: {x: $c}}) }', [], ['b' => 7]);
        $this->assertSame('{"o":{"a":7,"c":[]}}', $r['data']['echo']);
        $seen = [];
        $res = ['Query.users' => function ($s, $a) use (&$seen) {
            $seen[] = $a;
            return [];
        }, 'Query.me' => fn() => ['id' => '1']];
        $this->go('{ users { id } }', $res);
        $this->go('query($l: Int) { users(limit: $l) { id } }', $res);
        $this->go('query($l: Int) { users(limit: $l) { id } }', $res, ['l' => 2]);
        $this->go('query($l: Int) { users(limit: $l, tags: ["a", "b"]) { id } }', $res, ['l' => null]);
        $this->assertSame([['limit' => 10], ['limit' => 10], ['limit' => 2], ['limit' => null, 'tags' => ['a', 'b']]], $seen);
        $r = $this->go('{ me { friends(first: 3) { id } } }', ['Query.me' => fn() => ['friends' => []], 'User.friends' => function ($s, $a) use (&$seen) {
            $seen = $a;
            return [];
        }]);
        $this->assertSame(['first' => 3], $seen);
        $this->go('{ me { friends { id } } }', ['Query.me' => fn() => ['friends' => []], 'User.friends' => function ($s, $a) use (&$seen) {
            $seen = $a;
            return [];
        }]);
        $this->assertSame(['first' => 5], $seen);
        $r = $this->go('{ echo(e: ADMIN, f: 2, o: {a: 1}) }');
        $this->assertSame('{"f":2.0,"o":{"a":1},"e":"ADMIN"}', $r['data']['echo']);
    }

    /** @id TEST-EXE-016 @verifies REQ-EXE-016 */
    public function test_exe_016_unrenderable_values(): void
    {
        $r = $this->go('query($f: Float) { echo(f: $f) }', [], ['f' => NAN]);
        $this->assertCount(1, $r['errors']);
        $this->assertStringContainsString('got invalid value NaN', $r['errors'][0]['message']);
        $r = $this->go('query($s: Int) { echo(i: $s) }', [], ['s' => "\xB1\x31"]);
        $this->assertMatchesRegularExpression('/got invalid value ".+"/', $r['errors'][0]['message']);
        $r = $this->go('query($s: Role) { echo(e: $s) }', [], ['s' => INF]);
        $this->assertStringContainsString('Value INF does not exist', $r['errors'][0]['message']);
    }
}
