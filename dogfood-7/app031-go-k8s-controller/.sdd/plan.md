| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | cache | - | informer store |
| 2 | queue | - | work scheduling |
| 3 | leader | - | lease fencing |
| 4 | finalizer | - | cleanup lifecycle |
| 5 | runtime | cache, queue, leader, finalizer | controller integration |
