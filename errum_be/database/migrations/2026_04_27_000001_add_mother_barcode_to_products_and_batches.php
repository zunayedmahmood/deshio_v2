<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('barcode')->nullable()->unique()->after('sku')->index();
        });

        Schema::table('product_batches', function (Blueprint $table) {
            $table->string('mother_barcode')->nullable()->after('barcode_id')->index();
        });
        
        Schema::table('order_items', function (Blueprint $table) {
            $table->string('mother_barcode')->nullable()->after('product_barcode_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('barcode');
        });

        Schema::table('product_batches', function (Blueprint $table) {
            $table->dropColumn('mother_barcode');
        });
        
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('mother_barcode');
        });
    }
};
