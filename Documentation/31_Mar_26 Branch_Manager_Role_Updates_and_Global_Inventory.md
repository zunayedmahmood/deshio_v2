# Documentation: Branch Manager Role Implementation & Global Inventory Visibility

This document summarizes the changes made to the Errum V2 platform to integrate the `branch-manager` role and standardize global inventory visibility across all outlets.

## 1. Branch Manager Role Implementation

The `branch-manager` role has been introduced to provide branch-level administrative access with selective "View Only" restrictions on sensitive fulfillment actions.

### Feature Access Control (`lib/accessMap.ts`)
- **Accounting**: Full access granted to the `/accounting` module.
- **Purchase History**: Access granted to `/purchase-history`.
- **Inventory**: Full access to all inventory pages (except reports).

### Module-Specific Behavior

#### **Orders Module (`app/orders/OrdersClient.tsx`)**
- **Branch Scoping**: Automatically filtered to show only orders for the user's specific store (via axios interceptor).
- **Action Restrictions**: The following actions are **disabled** for the `branch-manager` role to enforce a "View Only" protocol on the packing panel:
    - **Edit Order**
    - **Add Order Marker** (Courier selection)
    - **Send to Pathao** (Single & Bulk)
    - **Cancel Order**
- **Action Permissions**: The **Return Order** and **Exchange Order** actions remain **active** and accessible for Branch Managers, POS Salesmen, Online Moderators, and Admins.

#### **Social Commerce Fulfillment (`app/social-commerce/package/page.tsx`)**
- **Branch Scoping**: Orders are filtered to only show those belonging to the manager's assigned branch.
- **View Only Mode**: The fulfillment button (`handleFulfillOrder`) is disabled for this role.

#### **POS Integration (`app/pos/page.tsx`)**
- **Daily Cash Report**: The **Daily Cash Report** button is now visible and functional for `super-admin`, `admin`, and `branch-manager` roles. 
- Centralized helper `canAccessDailyCashReport` added to `AuthContext.tsx` to handle this logic.

---

## 2. Global Inventory Visibility

To ensure consistent stock management across the entire chain, inventory visibility has been expanded globally.

### Inventory Service (`services/inventoryService.ts`)
- Updated the `getGlobalInventory` method to accept a `skipStoreScope` parameter in the query/config.
- This bypasses the default axios interceptor's store-scoping, allowing cross-outlet data retrieval.

### Inventory UI Updates
- **Inventory View (`app/inventory/view/page.tsx`)**: Now fetches data with `skipStoreScope: true`, showing all stores for all authorized roles.
- **Stock Management (`app/inventory/manage_stock/page.tsx`)**: 
    - Updated to fetch all stores globally.
    - Removed legacy role-based filtering that restricted branch managers to their own store only.
    - Standardized types (`StoreCardData` vs `Store`) and fixed event handler type mismatches.

---

## 3. General RBAC Fixes & Enhancements

- **Extras Panel**: Access policy updated to strictly exclude the `employee` role from the `/extra` routes.
- **AuthContext**: Unified `canAccess` helpers to provide clean, role-based UI guards across all components.
- **Search Robustness**: Optimized debounce logic in social commerce search bars and fixed focus-loss issues during typing.

## Technical Summary of Modified Files

| File | Purpose |
| --- | --- |
| `lib/accessMap.ts` | Centralized route-level access rules. |
| `contexts/AuthContext.tsx` | Centralized role checkers and permission helpers. |
| `lib/axios.ts` | Interceptor logic for `store_id` injection and `skipStoreScope` bypass. |
| `services/inventoryService.ts` | Global inventory API integration. |
| `app/orders/OrdersClient.tsx` | UI guards for Packing Panel actions. |
| `app/social-commerce/package/page.tsx` | Branch-scoping and view-only fulfillment. |
| `app/pos/page.tsx` | POS reporting access controls. |
| `app/inventory/*` | Global visibility implementations. |
