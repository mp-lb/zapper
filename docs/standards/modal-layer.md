# Modal Layer Pattern in React

Managing modals effectively in React applications can be challenging, especially when dealing with multiple or nested modals. A robust and scalable solution is to implement a **global modal stack** using a centralized state management library like Zustand. This pattern treats modals as layers in a stack, allowing you to push new modals, pop the current one, or remove any modal by ID, enabling precise control over modal behavior.

## Key Concepts

- **Global Modal Stack**: A single source of truth for all active modals, stored in a Zustand store.
- **Push Modals**: Add modals dynamically with customizable parameters.
- **Pop Modals**: Close the top modal in the stack.
- **Remove Specific Modals**: Remove any modal by its unique identifier.
- **Async Modal Invocation**: Modals behave like async functions that return results (e.g., form data), integrating seamlessly with application logic.

## Why Use Zustand?

Zustand offers a minimalistic and performant global state solution with zero boilerplate. It excels in:

- Efficient subscription to state changes.
- Simple and direct manipulation of modal stack data.
- Lightweight footprint, ideal for modal management.

## Implementation Example

### 1. Define the Modal Store

```tsx
import create from 'zustand';

type ModalProps = {
  id: string;
  component: React.FC<any>;
  props?: Record<string, any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type ModalState = {
  modals: ModalProps[];
  pushModal: (component: React.FC<any>, props?: Record<string, any>) => Promise<any>;
  popModal: () => void;
  removeModal: (id: string) => void;
};

export const useModalStore = create<ModalState>((set, get) => ({
  modals: [],
  pushModal: (component, props) => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);
      set(state => ({
        modals: [...state.modals, { id, component, props, resolve, reject }],
      }));
    });
  },
  popModal: () => {
    set(state => {
      const modals = [...state.modals];
      modals.pop();
      return { modals };
    });
  },
  removeModal: (id) => {
    set(state => ({
      modals: state.modals.filter(modal => modal.id !== id),
    }));
  },
}));
```

### 2. Create a Modal Renderer Component

```tsx
import React from 'react';
import { useModalStore } from './modalStore';

export const ModalRenderer: React.FC = () => {
  const modals = useModalStore(state => state.modals);
  const removeModal = useModalStore(state => state.removeModal);

  return (
    <>
      {modals.map(({ id, component: Component, props, resolve, reject }) => (
        <div key={id} className="modal-overlay">
          <Component
            {...props}
            onClose={(result?: any) => {
              resolve(result);
              removeModal(id);
            }}
            onCancel={(error?: any) => {
              reject(error);
              removeModal(id);
            }}
          />
        </div>
      ))}
    </>
  );
};
```

### 3. Example Modal Component

```tsx
type ConfirmModalProps = {
  message: string;
  onClose: (result: boolean) => void;
  onCancel: () => void;
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ message, onClose, onCancel }) => {
  return (
    <div className="modal-content">
      <p>{message}</p>
      <button onClick={() => onClose(true)}>Confirm</button>
      <button onClick={() => onCancel()}>Cancel</button>
    </div>
  );
};
```

### 4. Using the Modal in Your Application

```tsx
import React from 'react';
import { useModalStore } from './modalStore';
import { ConfirmModal } from './ConfirmModal';

const App: React.FC = () => {
  const pushModal = useModalStore(state => state.pushModal);

  const handleDelete = async () => {
    try {
      const confirmed = await pushModal(ConfirmModal, { message: 'Are you sure?' });
      if (confirmed) {
        // Proceed with deletion
        console.log('Item deleted');
      } else {
        console.log('Deletion cancelled');
      }
    } catch {
      console.log('Modal was cancelled');
    }
  };

  return (
    <div>
      <button onClick={handleDelete}>Delete Item</button>
      <ModalRenderer />
    </div>
  );
};
```

## Summary

This modal layer pattern using Zustand provides a declarative, composable, and asynchronous modal management system. It supports multiple modals, nested modals, and modal results, making it ideal for complex React applications. By centralizing modal state and handling modal lifecycle through promises, your UI logic becomes cleaner and easier to maintain.