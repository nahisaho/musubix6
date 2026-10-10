using Test
include("../src/Tensors.jl")
include("../src/Tape.jl")
using .Tensors
using .TapeMod

# Test-local differentiable helpers built only on record!
mul2(t, a, b) = record!(t, mul_t(a.value, b.value), [a, b],
    G -> [sum_to_shape(mul_t(G, b.value), size_t(a.value)), sum_to_shape(mul_t(G, a.value), size_t(b.value))])
add2(t, a, b) = record!(t, add_t(a.value, b.value), [a, b],
    G -> [sum_to_shape(G, size_t(a.value)), sum_to_shape(G, size_t(b.value))])
scal(x) = Tensor([Float64(x)], ())

@testset "tape" begin

# @id TEST-TAPE-001 @verifies REQ-TAPE-001
@testset "TEST-TAPE-001 leaf" begin
    t = Tape()
    a = leaf(t, scal(2))
    b = leaf(t, scal(3); requires_grad=false)
    @test a.id == 1 && b.id == 2
    @test a.grad === nothing
    @test a.requires_grad && !b.requires_grad
    @test a.value.data == [2.0]
    @test length(t.nodes) == 2
end

# @id TEST-TAPE-002 @verifies REQ-TAPE-002
@testset "TEST-TAPE-002 record requires_grad propagation" begin
    t = Tape()
    a = leaf(t, scal(2)); b = leaf(t, scal(3); requires_grad=false)
    c = mul2(t, a, b)
    d = mul2(t, b, b)
    @test c.requires_grad
    @test !d.requires_grad
    @test c.id > a.id && c.id > b.id
    @test all(p.id < c.id for p in c.parents)
    @test c.value.data == [6.0]
end

# @id TEST-TAPE-003 @verifies REQ-TAPE-003
@testset "TEST-TAPE-003 foreign tape rejected" begin
    t1 = Tape(); t2 = Tape()
    a = leaf(t1, scal(1)); b = leaf(t2, scal(1))
    @test_throws ArgumentError add2(t1, a, b)
    @test_throws ArgumentError add2(t2, a, b)
end

# @id TEST-TAPE-004 @verifies REQ-TAPE-004
@testset "TEST-TAPE-004 backward on diamond graph" begin
    t = Tape()
    x = leaf(t, scal(3))
    y = mul2(t, x, x)
    z = add2(t, y, x)
    backward!(t, z)
    @test x.grad.data == [7.0]
    @test z.grad.data == [1.0]
    t2 = Tape()
    p = leaf(t2, scal(2)); q = leaf(t2, scal(5))
    u = mul2(t2, p, q); v = add2(t2, u, p); w = mul2(t2, v, u)
    backward!(t2, w)
    @test p.grad.data == [120.0]
    @test q.grad.data == [44.0]
end

# @id TEST-TAPE-005 @verifies REQ-TAPE-005
@testset "TEST-TAPE-005 loss validation" begin
    t = Tape()
    a = leaf(t, Tensor([1.0, 2.0], (2,)))
    b = add2(t, a, a)
    @test_throws ArgumentError backward!(t, b)
    c = leaf(t, scal(1); requires_grad=false)
    @test_throws ErrorException backward!(t, c)
end

# @id TEST-TAPE-006 @verifies REQ-TAPE-006
@testset "TEST-TAPE-006 fan-out accumulation" begin
    t = Tape()
    x = leaf(t, scal(4))
    s = add2(t, add2(t, x, x), x)
    backward!(t, s)
    @test x.grad.data == [3.0]
end

# @id TEST-TAPE-007 @verifies REQ-TAPE-007
@testset "TEST-TAPE-007 free after backward / retain" begin
    t = Tape()
    x = leaf(t, scal(2)); y = mul2(t, x, x)
    backward!(t, y)
    @test x.grad.data == [4.0]
    @test_throws ErrorException backward!(t, y)
    @test_throws ErrorException add2(t, x, x)
    reset!(t)
    t3 = Tape()
    a = leaf(t3, scal(2)); b = mul2(t3, a, a)
    backward!(t3, b; retain=true)
    backward!(t3, b; retain=true)
    @test a.grad.data == [8.0]
    backward!(t3, b)
    @test a.grad.data == [12.0]
    @test_throws ErrorException backward!(t3, b)
end

# @id TEST-TAPE-008 @verifies REQ-TAPE-008
@testset "TEST-TAPE-008 zero_grad!" begin
    t = Tape()
    x = leaf(t, scal(2)); y = mul2(t, x, x)
    backward!(t, y; retain=true)
    @test x.grad !== nothing && y.grad !== nothing
    zero_grad!(t)
    @test all(n.grad === nothing for n in t.nodes)
    backward!(t, y)
    @test x.grad.data == [4.0]
end

# @id TEST-TAPE-009 @verifies REQ-TAPE-009
@testset "TEST-TAPE-009 no_grad mode" begin
    t = Tape()
    x = leaf(t, scal(2))
    n = length(t.nodes)
    r = no_grad(t) do
        mul2(t, x, x)
    end
    @test !r.requires_grad
    @test length(t.nodes) == n
    @test r.value.data == [4.0]
    @test t.grad_enabled
    @test_throws ErrorException no_grad(() -> error("boom"), t)
    @test t.grad_enabled
    y = mul2(t, x, x)
    @test y.requires_grad && length(t.nodes) == n + 1
end

# @id TEST-TAPE-010 @verifies REQ-TAPE-010
@testset "TEST-TAPE-010 detach" begin
    t = Tape()
    x = leaf(t, scal(2)); y = mul2(t, x, x)
    d = detach(y)
    @test !d.requires_grad
    @test isempty(d.parents)
    @test d.value.data == y.value.data
    d.value.data[1] = 99.0
    @test y.value.data == [4.0]
    @test d.grad === nothing
end

# @id TEST-TAPE-011 @verifies REQ-TAPE-011
@testset "TEST-TAPE-011 reset!" begin
    t = Tape()
    x = leaf(t, scal(2)); e0 = t.epoch
    reset!(t)
    @test isempty(t.nodes)
    @test t.epoch == e0 + 1
    @test_throws ArgumentError mul2(t, x, x)
    z = leaf(t, scal(1))
    @test z.id == 1
end

# @id TEST-TAPE-012 @verifies REQ-TAPE-012
@testset "TEST-TAPE-012 gradient shape invariant" begin
    t = Tape()
    x = leaf(t, Tensor([1.0, 2.0], (2,)))
    bad = record!(t, Tensor([3.0], ()), [x], G -> [scal(1)])
    @test_throws DimensionMismatch backward!(t, bad)
    t2 = Tape()
    a = leaf(t2, Tensor([1.0, 2.0], (2,)))
    s = record!(t2, Tensor([3.0], ()), [a], G -> [Tensor([1.0, 1.0], (2,))])
    backward!(t2, s)
    @test size_t(a.grad) == (2,)
    @test size_t(s.grad) == ()
end

# @id TEST-TAPE-013 @verifies REQ-TAPE-013
@testset "TEST-TAPE-013 tape_of" begin
    t = Tape()
    x = leaf(t, scal(2)); y = mul2(t, x, x)
    @test tape_of(x) === t && tape_of(y) === t
    @test tape_of(detach(y)) === nothing
    r = no_grad(t) do
        mul2(t, x, x)
    end
    @test tape_of(r) === nothing
    reset!(t)
    @test tape_of(x) === nothing
    @test tape_of(leaf(t, scal(1))) === t
end

end
