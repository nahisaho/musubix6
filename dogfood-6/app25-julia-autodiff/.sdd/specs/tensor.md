---
feature: tensor
tier: T1
---
# tensor
Goal: dense column-major N-d Float64 tensor with NumPy-style broadcasting. Non-goals: views, non-Float64 dtypes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TENSOR-001 | When Tensor(data, shape) is built with prod(shape) == length(data), the system shall store a copy of data and numel/size shall report the shape. | TEST-TENSOR-001 |
| REQ-TENSOR-002 | If prod(shape) != length(data) or any dim < 1, then the system shall throw DimensionMismatch / ArgumentError respectively. | TEST-TENSOR-002 |
| REQ-TENSOR-003 | The system shall compute column-major strides_t(shape) so that stride[1]==1 and stride[k+1]==stride[k]*shape[k]. | TEST-TENSOR-003 |
| REQ-TENSOR-004 | When indexed with 1-based multi-index t[i,j,..], the system shall return the element at the column-major offset; out-of-range index shall throw BoundsError. | TEST-TENSOR-004 |
| REQ-TENSOR-005 | When reshape_t(t, shape) is called with at most one -1 entry, the system shall infer it; incompatible sizes shall throw DimensionMismatch; data order is preserved and the result does not alias the input. | TEST-TENSOR-005 |
| REQ-TENSOR-006 | When transpose_t is called on a 2-D tensor, the system shall swap axes; for non-2-D input it shall throw ArgumentError. | TEST-TENSOR-006 |
| REQ-TENSOR-007 | The system shall compute broadcast_shape(a,b) by right-aligning shapes where each pair is equal or one is 1; otherwise throw DimensionMismatch. | TEST-TENSOR-007 |
| REQ-TENSOR-008 | When add_t/sub_t/mul_t are applied, the system shall broadcast both operands to broadcast_shape and apply the op elementwise. | TEST-TENSOR-008 |
| REQ-TENSOR-009 | When matmul_t(a,b) is called on 2-D tensors with size(a,2)==size(b,1), the system shall return the matrix product; mismatch shall throw DimensionMismatch. | TEST-TENSOR-009 |
| REQ-TENSOR-010 | When sum_t(t; dims) is called, the system shall sum over the given 1-based axes (all axes if nothing), dropping them unless keepdims=true (kept as size 1). | TEST-TENSOR-010 |
| REQ-TENSOR-011 | When sum_to_shape(t, shape) is called with shape broadcast-compatible to size(t), the system shall sum the broadcast axes so the result has exactly shape; otherwise throw DimensionMismatch. | TEST-TENSOR-011 |
| REQ-TENSOR-012 | When map_t(f, t) is called, the system shall return a new tensor of the same shape with f applied elementwise and not mutate t. | TEST-TENSOR-012 |
