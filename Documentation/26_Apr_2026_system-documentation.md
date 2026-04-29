# System Documentation
## 1. High-Level Architecture
### 1.1 System Type
**Monolithic Laravel API Backend**: The system is a centralized Laravel-based API that manages e-commerce, social commerce, and multi-store retail operations. It follows the standard MVC pattern with a heavy emphasis on Services and Traits for shared logic. The architecture is designed for multi-tenancy at the store level, where users are scoped to specific branches.

### 1.2 Technology Stack Table
| Layer       | Technology     | Version  | Evidence File          |
|-------------|----------------|----------|------------------------|
| Backend     | Laravel        | 11.x (est)| Deshio_be/composer.json |
| Database    | MySQL / MariaDB| [UNRESOLVED] | Deshio_be/.env (inferred) |
| Auth        | Passport/Sanctum| [UNRESOLVED] | Deshio_be/routes/api.php |
| Background  | Laravel Jobs   | -        | Deshio_be/app/Jobs      |
| Logging     | ActivityLog    | 4.x      | ProductBarcode.php     |

### 1.3 Directory Tree
```
Deshio_be/
├── app/
│   ├── Console/Commands/ (CLI maintenance tools)
│   ├── Http/
│   │   ├── Controllers/ (Endpoint handlers)
│   │   ├── Middleware/ (Auth & Scoping)
│   │   └── Requests/ (Input validation)
│   ├── Models/ (Database entities)
│   ├── Observers/ (Model event listeners)
│   ├── Services/ (Business logic layers)
│   ├── Traits/ (Reusable code blocks)
│   └── Providers/ (Service bootstrapping)
├── config/ (System settings)
├── database/
│   ├── migrations/ (Schema history)
│   └── factories/ (Seed data logic)
└── routes/
    └── api.php (API endpoint definitions)
```

### 1.4 Entry Points
- `Deshio_be/public/index.php`: Entry for all HTTP traffic.
- `Deshio_be/app/Console/Kernel.php`: Entry for scheduled jobs and artisan commands.
- `Deshio_be/app/Providers/AppServiceProvider.php`: Global service registrations.

---

## 2. Feature Inventory (Full Breakdown)
### 2.1 Barcode & Unit Management (Strategic Unit Tracking)
- **Barcode Generation & Management**
    - **Unique Generation**: Ensures no collisions across the global product catalog (Deshio_be/app/Models/ProductBarcode.php:generateUniqueBarcode).
    - **Type Support**: CODE128 (standard), EAN13 (retail standard), and QR codes (for digital/extended tracking).
    - **Primary Barcode**: Each product has one primary barcode used for default identification.
- **Physical Lifecycle Tracking**
    - **Status: in_warehouse**: Unit is at the main distribution center.
    - **Status: in_shop / on_display**: Unit is at a retail branch, either in stock or on the floor.
    - **Status: in_transit**: Unit is moving between locations via a Dispatch.
    - **Status: with_customer**: Unit has been sold and delivered.
- **Reporting & Analytics**
    - **Barcode History**: Audit trail of every store transfer and status change.
    - **Location Statistics**: Grouped views by status, store, and product batch.

### 2.2 Order & Fulfillment (Multi-Channel)
- **POS / Counter Sales**
    - Real-time stock deduction.
    - Barcode scanning at the point of sale for immediate fulfillment.
- **Social Commerce & E-commerce Fulfillment**
    - **Remote Order Creation**: Orders created by staff or customers without specific barcode binding.
    - **Warehouse Scanning**: Physical units are scanned and "bound" to order items only when picking (Deshio_be/app/Http/Controllers/OrderController.php:fulfill).
    - **Batch Synchronization**: System aligns the order's batch with the physical unit scanned, ensuring accurate COGS.
- **Pathao Integration**
    - Automated shipment creation for delivered orders.
    - Tracking number synchronization.

### 2.3 Logistics & Store Operations
- **Inter-Store Dispatch**
    - Request -> Approval -> Dispatch -> Receive flow.
    - Mandatory scanning at both ends (Source and Destination) to ensure unit integrity.
- **Defective Product Flow**
    - Marking units as defective via barcode scan.
    - Tracking defect types (moderate/severe) and internal notes.
    - Removal from aggregate `ProductBatch` quantities upon marking.

---

## 3. Frontend Architecture
*[UNRESOLVED: This documentation pass focuses exclusively on the Backend architecture (Deshio_be) as per user instructions]*

---

## 4. Backend Architecture
### 4.1 Server / Runtime
- **Runtime**: PHP 8.2+
- **Framework**: Laravel 11.x
- **Infrastructure**: Designed for multi-store horizontal scaling.

### 4.2 Middleware Stack
| Order | Middleware Name | Purpose | File |
|-------|-----------------|---------|------|
| 1     | `api`           | Base API configuration | Kernel.php |
| 2     | `auth:api`      | Employee/Admin authentication | api.php |
| 3     | `throttle`      | Request rate limiting | api.php |
| 4     | `StoreScoping`  | [UNRESOLVED] Filters data by store_id for branch users | - |

### 4.3 Route Structure (Comprehensive)
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST   | `/api/barcodes/scan` | `ProductBarcodeController@scan` | Core unit identification |
| POST   | `/api/barcodes/generate` | `ProductBarcodeController@generate` | Unit creation |
| GET    | `/api/barcodes` | `ProductBarcodeController@index` | Searchable unit list |
| POST   | `/api/orders/{id}/fulfill` | `OrderController@fulfill` | Bind units to online orders |
| POST   | `/api/dispatches` | `ProductDispatchController@create` | Start unit transfer |
| POST   | `/api/dispatches/{id}/receive-barcode` | `ProductDispatchController@receiveBarcode` | Confirm transfer receipt |

### 4.4 Controllers
- **ProductBarcodeController**: Handlers for `index`, `generate`, `scan`, `batchScan`, `getHistory`.
- **OrderController**: The largest controller, managing `create`, `update`, `complete`, `cancel`, and `fulfill`.
- **ProductDispatchController**: Manages the complex 4-step logistics flow.
- **BarcodeLocationController**: Specialized API for tracking movements and location-based reporting.
- **StoreFulfillmentController**: Dedicated to the "Employee App" scanning experience for warehouse/store staff.

### 4.5 Model Mapping (Core Entities)
- **ProductBarcode**:
    - **Fields**: `barcode`, `current_status`, `current_store_id`, `is_defective`, `is_active`.
    - **Key Methods**: `updateLocation()`, `markSold()`, `markAsDefective()`.
- **OrderItem**:
    - **Fields**: `product_id`, `product_batch_id`, `product_barcode_id`, `quantity`, `cogs`.
    - **Logic**: Links a generic order request to a specific physical unit.
- **ProductMovement**:
    - **Fields**: `product_barcode_id`, `from_store_id`, `to_store_id`, `movement_type`.
    - **Logic**: The immutable ledger of unit history.
- **ProductBatch**:
    - **Fields**: `product_id`, `store_id`, `quantity`, `cost_price`, `sell_price`.
    - **Logic**: Manages the aggregate stock levels and financial values.

---

## 5. Data Flow (End-to-End)
### 5.1 Social Commerce Order Flow
1. **Inquiry**: Salesman creates Order via `OrderController@create`. Status: `pending_assignment`. No barcodes assigned.
2. **Assignment**: Order is assigned to a store (Status: `assigned_to_store`).
3. **Fulfillment**: Warehouse staff scans a physical barcode (`OrderController@fulfill`).
    - The `OrderItem` is updated with `product_barcode_id`.
    - If the scanned unit's batch differs from the order's batch, the order is updated to match.
4. **Completion**: `OrderController@complete` is called.
    - Barcode status becomes `with_customer`.
    - Batch quantity is decremented.
    - Reservation (if any) is released in the `reserved_products` table.
5. **Logistics**: If delivery is needed, a `Shipment` is created and units are tracked via `package_barcodes` JSON field.

---

## 6. Component & Module Mapping
### 6.1 Responsibility Table
| Module | Responsible Files | Key Interaction |
|--------|-------------------|-----------------|
| **Unit Tracking** | `ProductBarcode.php`, `ProductMovement.php` | Tracks physical identity |
| **Stock Levels** | `ProductBatch.php`, `ReservedProduct.php` | Tracks aggregate quantities |
| **Sales** | `Order.php`, `OrderItem.php`, `OrderController.php` | Tracks financial lifecycle |
| **Dispatch** | `ProductDispatch.php`, `ProductDispatchController.php` | Tracks location transfers |

---

## 7. API Contracts & Interfaces
### 7.1 POST /api/barcodes/scan
**Request**: `{ "barcode": "string" }`
**Success**:
```json
{
  "success": true,
  "data": {
    "barcode_id": 1,
    "product": { "name": "...", "sku": "..." },
    "current_location": "Main Branch",
    "is_available": true
  }
}
```

### 7.2 POST /api/barcodes/generate
**Request**: `{ "product_id": 1, "quantity": 10, "type": "CODE128" }`
**Success**: List of generated barcodes with IDs and formatted strings.

### 7.3 POST /api/barcodes/batch-scan
**Request**: `{ "barcodes": ["123", "456"] }`
**Success**: Summary of found vs not-found units with their current locations.

---

## 8. State Management & Lifecycle
### 8.1 Order Status Machine
- `pending_assignment` → `assigned_to_store` (via Store Assignment)
- `assigned_to_store` → `picking` (via first scan)
- `picking` → `ready_for_shipment` (via fulfillment of all items)
- `ready_for_shipment` → `confirmed` (via Order Completion)

---

## 9. Dependency Graph Explanation
- **Internal**: `OrderItem` → `ProductBarcode` (Optional until fulfillment).
- **Internal**: `ProductBarcode` → `ProductMovement` (Triggered on any location change).
- **External**: `spatie/laravel-activitylog` → Monitors `ProductBarcode` model changes.

---

## 10. Configuration & Environment
- `TAX_MODE`: `inclusive` (default) or `exclusive`. Controls all price calculations in `OrderController`.
- `DB_DATABASE`: MySQL instance containing the multi-store schema.

---

## 11. Edge Cases & Conditional Logic
- **Inventory Reservation**: If `TAX_MODE` is online, the system checks `ReservedProduct` table to prevent selling stock promised to other online customers.
- **Batch Switching**: If a staff member scans a barcode from Batch B for an item assigned to Batch A, the system overrides the batch to Batch B to maintain financial accuracy (COGS).
- **Stuck Barcodes**: A CLI command `FixStuckBarcodes.php` exists to resolve units stuck in `in_transit` status due to network or logic failures.

---

## 12. Unresolved / Unclear Areas
| # | Location | Unknown | Why |
|---|----------|---------|-----|
| 1 | app/Models/Store.php | Precise store-type definitions | Model not fully read |
| 2 | .env | Production API Keys | Credentials protected |
| 3 | Observers | Full logic of `OrderItemObserver` | Only partially analyzed |
