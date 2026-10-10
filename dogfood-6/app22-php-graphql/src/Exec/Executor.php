<?php
declare(strict_types=1);

namespace GraphqlLite\Exec;

use GraphqlLite\Lex\SyntaxError;
use GraphqlLite\Query\Ast\Document;
use GraphqlLite\Query\Ast\Field;
use GraphqlLite\Query\Ast\FragmentSpread;
use GraphqlLite\Query\Ast\InlineFragment;
use GraphqlLite\Query\Ast\Operation;
use GraphqlLite\Query\Parser;
use GraphqlLite\Query\Validator;
use GraphqlLite\Schema\Schema;
use GraphqlLite\Sdl\FieldDef;
use GraphqlLite\Sdl\TypeRef;

final class Executor
{
    /** @var array<int,array{message:string,path?:array}> */
    private array $errors = [];
    private Operation $op;
    /** @var array<string,mixed> */
    private array $vars = [];

    /** @param array<string,callable> $resolvers @param array<string,callable> $isTypeOf */
    private function __construct(
        private readonly Schema $schema,
        private readonly Document $doc,
        private readonly array $resolvers,
        private readonly mixed $context,
        private readonly ?\Closure $resolveType,
        private readonly array $isTypeOf,
    ) {
    }

    /**
     * Executes a query; the result is `['data' => ..., 'errors' => [...]]` where `errors` is omitted when empty
     * and `data` is omitted when the request failed before execution.
     * @id CODE-EXE-004 @implements REQ-EXE-001 REQ-EXE-014
     * @param array<string,callable> $resolvers keyed "Type.field"
     * @param array<string,callable> $isTypeOf keyed by object type name
     */
    public static function execute(
        Schema $schema,
        string|Document $query,
        array $resolvers = [],
        array $variables = [],
        ?string $operationName = null,
        mixed $rootValue = null,
        mixed $context = null,
        ?callable $resolveType = null,
        array $isTypeOf = [],
    ): array {
        try {
            $doc = is_string($query) ? Parser::parse($query) : $query;
        } catch (SyntaxError $e) {
            return ['errors' => [['message' => $e->getMessage()]]];
        }
        $invalid = Validator::validate($schema, $doc);
        if ($invalid) {
            return ['errors' => array_map(fn($m) => ['message' => $m], $invalid)];
        }
        $op = self::selectOperation($doc, $operationName);
        if (is_string($op)) {
            return ['errors' => [['message' => $op]]];
        }
        [$vars, $verrors] = Coercion::variables($schema, $op, $variables);
        if ($verrors) {
            return ['errors' => array_map(fn($m) => ['message' => $m], $verrors)];
        }
        $ex = new self($schema, $doc, $resolvers, $context, $resolveType === null ? null : \Closure::fromCallable($resolveType), $isTypeOf);
        $ex->op = $op;
        $ex->vars = $vars;
        return $ex->run($rootValue);
    }

    private static function selectOperation(Document $doc, ?string $name): Operation|string
    {
        $ops = $doc->operations;
        if (!$ops) {
            return 'Must provide an operation.';
        }
        if ($name === null) {
            return count($ops) === 1 ? $ops[0] : 'Must provide operation name if query contains multiple operations.';
        }
        foreach ($ops as $o) {
            if ($o->name === $name) {
                return $o;
            }
        }
        return "Unknown operation named \"$name\".";
    }

    /** Top-level fields run one after another in document order; each is fully completed before the next starts. */
    private function run(mixed $root): array
    {
        $rootName = $this->schema->roots()[$this->op->type];
        try {
            $data = $this->executeSelectionSet($rootName, $root, [], $this->op->selections);
        } catch (FieldError $e) {
            $this->errors[] = $e->toArray();
            $data = null;
        }
        return ['data' => $data] + ($this->errors ? ['errors' => $this->errors] : []);
    }

    /** @param array $sels */
    private function executeSelectionSet(string $objectName, mixed $source, array $path, array $sels): array
    {
        $fields = [];
        $visited = [];
        $this->collectFields($objectName, $sels, $fields, $visited);
        $result = [];
        foreach ($fields as $key => $nodes) {
            $fp = [...$path, $key];
            if ($nodes[0]->name === '__typename') {
                $result[$key] = $objectName;
                continue;
            }
            $def = $this->schema->type($objectName)->fields[$nodes[0]->name];
            try {
                $result[$key] = $this->resolveField($objectName, $def, $nodes, $source, $fp);
            } catch (FieldError $e) {
                if ($def->type->isNonNull()) {
                    throw $e;
                }
                $this->errors[] = $e->toArray();
                $result[$key] = null;
            }
        }
        return $result;
    }

    /**
     * @id CODE-EXE-005 @implements REQ-EXE-005 REQ-EXE-006
     * @param array<string,Field[]> $fields
     * @param array<string,bool> $visited
     */
    private function collectFields(string $objectName, array $sels, array &$fields, array &$visited): void
    {
        foreach ($sels as $s) {
            if (!$this->shouldInclude($s->directives)) {
                continue;
            }
            if ($s instanceof Field) {
                $fields[$s->responseKey()][] = $s;
            } elseif ($s instanceof InlineFragment) {
                if ($s->typeCondition === null || $this->applies($s->typeCondition, $objectName)) {
                    $this->collectFields($objectName, $s->selections, $fields, $visited);
                }
            } elseif ($s instanceof FragmentSpread && !isset($visited[$s->name])) {
                $visited[$s->name] = true;
                $frag = $this->doc->fragments[$s->name];
                if ($this->applies($frag->typeCondition, $objectName)) {
                    $this->collectFields($objectName, $frag->selections, $fields, $visited);
                }
            }
        }
    }

    private function applies(string $cond, string $objectName): bool
    {
        return $cond === $objectName || ($this->schema->isAbstract($cond) && $this->schema->isSubType($cond, $objectName));
    }

    private function shouldInclude(array $directives): bool
    {
        foreach ($directives as $d) {
            if ($d->name !== 'skip' && $d->name !== 'include') {
                continue;
            }
            $ast = $d->args['if'];
            $on = $ast['kind'] === 'Variable' ? ($this->vars[$ast['value']] ?? false) : $ast['value'];
            if (($d->name === 'skip') === (bool) $on) {
                return false;
            }
        }
        return true;
    }

    /** @param Field[] $nodes */
    private function resolveField(string $parent, FieldDef $def, array $nodes, mixed $source, array $path): mixed
    {
        try {
            $args = Coercion::arguments($this->schema, $def, $nodes[0]->args, $this->vars);
        } catch (CoercionError $e) {
            throw new FieldError($e->getMessage(), $path, $e);
        }
        $info = new ResolveInfo($def->name, $path, $parent, $def->type, $nodes, $this->schema, $this->vars, $this->op);
        try {
            $resolver = $this->resolvers["$parent.{$def->name}"] ?? null;
            $value = $resolver !== null ? $resolver($source, $args, $this->context, $info) : $this->defaultResolve($source, $def->name, $args, $info);
        } catch (FieldError $e) {
            throw $e;
        } catch (\Throwable $e) {
            throw new FieldError($e->getMessage(), $path, $e);
        }
        return $this->completeValue($def->type, $nodes, $info, $path, $value);
    }

    private function defaultResolve(mixed $source, string $name, array $args, ResolveInfo $info): mixed
    {
        $v = null;
        if (is_array($source)) {
            $v = $source[$name] ?? null;
        } elseif (is_object($source)) {
            $getter = 'get' . ucfirst($name);
            if (property_exists($source, $name)) {
                $v = $source->$name;
            } elseif (method_exists($source, $getter)) {
                $v = $source->$getter();
            } elseif (method_exists($source, $name)) {
                $v = $source->$name();
            }
        }
        return $v instanceof \Closure ? $v($args, $this->context, $info) : $v;
    }

    /**
     * @id CODE-EXE-006 @implements REQ-EXE-007 REQ-EXE-008 REQ-EXE-009 REQ-EXE-010 REQ-EXE-002 REQ-EXE-012 REQ-EXE-013
     * @param Field[] $nodes
     */
    private function completeValue(TypeRef $t, array $nodes, ResolveInfo $info, array $path, mixed $value): mixed
    {
        if ($t->kind === 'nonnull') {
            $r = $this->completeValue($t->of, $nodes, $info, $path, $value);
            if ($r === null) {
                throw new FieldError("Cannot return null for non-nullable field {$info->parentType}.{$info->fieldName}.", $path);
            }
            return $r;
        }
        if ($value === null) {
            return null;
        }
        if ($t->kind === 'list') {
            if (!is_iterable($value)) {
                throw new FieldError("Expected Iterable, but did not find one for field \"{$info->parentType}.{$info->fieldName}\".", $path);
            }
            $out = [];
            $i = 0;
            foreach ($value as $item) {
                $ip = [...$path, $i++];
                try {
                    $out[] = $this->completeValue($t->of, $nodes, $info, $ip, $item);
                } catch (FieldError $e) {
                    if ($t->of->isNonNull()) {
                        throw $e;
                    }
                    $this->errors[] = $e->toArray();
                    $out[] = null;
                }
            }
            return $out;
        }
        $name = (string) $t->name;
        if ($this->schema->isLeaf($name)) {
            try {
                return Coercion::serialize($this->schema, $name, $value);
            } catch (CoercionError $e) {
                throw new FieldError($e->getMessage(), $path, $e);
            }
        }
        $runtime = $this->schema->kindOf($name) === 'object' ? $name : $this->resolveAbstract($name, $value, $info, $path);
        $sels = [];
        foreach ($nodes as $n) {
            array_push($sels, ...($n->selections ?? []));
        }
        return $this->executeSelectionSet($runtime, $value, $path, $sels);
    }

    private function resolveAbstract(string $abstract, mixed $value, ResolveInfo $info, array $path): string
    {
        $name = null;
        if ($this->resolveType !== null) {
            $name = ($this->resolveType)($value, $this->context, $info, $abstract);
        }
        if ($name === null && is_array($value) && isset($value['__typename'])) {
            $name = $value['__typename'];
        } elseif ($name === null && is_object($value) && isset($value->__typename)) {
            $name = $value->__typename;
        }
        if ($name === null) {
            foreach ($this->schema->possibleTypes($abstract) as $candidate) {
                if (isset($this->isTypeOf[$candidate]) && ($this->isTypeOf[$candidate])($value, $this->context, $info)) {
                    $name = $candidate;
                    break;
                }
            }
        }
        if (!is_string($name)) {
            throw new FieldError("Abstract type \"$abstract\" must resolve to an Object type at runtime for field \"{$info->parentType}.{$info->fieldName}\". Provide a resolveType function, a __typename entry or isTypeOf callbacks.", $path);
        }
        if (!$this->schema->isSubType($abstract, $name)) {
            throw new FieldError("Runtime Object type \"$name\" is not a possible type for \"$abstract\".", $path);
        }
        return $name;
    }
}
