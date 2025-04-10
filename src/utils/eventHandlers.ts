/**
 * Event Handler Utilities
 * 
 * Implemented as part of Taskmaster task #123: TypeScript event handlers compatibility
 * This module provides utilities for handling events in different component libraries,
 * particularly focusing on VSCode Webview UI Toolkit and Radix UI components.
 */

import * as vscode from 'vscode';
import type { ChangeEvent, FormEvent } from 'react';

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
    preventDefault: () => {},
    stopPropagation: () => {}
  };
} 