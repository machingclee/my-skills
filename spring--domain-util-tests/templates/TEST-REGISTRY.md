# TEST-REGISTRY — sales

Command tests:

| TEST-ID | Command | Event(s) | Test method | Verifies |
|---------|---------|----------|-------------|----------|
| SL-001 | CalculateFinalPriceCommand | FinalPriceCalculatedEvent | sl001_calculateFinalPrice_recomputesFromHandlingFeesAndEmitsEvent | event emitted with success=true, DTO non-null, finalPrice = orginalPrice + sum of handlingFees matches entity (1000 + 200 + 50 = 1250) |
| SL-002 | CancelOrderCommand | (none — handler defect) | sl002_cancelOrder_failsAndRollsBackWhenCancelledStatusRemarkMissing | handler never sets SellingStatusTransactionCancelled.remark (NOT NULL) so invoke throws, transaction rolls back, no OrderCancelledEvent row |
| SL-003 | CreateCarModelAnnotationCommand | CarModelAnnotationCreatedEvent | sl003_createCarModelAnnotation_emitsEventAndReturnsDto; sl003_createCarModelAnnotation_skipEventEmitsNothing | event emitted + returned DTO fully populated; skipEvent=true means no CarModelAnnotationCreatedEvent row |
| SL-004 | CreateCarSalesItemCommand | (NO domain event) | sl004_createCarSalesItem_persistsItemAndEmitsNoDomainEvent | SellingSalesItem + SellingCar persisted via createCarItem; event table contains ONLY the command audit row |

Policy invariant tests:

| TEST-ID | Invariant (method) | Trigger event | Test method | Verifies |
|---------|--------------------|---------------|-------------|----------|
| SL-P01 | salesItemDeletionInvariant | SalesItemDeletedEvent | slP01_deleteSalesItemWithoutOffers_succeeds; slP01_deleteSalesItemWithExistingOffer_rejectedAndRollsBack | delete item with no offer succeeds; with existing offer the invariant throws, transaction rolls back, event row marked failed |
