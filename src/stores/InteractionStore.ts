/**
 * Interaction Store - manages user interactions and UI state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { InteractionState, InteractionActions } from '@types';

interface InteractionStoreType extends InteractionState, InteractionActions {}

export const useInteractionStore = create<InteractionStoreType>()(
  devtools(
    (set, get) => ({
      // ============ Initial State ============

      // Drag state
      isDragging: false,
      draggedNode: null,
      dragStartPos: null,

      // Keyboard state
      keysPressed: new Set(),

      // Context menu
      contextMenuOpen: false,
      contextMenuPos: null,
      contextMenuNode: null,

      // Tooltips
      tooltipNode: null,
      tooltipPos: null,
      tooltipContent: null,
      tooltipTimeout: null,

      // ============ Drag Actions ============

      startDrag: (nodeId: string, pos: { x: number; y: number }) => {
        set({
          isDragging: true,
          draggedNode: nodeId,
          dragStartPos: pos
        });
      },

      updateDrag: (_pos: { x: number; y: number }) => {
        if (!get().isDragging) return;

        // Update logic will be handled by the D3 visualization
        // This just tracks the state
      },

      endDrag: () => {
        set({
          isDragging: false,
          draggedNode: null,
          dragStartPos: null
        });
      },

      // ============ Keyboard Actions ============

      keyDown: (key: string) => {
        set((state) => {
          const newKeys = new Set(state.keysPressed);
          newKeys.add(key);
          return { keysPressed: newKeys };
        });
      },

      keyUp: (key: string) => {
        set((state) => {
          const newKeys = new Set(state.keysPressed);
          newKeys.delete(key);
          return { keysPressed: newKeys };
        });
      },

      clearKeys: () => {
        set({ keysPressed: new Set() });
      },

      // ============ Context Menu Actions ============

      openContextMenu: (nodeId: string, pos: { x: number; y: number }) => {
        set({
          contextMenuOpen: true,
          contextMenuPos: pos,
          contextMenuNode: nodeId
        });
      },

      closeContextMenu: () => {
        set({
          contextMenuOpen: false,
          contextMenuPos: null,
          contextMenuNode: null
        });
      },

      // ============ Tooltip Actions ============

      showTooltip: (content: string, x: number, y: number, nodeId?: string) => {
        const { tooltipTimeout } = get();

        // Clear any existing timeout
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
        }

        // Show tooltip after 300ms delay for professional UX
        const timeout = setTimeout(() => {
          set({
            tooltipContent: content,
            tooltipNode: nodeId || null,
            tooltipPos: { x, y },
            tooltipTimeout: null
          });
        }, 300);

        set({ tooltipTimeout: timeout });
      },

      hideTooltip: () => {
        const { tooltipTimeout } = get();

        // Clear pending tooltip
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
        }

        // Hide immediately
        set({
          tooltipNode: null,
          tooltipPos: null,
          tooltipContent: null,
          tooltipTimeout: null
        });
      }
    }),
    {
      name: 'interaction-store'
    }
  )
);