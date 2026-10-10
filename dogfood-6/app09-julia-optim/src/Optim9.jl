module Optim9
include("sparse.jl")
include("lu.jl")
include("result.jl")
include("newton.jl")
include("gradient.jl")
using .SparseOps, .LU, .Results, .Newton, .Gradient
export SparseOps, LU, Results, Newton, Gradient
end
