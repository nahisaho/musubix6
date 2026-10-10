| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | money | | foundation |
| 2 | orders | money | state machine |
| 3 | tax | money | |
| 4 | discounts | money, orders | |
| 5 | coupons | discounts, money | |
| 6 | engine | money, orders, discounts, coupons, tax | integration |
