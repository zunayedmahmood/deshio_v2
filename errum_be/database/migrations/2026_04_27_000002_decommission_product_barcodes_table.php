<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Decommissions the legacy unit-level barcode tracking system.
     */
    public function up(): void
    {
        // 1. Drop foreign keys and columns referencing product_barcodes
        
        // Product Batches
        if (Schema::hasColumn('product_batches', 'barcode_id')) {
            Schema::table('product_batches', function (Blueprint $table) {
                // Check if the foreign key exists before dropping
                $table->dropForeign(['barcode_id']);
                $table->dropColumn('barcode_id');
            });
        }

        // Defective Products
        if (Schema::hasColumn('defective_products', 'product_barcode_id')) {
            Schema::table('defective_products', function (Blueprint $table) {
                $table->dropForeign(['product_barcode_id']);
                $table->dropColumn('product_barcode_id');
            });
        }

        // Product Movements
        if (Schema::hasColumn('product_movements', 'product_barcode_id')) {
            Schema::table('product_movements', function (Blueprint $table) {
                $table->dropForeign(['product_barcode_id']);
                $table->dropColumn('product_barcode_id');
            });
        }

        // Order Items
        if (Schema::hasColumn('order_items', 'product_barcode_id')) {
            Schema::table('order_items', function (Blueprint $table) {
                $table->dropForeign(['product_barcode_id']);
                $table->dropColumn('product_barcode_id');
            });
        }

        // Product Dispatch Items (Missing in previous version)
        if (Schema::hasColumn('product_dispatch_items', 'product_barcode_id')) {
            Schema::table('product_dispatch_items', function (Blueprint $table) {
                $table->dropForeign(['product_barcode_id']);
                $table->dropColumn('product_barcode_id');
            });
        }

        // 2. Drop the pivot table for dispatch scanning
        Schema::dropIfExists('product_dispatch_item_barcodes');

        // 3. Final step: Decommission the main product_barcodes table
        // We're keeping the table for now to avoid integrity constraint violations
        // from any missed dependencies, as per user suggestion. 
        // Logic-wise, it is no longer used by the application.
        // Schema::dropIfExists('product_barcodes');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Reverse is not supported for this decommissioning migration
        // as individual barcode data is being fundamentally removed.
    }
};
