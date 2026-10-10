<?php
declare(strict_types=1);

namespace GraphqlLite\Schema;

use GraphqlLite\Sdl\Definition;
use GraphqlLite\Sdl\Document;
use GraphqlLite\Sdl\Parser;
use GraphqlLite\Sdl\TypeRef;

final class Schema
{
    public const BUILTIN_SCALARS = ['Int', 'Float', 'String', 'Boolean', 'ID'];

    /** @var array<string,Definition> */
    private array $types;
    /** @var array<string,string> */
    private array $roots;
    /** @var array<string,string[]>|null */
    private ?array $possible = null;

    /** @param array<string,Definition> $userTypes @param array<string,string> $explicitRoots */
    private function __construct(private readonly array $userTypes, array $explicitRoots)
    {
        $this->types = $userTypes;
        foreach (self::BUILTIN_SCALARS as $n) {
            if (!isset($this->types[$n])) {
                $this->types[$n] = new Definition('scalar', $n);
            }
        }
        if ($explicitRoots) {
            $this->roots = $explicitRoots;
        } else {
            $this->roots = [];
            foreach (['query' => 'Query', 'mutation' => 'Mutation', 'subscription' => 'Subscription'] as $op => $name) {
                if (isset($this->types[$name]) && $this->types[$name]->kind === 'object') {
                    $this->roots[$op] = $name;
                }
            }
        }
    }

    /** @id CODE-SCH-001 @implements REQ-SCH-001 REQ-SCH-002 */
    public static function fromSdl(string $sdl): self
    {
        return self::fromDocument(Parser::parse($sdl));
    }

    public static function fromDocument(Document $doc): self
    {
        return new self($doc->definitions, $doc->roots);
    }

    public function type(string $name): ?Definition
    {
        return $this->types[$name] ?? null;
    }

    /** @return array<string,Definition> */
    public function types(): array
    {
        return $this->types;
    }

    /** @return array<string,string> */
    public function roots(): array
    {
        return $this->roots;
    }

    /** @return string[] */
    public function userTypeNames(): array
    {
        return array_keys($this->userTypes);
    }

    /** @return string[] */
    public function validate(): array
    {
        return (new Validator($this))->validate();
    }

    public function kindOf(string $name): ?string
    {
        return $this->types[$name]->kind ?? null;
    }

    public function isInputType(string $name): bool
    {
        return in_array($this->kindOf($name), ['scalar', 'enum', 'input'], true);
    }

    public function isOutputType(string $name): bool
    {
        return in_array($this->kindOf($name), ['scalar', 'enum', 'object', 'interface', 'union'], true);
    }

    public function isLeaf(string $name): bool
    {
        return in_array($this->kindOf($name), ['scalar', 'enum'], true);
    }

    public function isAbstract(string $name): bool
    {
        return in_array($this->kindOf($name), ['interface', 'union'], true);
    }

    /** @id CODE-SCH-002 @implements REQ-SCH-010 */
    public function possibleTypes(string $name): array
    {
        $def = $this->type($name);
        if ($def === null) {
            return [];
        }
        if ($def->kind === 'object') {
            return [$name];
        }
        if ($def->kind === 'union') {
            return array_values(array_filter($def->members, fn($m) => $this->kindOf($m) === 'object'));
        }
        if ($def->kind !== 'interface') {
            return [];
        }
        if ($this->possible === null) {
            $this->possible = [];
            foreach ($this->types as $t) {
                if ($t->kind !== 'object') {
                    continue;
                }
                foreach ($this->interfaceClosure($t->name) as $i) {
                    $this->possible[$i][] = $t->name;
                }
            }
        }
        return $this->possible[$name] ?? [];
    }

    /** @return string[] all interfaces an object/interface implements, transitively; cycle safe */
    public function interfaceClosure(string $name): array
    {
        $seen = [];
        $stack = $this->type($name)?->interfaces ?? [];
        while ($stack) {
            $i = array_pop($stack);
            if (isset($seen[$i]) || $this->kindOf($i) !== 'interface') {
                continue;
            }
            $seen[$i] = true;
            array_push($stack, ...$this->type($i)->interfaces);
        }
        return array_keys($seen);
    }

    public function isSubType(string $abstract, string $object): bool
    {
        return in_array($object, $this->possibleTypes($abstract), true);
    }

    /** @id CODE-SCH-003 @implements REQ-SCH-005 */
    public function isTypeSubtype(TypeRef $sub, TypeRef $super): bool
    {
        if ($super->kind === 'nonnull') {
            return $sub->kind === 'nonnull' && $this->isTypeSubtype($sub->of, $super->of);
        }
        if ($sub->kind === 'nonnull') {
            return $this->isTypeSubtype($sub->of, $super);
        }
        if ($super->kind === 'list') {
            return $sub->kind === 'list' && $this->isTypeSubtype($sub->of, $super->of);
        }
        if ($sub->kind === 'list') {
            return false;
        }
        return $sub->name === $super->name || ($this->isAbstract((string) $super->name) && $this->isSubType((string) $super->name, (string) $sub->name));
    }
}
