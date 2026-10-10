using Test
include("../src/Tensors.jl")
include("../src/Rng.jl")
include("../src/Data.jl")
using .Tensors
using .RngMod
using .Data

@testset "data" begin

# @id TEST-DATA-001 @verifies REQ-DATA-001
@testset "TEST-DATA-001 xor labels and margin" begin
    X, y = make_xor(Rng(1), 200)
    @test X.shape == (200, 2)
    @test length(y) == 200
    @test all(l -> l in (1, 2), y)
    for i in 1:200
        a, b = X[i, 1], X[i, 2]
        @test 0.2 <= abs(a) <= 1.0
        @test 0.2 <= abs(b) <= 1.0
        @test y[i] == 1 + (a * b < 0 ? 1 : 0)
    end
    @test 0 < count(==(1), y) < 200
end

# @id TEST-DATA-002 @verifies REQ-DATA-002
@testset "TEST-DATA-002 spirals balanced" begin
    X, y = make_spirals(Rng(2), 30, 3)
    @test X.shape == (90, 2)
    @test [count(==(c), y) for c in 1:3] == [30, 30, 30]
    # radius grows with the in-class index
    for c in 1:3
        idx = findall(==(c), y)
        r = [hypot(X[i, 1], X[i, 2]) for i in idx]
        @test r[end] > r[1]
        @test r[end] <= 1.3
    end
    @test_throws ArgumentError make_spirals(Rng(2), 0, 3)
    @test_throws ArgumentError make_spirals(Rng(2), 5, 1)
end

# @id TEST-DATA-003 @verifies REQ-DATA-003
@testset "TEST-DATA-003 determinism" begin
    X1, y1 = make_xor(Rng(9), 50)
    X2, y2 = make_xor(Rng(9), 50)
    X3, y3 = make_xor(Rng(10), 50)
    @test X1.data == X2.data && y1 == y2
    @test X1.data != X3.data
    S1, _ = make_spirals(Rng(9), 10, 2)
    S2, _ = make_spirals(Rng(9), 10, 2)
    @test S1.data == S2.data
end

# @id TEST-DATA-004 @verifies REQ-DATA-004
@testset "TEST-DATA-004 batch partition" begin
    b = batch_indices(Rng(5), 10, 4)
    @test length(b) == 3
    @test length.(b) == [4, 4, 2]
    @test sort(reduce(vcat, b)) == collect(1:10)
    @test reduce(vcat, b) != collect(1:10)
    b2 = batch_indices(Rng(5), 10, 4)
    @test b == b2
    @test length(batch_indices(Rng(5), 4, 10)) == 1
    @test length.(batch_indices(Rng(5), 8, 4)) == [4, 4]
end

# @id TEST-DATA-005 @verifies REQ-DATA-005
@testset "TEST-DATA-005 batch_indices invalid" begin
    @test_throws ArgumentError batch_indices(Rng(1), 10, 0)
    @test_throws ArgumentError batch_indices(Rng(1), 0, 4)
    @test_throws ArgumentError batch_indices(Rng(1), -3, 4)
end

# @id TEST-DATA-006 @verifies REQ-DATA-006
@testset "TEST-DATA-006 take_rows" begin
    X = Tensor(Float64.(1:6), (3, 2))   # rows (1,4) (2,5) (3,6)
    R = take_rows(X, [3, 1, 3])
    @test R.shape == (3, 2)
    @test R.data == [3.0, 1.0, 3.0, 6.0, 4.0, 6.0]
    R.data[1] = 99.0
    @test X.data[3] == 3.0
    @test_throws BoundsError take_rows(X, [4])
    @test_throws BoundsError take_rows(X, [0])
end

# @id TEST-DATA-007 @verifies REQ-DATA-007
@testset "TEST-DATA-007 train_test_split" begin
    tr, te = train_test_split(Rng(3), 20, 0.25)
    @test length(te) == 5
    @test length(tr) == 15
    @test isempty(intersect(tr, te))
    @test sort(vcat(tr, te)) == collect(1:20)
    @test length(train_test_split(Rng(3), 10, 0.25)[2]) == round(Int, 2.5)
    @test_throws ArgumentError train_test_split(Rng(3), 20, 0.0)
    @test_throws ArgumentError train_test_split(Rng(3), 20, 1.0)
    @test_throws ArgumentError train_test_split(Rng(3), 20, -0.5)
end

end
