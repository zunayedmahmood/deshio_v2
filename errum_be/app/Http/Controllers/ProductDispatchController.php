<?php

namespace App\Http\Controllers;

use App\Models\ProductDispatch;
use App\Models\ProductDispatchItem;
use App\Models\ProductBatch;
use App\Models\Store;
use App\Models\Employee;
use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ProductDispatchController extends Controller
{
    use DatabaseAgnosticSearch;

    /**
     * Treat these statuses as "received/available at destination".
     * Your system uses multiple "available-ish" statuses.
     */
    private function receivedStatuses(): array
    {
        return ['available', 'in_warehouse', 'in_shop', 'on_display'];
    }

    /**
     * Ground-truth received count:
     * Count scanned barcodes that are currently at destination store
     * AND in received/available statuses.
     */
    private function countReceivedAtDestination(ProductDispatch $dispatch, ProductDispatchItem $item): int
    {
        return $item->received_quantity ?? 0;
    }

    /**
     * List all dispatches with filters
     *
     * GET /api/dispatches
     */
    public function index(Request $request)
    {
        $query = ProductDispatch::with([
            'sourceStore',
            'destinationStore',
            'createdBy',
            'approvedBy',
            'items.batch.product'
        ]);

        // Filter by status
        if ($request->filled('status')) {
            switch ($request->status) {
                case 'pending':
                    $query->pending();
                    break;
                case 'in_transit':
                    $query->inTransit();
                    break;
                case 'delivered':
                    $query->delivered();
                    break;
                case 'cancelled':
                    $query->cancelled();
                    break;
                case 'overdue':
                    $query->overdue();
                    break;
                case 'expected_today':
                    $query->expectedToday();
                    break;
            }
        }

        // Filter by store
        if ($request->filled('source_store_id')) {
            $query->bySourceStore($request->source_store_id);
        }

        if ($request->filled('destination_store_id')) {
            $query->byDestinationStore($request->destination_store_id);
        }

        // Search by dispatch number
        if ($request->filled('search')) {
            $this->whereLike($query, 'dispatch_number', $request->search);
        }

        // Date range filter
        if ($request->filled('date_from')) {
            $query->where('dispatch_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->where('dispatch_date', '<=', $request->date_to);
        }

        // Sort
        $sortBy = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $dispatches = $query->paginate($request->input('per_page', 20));

        $formattedDispatches = [];
        foreach ($dispatches as $dispatch) {
            $formattedDispatches[] = $this->formatDispatchResponse($dispatch);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'current_page' => $dispatches->currentPage(),
                'data' => $formattedDispatches,
                'first_page_url' => $dispatches->url(1),
                'from' => $dispatches->firstItem(),
                'last_page' => $dispatches->lastPage(),
                'last_page_url' => $dispatches->url($dispatches->lastPage()),
                'next_page_url' => $dispatches->nextPageUrl(),
                'path' => $dispatches->path(),
                'per_page' => $dispatches->perPage(),
                'prev_page_url' => $dispatches->previousPageUrl(),
                'to' => $dispatches->lastItem(),
                'total' => $dispatches->total(),
            ]
        ]);
    }

    /**
     * Get specific dispatch details
     *
     * GET /api/dispatches/{id}
     */
    public function show($id)
    {
        $dispatch = ProductDispatch::with([
            'sourceStore',
            'destinationStore',
            'createdBy',
            'approvedBy',
            'items.batch.product',
        ])->find($id);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $this->formatDispatchResponse($dispatch, true)
        ]);
    }

    /**
     * Create new dispatch
     *
     * POST /api/dispatches
     */
    public function create(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'source_store_id' => 'required|exists:stores,id',
            'destination_store_id' => 'required|exists:stores,id|different:source_store_id',
            'expected_delivery_date' => 'nullable|date|after_or_equal:today',
            'carrier_name' => 'nullable|string',
            'tracking_number' => 'nullable|string',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.batch_id' => 'required|exists:product_batches,id',
            'items.*.quantity' => 'required|integer|min:1',
            'draft_scan_history' => 'nullable|array',
            'draft_scan_history.*.barcode' => 'required|string',
            'draft_scan_history.*.batch_id' => 'required|exists:product_batches,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // --- IDEMPOTENCY CHECK ---
        // Check for duplicate dispatch created by same user in last 10 seconds with same source/destination
        $recentDispatch = ProductDispatch::where('created_by', Auth::id())
            ->where('source_store_id', $request->source_store_id)
            ->where('destination_store_id', $request->destination_store_id)
            ->where('created_at', '>=', now()->subSeconds(10))
            ->first();

        if ($recentDispatch) {
            // Further check if items match
            $recentItems = $recentDispatch->items()->pluck('quantity', 'product_batch_id')->toArray();
            $requestItems = [];
            foreach ($request->items as $item) {
                $requestItems[(int)$item['batch_id']] = (int)$item['quantity'];
            }

            if ($recentItems === $requestItems) {
                return response()->json([
                    'success' => true,
                    'message' => 'Dispatch already created recently (idempotency check)',
                    'data' => $this->formatDispatchResponse($recentDispatch->fresh([
                        'sourceStore',
                        'destinationStore',
                        'createdBy',
                        'items.batch.product'
                    ]), true)
                ], 200); // 200 OK since it already exists
            }
        }
        // -------------------------

        DB::beginTransaction();
        try {
            // 1. Create the Dispatch record
            $dispatch = ProductDispatch::create([
                'source_store_id' => $request->source_store_id,
                'destination_store_id' => $request->destination_store_id,
                'status' => 'pending',
                'expected_delivery_date' => $request->expected_delivery_date,
                'carrier_name' => $request->carrier_name,
                'tracking_number' => $request->tracking_number,
                'notes' => $request->notes,
                'created_by' => Auth::id(),
            ]);

            $batchToItemId = [];
            // 2. Add Items
            foreach ($request->items as $itemData) {
                $batch = ProductBatch::findOrFail($itemData['batch_id']);
                
                if ($batch->quantity < $itemData['quantity']) {
                    throw new \Exception("Insufficient quantity in batch {$batch->batch_number}. Available: {$batch->quantity}");
                }

                $item = $dispatch->addItem($batch, $itemData['quantity']);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch created successfully',
                'data' => $this->formatDispatchResponse($dispatch->fresh([
                    'sourceStore',
                    'destinationStore',
                    'createdBy',
                    'items.batch.product'
                ]), true)
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Scan barcode and add as new item if not exists, then attach barcode.
     *
     * POST /api/dispatches/{id}/scan-to-add
     */
    public function scanAndAddItem(Request $request, $id)
    {
        $dispatch = ProductDispatch::find($id);
        if (!$dispatch) {
            return response()->json(['success' => false, 'message' => 'Dispatch not found'], 404);
        }

        if (!in_array($dispatch->status, ['pending', 'pending_approval', 'approved'])) {
            return response()->json(['success' => false, 'message' => 'Cannot add items to this dispatch in its current status'], 422);
        }

        $validator = Validator::make($request->all(), [
            'barcode' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $scanResult = \App\Models\Product::scanBarcode($request->barcode);
        if (!$scanResult['found']) {
            return response()->json(['success' => false, 'message' => 'Barcode not found'], 404);
        }

        $product = $scanResult['product'];
        
        // Find or Create Dispatch Item for the appropriate batch at the source store
        $batch = ProductBatch::where('product_id', $product->id)
            ->where('store_id', $dispatch->source_store_id)
            ->where('quantity', '>', 0)
            ->first();

        if (!$batch) {
            return response()->json(['success' => false, 'message' => 'No available stock for this product at the source store'], 422);
        }

        DB::beginTransaction();
        try {
            $item = $dispatch->items()->where('product_batch_id', $batch->id)->first();
            
            if (!$item) {
                // Add new item with quantity 1
                $item = $dispatch->addItem($batch, 1);
            } else {
                // Increment scanned quantity
                $item->scanned_quantity = ($item->scanned_quantity ?? 0) + 1;
                if ($item->scanned_quantity > $item->quantity) {
                    $item->quantity = $item->scanned_quantity;
                }
                $item->save();
                $dispatch->updateTotals();
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Barcode added and scanned successfully',
                'data' => [
                    'dispatch_item_id' => $item->id,
                    'scanned_count' => $item->scanned_quantity ?? 0,
                    'required_quantity' => (int)$item->quantity,
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }



    /**
     * Add item to dispatch
     *
     * POST /api/dispatches/{id}/items
     */
    public function addItem(Request $request, $id)
    {
        $dispatch = ProductDispatch::find($id);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        if (!$dispatch->isPending()) {
            return response()->json([
                'success' => false,
                'message' => 'Can only add items to pending dispatches'
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'batch_id' => 'required|exists:product_batches,id',
            'quantity' => 'required|integer|min:1'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            $batch = ProductBatch::find($request->batch_id);

            // Validate batch belongs to source store
            if ($batch->store_id !== $dispatch->source_store_id) {
                throw new \Exception('Batch does not belong to the source store');
            }

            // Validate sufficient quantity
            if ($batch->quantity < $request->quantity) {
                throw new \Exception('Insufficient quantity in batch. Available: ' . $batch->quantity);
            }

            // Add the item
            $item = $dispatch->addItem($batch, $request->quantity);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Item added to dispatch successfully',
                'data' => [
                    'dispatch_item' => [
                        'id' => $item->id,
                        'product' => [
                            'id' => $batch->product->id,
                            'name' => $batch->product->name,
                            'sku' => $batch->product->sku,
                        ],
                        'batch_number' => $batch->batch_number,
                        'quantity' => $item->quantity,
                        'unit_cost' => number_format((float)$item->unit_cost, 2),
                        'unit_price' => number_format((float)$item->unit_price, 2),
                        'total_cost' => number_format((float)$item->total_cost, 2),
                        'total_value' => number_format((float)$item->total_value, 2),
                    ],
                    'dispatch_totals' => [
                        'total_items' => $dispatch->fresh()->total_items,
                        'total_cost' => number_format((float)$dispatch->fresh()->total_cost, 2),
                        'total_value' => number_format((float)$dispatch->fresh()->total_value, 2),
                    ]
                ]
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Remove item from dispatch
     *
     * DELETE /api/dispatches/{dispatchId}/items/{itemId}
     */
    public function removeItem($dispatchId, $itemId)
    {
        $dispatch = ProductDispatch::find($dispatchId);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        if (!$dispatch->isPending()) {
            return response()->json([
                'success' => false,
                'message' => 'Can only remove items from pending dispatches'
            ], 422);
        }

        $item = ProductDispatchItem::find($itemId);

        if (!$item) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch item not found'
            ], 404);
        }

        DB::beginTransaction();
        try {
            $dispatch->removeItem($item);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Item removed from dispatch successfully',
                'data' => [
                    'dispatch_totals' => [
                        'total_items' => $dispatch->fresh()->total_items,
                        'total_cost' => number_format((float)$dispatch->fresh()->total_cost, 2),
                        'total_value' => number_format((float)$dispatch->fresh()->total_value, 2),
                    ]
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Approve a dispatch
     *
     * PATCH /api/dispatches/{id}/approve
     */
    public function approve($id)
    {
        $dispatch = ProductDispatch::find($id);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        if (!$dispatch->canBeApproved()) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch cannot be approved in its current state'
            ], 422);
        }

        // Check if dispatch has items
        if ($dispatch->items()->count() === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot approve dispatch without items'
            ], 422);
        }

        DB::beginTransaction();
        try {
            $employee = Employee::find(Auth::id());
            $dispatch->approve($employee);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch approved successfully',
                'data' => $this->formatDispatchResponse($dispatch->fresh([
                    'sourceStore',
                    'destinationStore',
                    'createdBy',
                    'approvedBy',
                    'items.batch.product'
                ]), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Mark dispatch as in transit (dispatched)
     *
     * PATCH /api/dispatches/{id}/dispatch
     */
    public function markDispatched($id)
    {
        $dispatch = ProductDispatch::find($id);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        if (!$dispatch->canBeDispatched()) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch cannot be sent in its current state. Ensure it is approved first.'
            ], 422);
        }

        DB::beginTransaction();
        try {
            $dispatch->dispatch();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch marked as in transit successfully',
                'data' => $this->formatDispatchResponse($dispatch->fresh([
                    'sourceStore',
                    'destinationStore',
                    'createdBy',
                    'approvedBy',
                    'items.batch.product'
                ]), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Scan barcode for a dispatch item at SOURCE STORE
     * This should be done BEFORE marking dispatch as in_transit (sending)
     *
     * POST /api/dispatches/{id}/items/{itemId}/scan-barcode
     * Body: { "barcode": "8801234567890" }
     */
    public function scanBarcode(Request $request, $dispatchId, $itemId)
    {
        $dispatch = ProductDispatch::find($dispatchId);

        if (!$dispatch) {
            return response()->json(['success' => false, 'message' => 'Dispatch not found'], 404);
        }

        if (!in_array($dispatch->status, ['pending', 'in_transit'])) {
            return response()->json(['success' => false, 'message' => 'Barcodes can only be scanned for pending or in-transit dispatches'], 422);
        }

        $item = ProductDispatchItem::where('id', $itemId)->where('product_dispatch_id', $dispatchId)->first();

        if (!$item) {
            return response()->json(['success' => false, 'message' => 'Dispatch item not found'], 404);
        }

        $validator = Validator::make($request->all(), ['barcode' => 'required|string']);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        if ($request->barcode !== $item->batch->product->barcode) {
            return response()->json(['success' => false, 'message' => 'Barcode does not match the product for this dispatch item'], 422);
        }

        if (($item->scanned_quantity ?? 0) >= $item->quantity) {
            return response()->json(['success' => false, 'message' => "All required items have already been scanned ({$item->quantity} of {$item->quantity})"], 422);
        }

        DB::beginTransaction();
        try {
            $item->scanned_quantity = ($item->scanned_quantity ?? 0) + 1;
            $item->save();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Barcode scanned successfully. {$item->scanned_quantity} of {$item->quantity} items scanned.",
                'data' => [
                    'scanned_count' => $item->scanned_quantity,
                    'required_quantity' => (int)$item->quantity,
                    'remaining_count' => (int)$item->quantity - $item->scanned_quantity,
                    'all_scanned' => $item->scanned_quantity >= $item->quantity,
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Get scanned barcodes for a dispatch item
     *
     * GET /api/dispatches/{id}/items/{itemId}/scanned-barcodes
     */
    public function getScannedBarcodes($dispatchId, $itemId)
    {
        $item = ProductDispatchItem::where('id', $itemId)->where('product_dispatch_id', $dispatchId)->first();

        if (!$item) {
            return response()->json(['success' => false, 'message' => 'Dispatch item not found'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'dispatch_item_id' => $item->id,
                'required_quantity' => $item->quantity,
                'scanned_count' => $item->scanned_quantity ?? 0,
                'remaining_count' => max(0, $item->quantity - ($item->scanned_quantity ?? 0)),
            ]
        ]);
    }

    /**
     * Scan barcode when RECEIVING dispatch at destination store
     *
     * POST /api/dispatches/{dispatchId}/items/{itemId}/receive-barcode
     * Body: { "barcode": "8801234567890" }
     */
    public function receiveBarcode(Request $request, $dispatchId, $itemId)
    {
        $dispatch = ProductDispatch::find($dispatchId);

        if (!$dispatch) {
            return response()->json(['success' => false, 'message' => 'Dispatch not found'], 404);
        }

        if ($dispatch->status !== 'in_transit') {
            return response()->json(['success' => false, 'message' => 'Items can only be received for in-transit dispatches'], 422);
        }

        $item = ProductDispatchItem::where('id', $itemId)
            ->where('product_dispatch_id', $dispatchId)
            ->first();

        if (!$item) {
            return response()->json(['success' => false, 'message' => 'Dispatch item not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'barcode' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        // Verify the barcode is the mother barcode for this product
        if ($request->barcode !== $item->batch->product->barcode) {
            return response()->json(['success' => false, 'message' => 'Barcode does not match the product for this dispatch item'], 422);
        }

        // Check if we've already received all items
        if (($item->received_quantity ?? 0) >= $item->quantity) {
            return response()->json(['success' => false, 'message' => 'All items for this dispatch item have already been received'], 422);
        }

        DB::beginTransaction();
        try {
            $item->received_quantity = ($item->received_quantity ?? 0) + 1;
            $item->save();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Barcode received successfully',
                'data' => [
                    'received_count' => $item->received_quantity,
                    'total_sent' => $item->quantity,
                    'remaining_count' => max(0, $item->quantity - $item->received_quantity),
                    'all_received' => $item->received_quantity >= $item->quantity,
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Get received status for a dispatch item
     *
     * GET /api/dispatches/{dispatchId}/items/{itemId}/received-status
     */
    public function getReceivedStatus($dispatchId, $itemId)
    {
        $item = ProductDispatchItem::where('id', $itemId)->where('product_dispatch_id', $dispatchId)->first();

        if (!$item) {
            return response()->json(['success' => false, 'message' => 'Dispatch item not found'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'dispatch_item_id' => $item->id,
                'total_sent' => $item->quantity,
                'received_count' => $item->received_quantity ?? 0,
                'pending_count' => max(0, $item->quantity - ($item->received_quantity ?? 0)),
            ]
        ]);
    }

    /**
     * Mark dispatch as delivered
     * This processes inventory movements
     *
     * PATCH /api/dispatches/{id}/deliver
     */
    public function markDelivered(Request $request, $id)
    {
        $dispatch = ProductDispatch::find($id);

        if (!$dispatch) {
            return response()->json(['success' => false, 'message' => 'Dispatch not found'], 404);
        }

        if (!$dispatch->canBeDelivered()) {
            return response()->json(['success' => false, 'message' => 'Dispatch cannot be delivered in its current state'], 422);
        }

        $validator = Validator::make($request->all(), [
            'items' => 'array',
            'items.*.item_id' => 'required|exists:product_dispatch_items,id',
            'items.*.received_quantity' => 'required|integer|min:0',
            'items.*.damaged_quantity' => 'integer|min:0',
            'items.*.missing_quantity' => 'integer|min:0'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Validate that all dispatch items have been scanned at source
            foreach ($dispatch->items as $item) {
                if (($item->scanned_quantity ?? 0) < $item->quantity) {
                    throw new \Exception("Cannot deliver: Item {$item->batch->product->name} has not been fully scanned at source.");
                }
            }

            // Update item statuses if provided
            if ($request->filled('items')) {
                foreach ($request->items as $itemData) {
                    $item = ProductDispatchItem::find($itemData['item_id']);
                    if ($item && $item->product_dispatch_id == $dispatch->id) {
                        $item->markAsReceived(
                            $itemData['received_quantity'],
                            $itemData['damaged_quantity'] ?? 0,
                            $itemData['missing_quantity'] ?? 0
                        );
                    }
                }
            }

            // Mark as delivered and process inventory movements (batches and movements)
            $dispatch->deliver();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch delivered successfully',
                'data' => $this->formatDispatchResponse($dispatch->fresh([
                    'sourceStore',
                    'destinationStore',
                    'createdBy',
                    'approvedBy',
                    'items.batch.product'
                ]), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Cancel a dispatch
     *
     * PATCH /api/dispatches/{id}/cancel
     */
    public function cancel($id)
    {
        $dispatch = ProductDispatch::find($id);

        if (!$dispatch) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch not found'
            ], 404);
        }

        DB::beginTransaction();
        try {
            $dispatch->cancel();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch cancelled successfully',
                'data' => $this->formatDispatchResponse($dispatch->fresh([
                    'sourceStore',
                    'destinationStore',
                    'createdBy',
                    'approvedBy'
                ]), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Get dispatch statistics
     *
     * GET /api/dispatches/statistics
     */
    public function getStatistics(Request $request)
    {
        $storeId = $request->input('store_id');

        $query = ProductDispatch::query();

        if ($storeId) {
            $query->where(function ($q) use ($storeId) {
                $q->where('source_store_id', $storeId)
                    ->orWhere('destination_store_id', $storeId);
            });
        }

        $stats = [
            'total_dispatches' => $query->count(),
            'pending' => (clone $query)->pending()->count(),
            'in_transit' => (clone $query)->inTransit()->count(),
            'delivered' => (clone $query)->delivered()->count(),
            'cancelled' => (clone $query)->cancelled()->count(),
            'overdue' => (clone $query)->overdue()->count(),
            'expected_today' => (clone $query)->expectedToday()->count(),
            'total_value_in_transit' => (clone $query)->inTransit()->sum('total_value'),
        ];

        return response()->json([
            'success' => true,
            'data' => $stats
        ]);
    }

    /**
     * Helper function to format dispatch response
     */
    private function formatDispatchResponse(ProductDispatch $dispatch, $detailed = false)
    {
        $response = [
            'id' => $dispatch->id,
            'dispatch_number' => $dispatch->dispatch_number,
            'status' => $dispatch->status,
            'delivery_status' => $dispatch->delivery_status,
            'source_store' => [
                'id' => $dispatch->sourceStore->id,
                'name' => $dispatch->sourceStore->name,
            ],
            'destination_store' => [
                'id' => $dispatch->destinationStore->id,
                'name' => $dispatch->destinationStore->name,
            ],
            'dispatch_date' => $dispatch->dispatch_date->format('Y-m-d H:i:s'),
            'expected_delivery_date' => $dispatch->expected_delivery_date?->format('Y-m-d'),
            'actual_delivery_date' => $dispatch->actual_delivery_date?->format('Y-m-d H:i:s'),
            'is_overdue' => $dispatch->isOverdue(),
            'carrier_name' => $dispatch->carrier_name,
            'tracking_number' => $dispatch->tracking_number,
            'total_items' => $dispatch->total_items,
            'total_cost' => number_format((float)$dispatch->total_cost, 2),
            'total_value' => number_format((float)$dispatch->total_value, 2),
            'created_by' => $dispatch->createdBy ? [
                'id' => $dispatch->createdBy->id,
                'name' => $dispatch->createdBy->name,
            ] : null,
            'approved_by' => $dispatch->approvedBy ? [
                'id' => $dispatch->approvedBy->id,
                'name' => $dispatch->approvedBy->name,
            ] : null,
            'approved_at' => $dispatch->approved_at?->format('Y-m-d H:i:s'),
            'created_at' => $dispatch->created_at->format('Y-m-d H:i:s'),
        ];

        if ($detailed) {
            $response['notes'] = $dispatch->notes;
            $response['metadata'] = $dispatch->metadata;
            $response['items'] = $dispatch->items->map(function ($item) {
                $itemData = [
                    'id' => $item->id,
                    'product' => [
                        'id' => $item->batch->product->id,
                        'name' => $item->batch->product->name,
                        'sku' => $item->batch->product->sku,
                    ],
                    'batch' => [
                        'id' => $item->batch->id,
                        'batch_number' => $item->batch->batch_number,
                        'barcode' => $item->batch->barcode?->barcode,
                    ],
                    'quantity' => $item->quantity,
                    'received_quantity' => $item->received_quantity,
                    'damaged_quantity' => $item->damaged_quantity,
                    'missing_quantity' => $item->missing_quantity,
                    'status' => $item->status,
                    'unit_cost' => number_format((float)$item->unit_cost, 2),
                    'unit_price' => number_format((float)$item->unit_price, 2),
                    'total_cost' => number_format((float)$item->total_cost, 2),
                    'total_value' => number_format((float)$item->total_value, 2),
                ];

                // Add barcode scanning status
                $itemData['barcode_scanning'] = [
                    'required_quantity' => $item->quantity,
                    'scanned_count' => $item->scanned_quantity ?? 0,
                    'remaining_count' => max(0, $item->quantity - ($item->scanned_quantity ?? 0)),
                    'all_scanned' => ($item->scanned_quantity ?? 0) >= $item->quantity,
                    'progress_percentage' => $item->quantity > 0 ? round((($item->scanned_quantity ?? 0) / $item->quantity) * 100, 2) : 0,
                ];

                return $itemData;
            });
        }

        return $response;
    }

    /**
     * Get dispatches pending shipment creation (for Pathao delivery)
     *
     * GET /api/dispatches/pending-shipment
     */
    public function getPendingShipment(Request $request)
    {
        $query = ProductDispatch::with([
            'sourceStore',
            'destinationStore',
            'customer',
            'order',
            'items.batch.product'
        ])->pendingPathaoShipment();

        // Filter by destination store (warehouse)
        if ($request->filled('warehouse_id')) {
            $query->byDestinationStore($request->warehouse_id);
        }

        $dispatches = $query->orderBy('actual_delivery_date', 'desc')->get();

        return response()->json([
            'success' => true,
            'message' => count($dispatches) . ' dispatches pending shipment creation',
            'data' => $dispatches->map(function ($dispatch) {
                return [
                    'id' => $dispatch->id,
                    'dispatch_number' => $dispatch->dispatch_number,
                    'source_store' => $dispatch->sourceStore->name,
                    'warehouse' => $dispatch->destinationStore->name,
                    'customer' => [
                        'id' => $dispatch->customer->id,
                        'name' => $dispatch->customer->name,
                        'phone' => $dispatch->customer->phone,
                    ],
                    'order' => [
                        'id' => $dispatch->order->id,
                        'order_number' => $dispatch->order->order_number,
                        'total_amount' => $dispatch->order->total_amount,
                    ],
                    'delivery_info' => $dispatch->getCustomerDeliveryInfo(),
                    'items_count' => $dispatch->items->count(),
                    'total_value' => $dispatch->total_value,
                    'delivered_at' => $dispatch->actual_delivery_date?->format('Y-m-d H:i:s'),
                    'notes' => $dispatch->notes,
                ];
            })
        ]);
    }

    /**
     * Create shipment from dispatch
     *
     * POST /api/dispatches/{id}/create-shipment
     */
    public function createShipment($id, Request $request)
    {
        $dispatch = ProductDispatch::with(['customer', 'order', 'destinationStore'])->findOrFail($id);

        if (!$dispatch->isReadyForShipment()) {
            return response()->json([
                'success' => false,
                'message' => 'Dispatch is not ready for shipment creation. Status: ' . $dispatch->status . ', For Pathao: ' . ($dispatch->for_pathao_delivery ? 'Yes' : 'No') . ', Has Shipment: ' . ($dispatch->hasShipment() ? 'Yes' : 'No')
            ], 400);
        }

        DB::beginTransaction();
        try {
            $shipment = $dispatch->createShipmentForDelivery();

            // Optionally send to Pathao immediately
            if ($request->boolean('send_to_pathao')) {
                // Call ShipmentController's sendToPathao method
                $shipmentController = new \App\Http\Controllers\ShipmentController();
                $shipmentController->sendToPathao($shipment);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Shipment created successfully' . ($request->boolean('send_to_pathao') ? ' and sent to Pathao' : ''),
                'data' => [
                    'dispatch' => $this->formatDispatchResponse($dispatch->fresh(), true),
                    'shipment' => $shipment->load(['order', 'customer', 'store'])
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create shipment: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Bulk create shipments from multiple dispatches
     *
     * POST /api/dispatches/bulk-create-shipment
     */
    public function bulkCreateShipment(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'dispatch_ids' => 'required|array|min:1',
            'dispatch_ids.*' => 'exists:product_dispatches,id',
            'send_to_pathao' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $results = [
            'success' => [],
            'failed' => [],
        ];

        $dispatches = ProductDispatch::with(['customer', 'order', 'destinationStore'])
            ->whereIn('id', $request->dispatch_ids)
            ->get();

        foreach ($dispatches as $dispatch) {
            try {
                if (!$dispatch->isReadyForShipment()) {
                    $results['failed'][] = [
                        'dispatch_id' => $dispatch->id,
                        'dispatch_number' => $dispatch->dispatch_number,
                        'reason' => 'Not ready for shipment creation'
                    ];
                    continue;
                }

                DB::beginTransaction();

                $shipment = $dispatch->createShipmentForDelivery();

                // Optionally send to Pathao
                if ($request->boolean('send_to_pathao')) {
                    $shipmentController = new \App\Http\Controllers\ShipmentController();
                    $shipmentController->sendToPathao($shipment);
                }

                DB::commit();

                $results['success'][] = [
                    'dispatch_id' => $dispatch->id,
                    'dispatch_number' => $dispatch->dispatch_number,
                    'shipment_id' => $shipment->id,
                    'shipment_number' => $shipment->shipment_number,
                    'pathao_consignment_id' => $shipment->pathao_consignment_id
                ];

            } catch (\Exception $e) {
                DB::rollBack();
                $results['failed'][] = [
                    'dispatch_id' => $dispatch->id,
                    'dispatch_number' => $dispatch->dispatch_number,
                    'reason' => $e->getMessage()
                ];
            }
        }

        return response()->json([
            'success' => true,
            'message' => count($results['success']) . ' shipments created successfully, ' . count($results['failed']) . ' failed',
            'data' => $results
        ]);
    }
}
