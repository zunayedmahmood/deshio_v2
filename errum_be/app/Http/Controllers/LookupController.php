<?php

namespace App\Http\Controllers;

use App\Models\ProductBarcode;
use App\Models\Order;
use App\Models\ProductBatch;
use App\Models\PurchaseOrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

class LookupController extends Controller
{
    /**
     * 1. PRODUCT LOOKUP BY BARCODE
     * 
     * Complete lifecycle history of a specific physical product unit:
     * - Purchase Order origin
     * - Initial warehouse/store receipt
     * - All dispatches & store-to-store transfers
     * - Sale records (which customer bought it)
     * - Return records (if returned, when, where)
     * - Re-sale records (if sold again after return)
     * - Defective product marking
     * - Complete activity log with timestamps
     */
    public function productLookup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'barcode' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        // Find the product using scanBarcode
        $scanResult = \App\Models\Product::scanBarcode($request->barcode);

        if (!$scanResult['found']) {
            return response()->json([
                'success' => false,
                'message' => $scanResult['message'] ?? 'Barcode not found'
            ], 404);
        }

        $product = $scanResult['product'];
        $barcodeInfo = [
            'barcode' => $scanResult['is_mother_barcode'] ? $product->barcode : $request->barcode,
            'is_mother_barcode' => $scanResult['is_mother_barcode'],
            'type' => $scanResult['is_mother_barcode'] ? 'mother' : 'unique',
        ];

        // 1. Product Information
        $productInfo = [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $product->name,
            'description' => $product->description,
            'brand' => $product->brand,
            'category' => $product->category ? [
                'id' => $product->category->id,
                'name' => $product->category->name,
            ] : null,
            'vendor' => $product->vendor ? [
                'id' => $product->vendor->id,
                'name' => $product->vendor->name,
                'company_name' => $product->vendor->company_name,
            ] : null,
        ];

        // 3. Current Location (from batches)
        $currentLocations = \App\Models\ProductBatch::where('product_id', $product->id)
            ->where('quantity', '>', 0)
            ->with('store')
            ->get()
            ->map(function($batch) {
                return [
                    'store_id' => $batch->store->id,
                    'store_name' => $batch->store->name,
                    'quantity' => $batch->quantity,
                    'batch_number' => $batch->batch_number,
                ];
            });

        // 4. Batch Information
        $batches = \App\Models\ProductBatch::where('product_id', $product->id)
            ->with('store')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function($batch) {
                return [
                    'id' => $batch->id,
                    'batch_number' => $batch->batch_number,
                    'quantity' => $batch->quantity,
                    'cost_price' => $batch->cost_price,
                    'sell_price' => $batch->sell_price,
                    'store' => $batch->store ? [
                        'id' => $batch->store->id,
                        'name' => $batch->store->name,
                    ] : null,
                ];
            });

        // 5. Purchase Order Origin - Enhanced with full PO and Vendor details
        $purchaseOrderOrigin = null;
        $purchaseOrderDetails = null;
        $vendorDetails = null;

        // Try to find PO through product_id (most recent received PO for this product)
        $poItem = PurchaseOrderItem::with(['purchaseOrder.vendor', 'purchaseOrder.store', 'purchaseOrder.createdBy'])
            ->where('product_id', $product->id)
            ->whereHas('purchaseOrder', function($q) {
                $q->whereIn('status', ['received', 'partially_received', 'approved']);
            })
            ->orderBy('created_at', 'desc')
            ->first();

        if ($poItem && $poItem->purchaseOrder) {
            $po = $poItem->purchaseOrder;
            
            $purchaseOrderDetails = [
                'id' => $po->id,
                'po_number' => $po->po_number,
                'order_date' => $po->order_date?->format('Y-m-d'),
                'expected_delivery_date' => $po->expected_delivery_date?->format('Y-m-d'),
                'status' => $po->status,
                'payment_status' => $po->payment_status,
                'total_amount' => $po->total_amount,
                'paid_amount' => $po->paid_amount,
                'outstanding_amount' => $po->outstanding_amount,
                'store' => $po->store ? [
                    'id' => $po->store->id,
                    'name' => $po->store->name,
                    'store_code' => $po->store->store_code,
                ] : null,
                'created_by' => $po->createdBy ? [
                    'id' => $po->createdBy->id,
                    'name' => $po->createdBy->name,
                ] : null,
                'item_details' => [
                    'quantity_ordered' => $poItem->quantity_ordered,
                    'quantity_received' => $poItem->quantity_received,
                    'unit_cost' => $poItem->unit_cost,
                    'unit_sell_price' => $poItem->unit_sell_price,
                    'total_cost' => $poItem->total_cost,
                    'receive_status' => $poItem->receive_status,
                ],
            ];

            // Full vendor details from PO
            if ($po->vendor) {
                $vendor = $po->vendor;
                $vendorDetails = [
                    'id' => $vendor->id,
                    'name' => $vendor->name,
                    'company_name' => $vendor->company_name,
                    'email' => $vendor->email,
                    'phone' => $vendor->phone,
                    'address' => $vendor->address,
                    'city' => $vendor->city,
                    'state' => $vendor->state,
                    'postal_code' => $vendor->postal_code,
                    'country' => $vendor->country,
                    'tax_id' => $vendor->tax_id,
                    'payment_terms' => $vendor->payment_terms,
                    'status' => $vendor->status,
                    'notes' => $vendor->notes,
                    'total_purchase_orders' => $vendor->purchaseOrders()->count(),
                    'total_purchase_amount' => $vendor->purchaseOrders()->sum('total_amount'),
                ];
            }

            // Update origin info if we have better data
            if (!$purchaseOrderOrigin) {
                $purchaseOrderOrigin = [
                    'po_number' => $po->po_number,
                    'received_date' => $po->received_at?->format('Y-m-d H:i:s'),
                    'source' => 'purchase_order',
                ];
            }
        }

        // 6. Get all activity history for this product
        $activityHistory = Activity::where('subject_type', 'App\\Models\\Product')
            ->where('subject_id', $product->id)
            ->with(['causer'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($activity) {
                return [
                    'id' => $activity->id,
                    'event' => $activity->event,
                    'description' => $activity->description,
                    'timestamp' => $activity->created_at->format('Y-m-d H:i:s'),
                    'human_time' => $activity->created_at->diffForHumans(),
                    'performed_by' => $activity->causer ? [
                        'id' => $activity->causer->id,
                        'type' => class_basename($activity->causer),
                        'name' => $activity->causer->name ?? $activity->causer->username ?? 'Unknown',
                    ] : null,
                    'changes' => $this->extractChanges($activity),
                ];
            });

        // 7. Get Sale Records (OrderItems for this product)
        $saleRecords = \App\Models\OrderItem::with(['order.customer', 'order.store'])
            ->where('product_id', $product->id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($item) {
                return [
                    'order_id' => $item->order_id,
                    'order_number' => $item->order->order_number,
                    'order_date' => $item->order->order_date?->format('Y-m-d H:i:s'),
                    'order_status' => $item->order->status,
                    'quantity' => $item->quantity,
                    'sale_price' => $item->unit_price,
                    'store' => $item->order->store ? [
                        'id' => $item->order->store->id,
                        'name' => $item->order->store->name,
                    ] : null,
                    'customer' => $item->order->customer ? [
                        'id' => $item->order->customer->id,
                        'name' => $item->order->customer->name,
                    ] : null,
                ];
            });

        // 8. Get Return Records
        $returnRecords = \App\Models\ProductReturn::with(['order', 'customer', 'store'])
            ->whereHas('order.items', function ($query) use ($product) {
                $query->where('product_id', $product->id);
            })
            ->get()
            ->map(function ($return) {
                return [
                    'return_id' => $return->id,
                    'return_number' => $return->return_number,
                    'return_date' => $return->return_date?->format('Y-m-d H:i:s'),
                    'return_reason' => $return->return_reason,
                    'status' => $return->status,
                    'refund_amount' => $return->total_refund_amount,
                ];
            });

        // 9. Get Dispatch Records
        $dispatchRecords = \App\Models\ProductDispatchItem::with([
            'dispatch.sourceStore',
            'dispatch.destinationStore'
        ])
        ->where('product_id', $product->id)
        ->get()
        ->map(function ($item) {
            return [
                'dispatch_number' => $item->dispatch->dispatch_number,
                'dispatch_date' => $item->dispatch->dispatch_date?->format('Y-m-d H:i:s'),
                'status' => $item->dispatch->status,
                'quantity' => $item->quantity,
                'from_store' => $item->dispatch->sourceStore->name ?? 'N/A',
                'to_store' => $item->dispatch->destinationStore->name ?? 'N/A',
            ];
        });

        // 10. Defective Product Records
        $defectiveRecords = \App\Models\DefectiveProduct::where('product_id', $product->id)
            ->with(['identifiedBy', 'store'])
            ->get()
            ->map(function ($defective) {
                return [
                    'quantity' => $defective->quantity,
                    'defect_reason' => $defective->defect_reason,
                    'status' => $defective->status,
                    'store' => $defective->store->name ?? 'N/A',
                    'identified_date' => $defective->identified_date?->format('Y-m-d H:i:s'),
                ];
            });

        // 11. Build complete lifecycle timeline
        $lifecycle = [
            [
                'stage' => 'origin',
                'title' => 'Product Recognition',
                'timestamp' => $product->created_at?->format('Y-m-d H:i:s'),
                'data' => $purchaseOrderOrigin,
            ],
            [
                'stage' => 'dispatches',
                'title' => 'Store Transfers',
                'count' => $dispatchRecords->count(),
                'data' => $dispatchRecords,
            ],
            [
                'stage' => 'sales',
                'title' => 'Sales History',
                'count' => $saleRecords->count(),
                'data' => $saleRecords,
            ],
            [
                'stage' => 'defective',
                'title' => 'Defective History',
                'count' => $defectiveRecords->count(),
                'data' => $defectiveRecords,
            ],
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'product' => $productInfo,
                'barcode' => $barcodeInfo,
                'current_locations' => $currentLocations,
                'batches' => $batches,
                'purchase_order_origin' => $purchaseOrderOrigin,
                'purchase_order' => $purchaseOrderDetails,
                'vendor' => $vendorDetails,
                'lifecycle' => $lifecycle,
                'activity_history' => $activityHistory,
                'summary' => [
                    'total_dispatches' => $dispatchRecords->count(),
                    'total_sales' => $saleRecords->count(),
                    'total_returns' => $returnRecords->count(),
                    'total_defective' => $defectiveRecords->sum('quantity'),
                    'has_purchase_order' => $purchaseOrderDetails !== null,
                ],
            ]
        ]);
    }

    /**
     * 2. ORDER LOOKUP
     */
    public function orderLookup(Request $request, $orderId)
    {
        $order = Order::with([
            'customer',
            'store',
            'items.product',
            'items.batch',
            'payments.paymentMethod',
            'shipments',
            'createdBy',
            'fulfilledBy'
        ])->find($orderId);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        // Order Items
        $orderItems = collect($order->items)->map(function ($item) {
            return [
                'item_id' => $item->id,
                'product' => [
                    'id' => $item->product->id,
                    'sku' => $item->product->sku,
                    'name' => $item->product_name,
                    'brand' => $item->product->brand,
                ],
                'batch' => $item->batch ? [
                    'id' => $item->batch->id,
                    'batch_number' => $item->batch->batch_number,
                ] : null,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'total_amount' => $item->total_amount,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'order' => $order,
                'items' => $orderItems,
                'summary' => [
                    'total_items' => count($order->items),
                    'is_fulfilled' => $order->fulfillment_status === 'fulfilled',
                    'is_paid' => $order->payment_status === 'paid',
                ],
            ]
        ]);
    }

    /**
     * 3. BATCH LOOKUP
     */
    public function batchLookup(Request $request, $batchId)
    {
        $batch = ProductBatch::with([
            'product.category',
            'product.vendor',
            'store'
        ])->find($batchId);

        if (!$batch) {
            return response()->json([
                'success' => false,
                'message' => 'Batch not found'
            ], 404);
        }

        // 1. Batch Information
        $batchInfo = [
            'id' => $batch->id,
            'batch_number' => $batch->batch_number,
            'quantity' => $batch->quantity,
            'cost_price' => $batch->cost_price,
            'sell_price' => $batch->sell_price,
            'created_at' => $batch->created_at?->format('Y-m-d H:i:s'),
        ];

        // 2. Product Information
        $productInfo = [
            'id' => $batch->product->id,
            'sku' => $batch->product->sku,
            'name' => $batch->product->name,
        ];

        // 3. Store Information
        $storeInfo = $batch->store ? [
            'id' => $batch->store->id,
            'name' => $batch->store->name,
        ] : null;

        // 4. Sales from this Batch
        $salesRecords = \App\Models\OrderItem::with(['order.customer', 'order.store'])
            ->where('product_batch_id', $batch->id)
            ->get()
            ->map(function ($item) {
                return [
                    'order_number' => $item->order->order_number,
                    'order_date' => $item->order->order_date?->format('Y-m-d H:i:s'),
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'total_amount' => $item->total_amount,
                    'customer' => $item->order->customer->name ?? 'N/A',
                ];
            });

        // 5. Dispatch Records
        $dispatchRecords = \App\Models\ProductDispatchItem::with([
            'dispatch.sourceStore',
            'dispatch.destinationStore'
        ])
        ->where('product_batch_id', $batch->id)
        ->get()
        ->map(function ($item) {
            return [
                'dispatch_number' => $item->dispatch->dispatch_number,
                'dispatch_date' => $item->dispatch->dispatch_date?->format('Y-m-d H:i:s'),
                'status' => $item->dispatch->status,
                'quantity' => $item->quantity,
                'from_store' => $item->dispatch->sourceStore->name ?? 'N/A',
                'to_store' => $item->dispatch->destinationStore->name ?? 'N/A',
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'batch' => $batchInfo,
                'product' => $productInfo,
                'store' => $storeInfo,
                'sales_records' => $salesRecords,
                'dispatch_records' => $dispatchRecords,
                'summary' => [
                    'current_stock' => $batch->quantity,
                    'total_sales' => $salesRecords->sum('quantity'),
                    'total_dispatches' => $dispatchRecords->sum('quantity'),
                ],
            ]
        ]);
    }

    /**
     * Helper method to extract before/after changes from activity
     */
    private function extractChanges($activity)
    {
        $changes = [];
        
        if ($activity->event === 'updated' && $activity->properties) {
            $old = $activity->properties['old'] ?? [];
            $new = $activity->properties['attributes'] ?? [];
            
            foreach ($new as $key => $value) {
                if (isset($old[$key]) && $old[$key] !== $value) {
                    $changes[$key] = [
                        'from' => $old[$key],
                        'to' => $value,
                    ];
                }
            }
        }
        
        return $changes;
    }
}
