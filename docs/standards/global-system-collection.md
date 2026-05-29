# MongoDB System Collection Pattern

Use a single collection named "system" to store documents that represent unique global configurations or settings. Each document in this collection is identified by a unique `_id` field, which serves as the document type identifier. Since the collection is intended to hold only one document per type, the `_id` ensures uniqueness and acts as a key to retrieve the specific global document.

Key points:
- One collection named `system`.
- Each document represents a unique global entity.
- The `_id` field stores the document type, ensuring only one document per type.
- Suitable for configurations or settings where multiple document types are not expected.
