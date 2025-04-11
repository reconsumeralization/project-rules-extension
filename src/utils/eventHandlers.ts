/**
 * Event Handler Utilities
 * 
 * Implemented as part of Taskmaster task #123: TypeScript event handlers compatibility
 * This module provides utilities for handling events in different component libraries,
 * particularly focusing on VSCode Webview UI Toolkit and Radix UI components.
 */

import * as vscode from 'vscode';
import type { ChangeEvent, FormEvent, SyntheticEvent } from 'react';

/**
 * Generic Normalized Event Interface
 * 
 * Provides a standardized event interface that works across different systems.
 * This helps maintain type safety and consistent developer experience.
 */
export interface NormalizedEvent<T = any> {
  type: string;
  target: T;
  currentTarget: T;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  timestamp: number;

  // Methods
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;

  // Original event reference (for advanced use cases)
  originalEvent?: unknown;
}

/**
 * Convert a React SyntheticEvent to a normalized event
 */
export function fromReactEvent<T = Element>(event: SyntheticEvent): NormalizedEvent<T> {
  return {
    type: event.type,
    target: event.target as unknown as T,
    currentTarget: event.currentTarget as unknown as T,
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
    timestamp: event.timeStamp,

    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
    stopImmediatePropagation: () => {
      // React doesn't have stopImmediatePropagation, so we simulate it
      event.stopPropagation();
      console.warn('stopImmediatePropagation is simulated in React events');
    },

    originalEvent: event.nativeEvent
  };
}

/**
 * Convert a VSCode event to a normalized event
 */
export function fromVSCodeEvent<T = any>(event: any): NormalizedEvent<T> {
  return {
    type: event.type || 'unknown',
    target: event.target || null,
    currentTarget: event.currentTarget || event.target || null,
    bubbles: typeof event.bubbles === 'boolean' ? event.bubbles : true,
    cancelable: typeof event.cancelable === 'boolean' ? event.cancelable : true,
    defaultPrevented: event.defaultPrevented || false,
    timestamp: event.timeStamp || Date.now(),

    preventDefault: () => {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    },
    stopPropagation: () => {
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    },
    stopImmediatePropagation: () => {
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      } else if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    },

    originalEvent: event
  };
}

/**
 * Event adapter interfaces to normalize different event types
 */
export interface NormalizedChangeEvent<T = string> {
  target: {
    name?: string;
    value: T;
    checked?: boolean;
    type?: string;
  };
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface NormalizedSubmitEvent {
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * Create a change handler that works with both React change events and VSCode inputs
 */
export function createChangeHandler<T = string>(
  setter: (value: T) => void,
  transformer?: (value: any) => T
) {
  return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> | any) => {
    try {
      // Handle React events
      if (event && typeof event === 'object' && 'target' in event) {
        const value = event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;

        setter(transformer ? transformer(value) : value as unknown as T);
        return;
      }

      // Handle direct value (VSCode webview case)
      setter(transformer ? transformer(event) : event as unknown as T);
    } catch (error) {
      console.error('Error in change handler:', error);
    }
  };
}

/**
 * Create a specialized change handler for VSCode webview messages
 */
export function createVSCodeChangeHandler<T = string>(
  setter: (value: T) => void,
  transformer?: (value: any) => T
) {
  return (event: any) => {
    try {
      // Handle VSCode webview messages
      if (event && typeof event === 'object') {
        // Handle message events from webview
        if ('data' in event) {
          const data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : event.data;

          if (data && data.value !== undefined) {
            setter(transformer ? transformer(data.value) : data.value as unknown as T);
            return;
          }
        }

        // If not a message event but has value property
        if ('value' in event) {
          setter(transformer ? transformer(event.value) : event.value as unknown as T);
          return;
        }
      }

      // Fall back to handling the event as a direct value
      setter(transformer ? transformer(event) : event as unknown as T);
    } catch (error) {
      console.error('Error in VSCode change handler:', error);
    }
  };
}

/**
 * Specialized adapter for Radix UI component change events
 */
export function handleRadixChange<T = string>(
  setter: (value: T) => void,
) {
  return (value: T) => {
    try {
      setter(value);
    } catch (error) {
      console.error('Error in Radix change handler:', error);
    }
  };
}

/**
 * Create a submit handler for forms that works in both React and VSCode environments
 */
export function createSubmitHandler(
  onSubmit: (data: any) => Promise<void> | void,
  getFormData?: () => any
) {
  return async (event: FormEvent | any) => {
    try {
      // Prevent default for React form events
      if (event && typeof event === 'object' && 'preventDefault' in event) {
        event.preventDefault();
      }

      // Get form data if provided, otherwise pass the event
      const data = getFormData ? getFormData() : event;
      await onSubmit(data);
    } catch (error) {
      console.error('Error in submit handler:', error);
    }
  };
}

/**
 * Adapter function to convert event handler types between environments
 */
export function adaptHandler<T extends any[], R>(
  handler: (...args: T) => R,
  adapter: (args: any) => T
): (event: any) => R {
  return (event: any) => {
    try {
      const adaptedArgs = adapter(event);
      return handler(...adaptedArgs);
    } catch (error) {
      console.error('Error in handler adapter:', error);
      throw error;
    }
  };
}

/**
 * Normalize React change events to a consistent format
 */
export function normalizeChangeEvent(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): NormalizedChangeEvent {
  return {
    target: {
      name: event.target.name,
      value: event.target.value,
      checked: 'checked' in event.target ? event.target.checked : undefined,
      type: event.target.type
    },
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation()
  };
}

/**
 * Normalize VSCode webview message events to a consistent format
 */
export function normalizeVSCodeEvent(message: any): NormalizedChangeEvent {
  const data = typeof message.data === 'string' ? JSON.parse(message.data) : (message.data || message);

  return {
    target: {
      name: data.name || data.id,
      value: data.value,
      checked: data.checked,
      type: data.type
    },
    preventDefault: () => { },
    stopPropagation: () => { }
  };
}

/**
 * Convert between generic NormalizedEvent and specialized NormalizedChangeEvent
 * This provides backward compatibility with existing code while allowing the use
 * of the new more generic interface.
 */
export function convertToChangeEvent<T = string>(event: NormalizedEvent): NormalizedChangeEvent<T> {
  const target = event.target as any;

  return {
    target: {
      name: target.name || target.id,
      value: target.value as T,
      checked: target.checked,
      type: target.type
    },
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation()
  };
}

/**
 * Enhanced handler creator that works with the new NormalizedEvent interface
 * This combines the flexibility of the generic event interface with the specific
 * requirements of form inputs and controls.
 */
export function createEnhancedHandler<T = string>(
  setter: (value: T) => void,
  transformer?: (value: any) => T
) {
  return (event: SyntheticEvent | any) => {
    try {
      // Convert to normalized event format
      const normalizedEvent = event.nativeEvent
        ? fromReactEvent(event)
        : fromVSCodeEvent(event);

      // Extract value based on event type
      let value;
      const target = normalizedEvent.target as any;

      if (target && typeof target === 'object') {
        value = target.type === 'checkbox' ? target.checked : target.value;
      } else {
        value = event;
      }

      // Apply transformation if provided
      setter(transformer ? transformer(value) : value as unknown as T);
    } catch (error) {
      console.error('Error in enhanced event handler:', error);
    }
  };
} 