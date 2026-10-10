| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | money | | Decimal rounding |
| 2 | posting | money | Atomic idempotent journals |
| 3 | fx | posting,money | Currency bridges |
| 4 | period | posting | Month lifecycle |
| 5 | recon | posting,money | Bank matching |
