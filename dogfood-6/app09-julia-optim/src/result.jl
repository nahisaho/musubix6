module Results
export Result

# @id CODE-NEWTON-002 @implements REQ-NEWTON-002
struct Result
    x::Vector{Float64}
    status::Symbol
    iterations::Int
    residual::Float64
    history::Vector{Float64}
end
end
