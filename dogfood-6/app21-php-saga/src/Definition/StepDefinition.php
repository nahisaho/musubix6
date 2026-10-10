<?php
declare(strict_types=1);

namespace Saga\Definition;

use InvalidArgumentException;

final class StepDefinition
{
    /** @var callable */
    public $action;
    /** @var callable|null */
    public $compensation;

    /**
     * @id CODE-DEF-004 @implements REQ-DEF-004
     * @param string[] $dependsOn
     */
    public function __construct(
        public readonly string $name,
        callable $action,
        ?callable $compensation = null,
        public readonly array $dependsOn = [],
    ) {
        Names::assertValid($name, 'step');
        foreach ($dependsOn as $d) {
            Names::assertValid((string) $d, 'dependency');
            if ($d === $name) {
                throw new InvalidArgumentException("step $name cannot depend on itself");
            }
        }
        $this->action = $action;
        $this->compensation = $compensation;
    }
}
