using Test

# each file defines its own top-level modules; run them in separate processes to avoid clashes
@testset "Optim9" begin
    for f in ["sparse_tests.jl", "lu_tests.jl", "newton_tests.jl", "gradient_tests.jl"]
        @test success(pipeline(`$(Base.julia_cmd()) --project=$(dirname(@__DIR__)) $(joinpath(@__DIR__, f))`; stdout=stdout, stderr=stderr))
    end
end
