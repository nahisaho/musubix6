using Test
include("../src/R.jl")
using .R

# @id TEST-R-001 @verifies REQ-R-001
@testset "TEST-R-001 uno" begin
    @test uno() == 1
end

# @id TEST-R-002 @verifies REQ-R-002
@testset "TEST-R-002 dos" begin
    @test dos() == 2
end
