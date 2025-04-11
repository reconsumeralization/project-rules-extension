/**
 * Tests for the event handlers implementation
 * This tests the TypeScript event handler interfaces and adapters.
 */

import * as assert from 'assert';
import {
    NormalizedEvent,
    fromReactEvent,
    fromVSCodeEvent,
    convertToChangeEvent,
    createEnhancedHandler
} from '../utils/eventHandlers';

// Mock React SyntheticEvent
const createMockReactEvent = () => {
    return {
        type: 'click',
        target: {
            tagName: 'BUTTON',
            id: 'test-button',
            value: 'test-value',
            checked: true
        },
        currentTarget: {
            tagName: 'BUTTON',
            id: 'test-button',
            value: 'test-value'
        },
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        timeStamp: 1000,
        preventDefault: () => { },
        stopPropagation: () => { },
        nativeEvent: { type: 'click' }
    };
};

// Mock VSCode event
const createMockVSCodeEvent = () => {
    return {
        type: 'change',
        target: {
            uri: 'file:///test.ts',
            value: 'test-value'
        },
        bubbles: true,
        cancelable: true,
        timeStamp: 1000,
        preventDefault: () => { },
        stopPropagation: () => { }
    };
};

describe('Event Handler Tests', () => {
    describe('fromReactEvent', () => {
        it('should convert a React event to a normalized event', () => {
            const mockEvent = createMockReactEvent();
            const normalizedEvent = fromReactEvent(mockEvent as any);

            assert.strictEqual(normalizedEvent.type, 'click');
            assert.strictEqual(normalizedEvent.bubbles, true);
            assert.strictEqual(normalizedEvent.cancelable, true);
            assert.strictEqual(normalizedEvent.defaultPrevented, false);
            assert.strictEqual(normalizedEvent.timestamp, 1000);
            assert.strictEqual(normalizedEvent.originalEvent, mockEvent.nativeEvent);

            // Test methods exist
            assert.strictEqual(typeof normalizedEvent.preventDefault, 'function');
            assert.strictEqual(typeof normalizedEvent.stopPropagation, 'function');
            assert.strictEqual(typeof normalizedEvent.stopImmediatePropagation, 'function');
        });
    });

    describe('fromVSCodeEvent', () => {
        it('should convert a VSCode event to a normalized event', () => {
            const mockEvent = createMockVSCodeEvent();
            const normalizedEvent = fromVSCodeEvent(mockEvent);

            assert.strictEqual(normalizedEvent.type, 'change');
            assert.strictEqual(normalizedEvent.bubbles, true);
            assert.strictEqual(normalizedEvent.cancelable, true);
            assert.strictEqual(normalizedEvent.defaultPrevented, false);
            assert.strictEqual(typeof normalizedEvent.timestamp, 'number');
            assert.strictEqual(normalizedEvent.originalEvent, mockEvent);

            // Test methods exist
            assert.strictEqual(typeof normalizedEvent.preventDefault, 'function');
            assert.strictEqual(typeof normalizedEvent.stopPropagation, 'function');
            assert.strictEqual(typeof normalizedEvent.stopImmediatePropagation, 'function');
        });

        it('should handle incomplete VSCode events', () => {
            const mockEvent = { value: 'test' };
            const normalizedEvent = fromVSCodeEvent(mockEvent);

            assert.strictEqual(normalizedEvent.type, 'unknown');
            assert.strictEqual(normalizedEvent.bubbles, true);
            assert.strictEqual(normalizedEvent.cancelable, true);
            assert.strictEqual(normalizedEvent.defaultPrevented, false);
            assert.strictEqual(typeof normalizedEvent.timestamp, 'number');
        });
    });

    describe('convertToChangeEvent', () => {
        it('should convert a normalized event to a change event', () => {
            const mockEvent = createMockReactEvent();
            const normalizedEvent = fromReactEvent(mockEvent as any);
            const changeEvent = convertToChangeEvent(normalizedEvent);

            assert.strictEqual(changeEvent.target.value, 'test-value');
            assert.strictEqual(changeEvent.target.checked, true);
            assert.strictEqual(typeof changeEvent.preventDefault, 'function');
            assert.strictEqual(typeof changeEvent.stopPropagation, 'function');
        });
    });

    describe('createEnhancedHandler', () => {
        it('should create a handler that works with both React and VSCode events', () => {
            let capturedValue = '';
            const handler = createEnhancedHandler<string>(value => {
                capturedValue = value;
            });

            // Test with React event
            const reactEvent = createMockReactEvent();
            reactEvent.nativeEvent = { type: 'click' }; // Add nativeEvent to trigger React path
            handler(reactEvent);
            assert.strictEqual(capturedValue, 'test-value');

            // Test with VSCode event
            const vscodeEvent = createMockVSCodeEvent();
            handler(vscodeEvent);
            assert.strictEqual(capturedValue, 'test-value');

            // Test with transformer
            const transformHandler = createEnhancedHandler<string>(
                value => { capturedValue = value; },
                value => value.toUpperCase()
            );
            transformHandler(reactEvent);
            assert.strictEqual(capturedValue, 'TEST-VALUE');
        });

        it('should handle errors gracefully', () => {
            const handler = createEnhancedHandler<string>(value => {
                throw new Error('Test error');
            });

            // This should not throw
            handler(createMockReactEvent());
        });
    });
}); 