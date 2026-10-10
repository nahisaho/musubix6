using Test

# Each test file loads its own copy of the sources, so run each one inside its own module.
@testset "AutoDiff" begin
    for f in sort(filter(f -> startswith(f, "test_") && endswith(f, ".jl"), readdir(@__DIR__)))
        @eval module $(Symbol("Iso_", f[1:end-3]))
            using Test
            include($f)
        end
    end
end
