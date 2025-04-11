import * as React from 'react';
import { useState, useCallback } from 'react';
import {
    NormalizedEvent,
    fromReactEvent,
    createEnhancedHandler
} from '../utils/eventHandlers';

interface FormData {
    name: string;
    email: string;
    agreeToTerms: boolean;
}

/**
 * Example form component using the TypeScript event handlers
 * This shows how to use the enhanced handlers in a real React component
 */
export function EnhancedForm() {
    // Form state
    const [formData, setFormData] = useState<FormData>({
        name: '',
        email: '',
        agreeToTerms: false
    });

    // Create enhanced handlers for each form field
    const handleNameChange = createEnhancedHandler<string>(value => {
        setFormData(prev => ({ ...prev, name: value }));
    });

    const handleEmailChange = createEnhancedHandler<string>(value => {
        setFormData(prev => ({ ...prev, email: value }));
    });

    const handleCheckboxChange = createEnhancedHandler<boolean>(checked => {
        setFormData(prev => ({ ...prev, agreeToTerms: checked }));
    });

    // Handle form submission
    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();

        // Convert to normalized event for consistent handling
        const normalizedEvent = fromReactEvent(e);
        console.log('Form submitted with normalized event:', normalizedEvent);

        // Process form data
        console.log('Submitting form data:', formData);

        // In a real app, you would make an API call here
        alert(`Form submitted with: ${JSON.stringify(formData, null, 2)}`);
    }, [formData]);

    return (
        <form onSubmit={handleSubmit} className="enhanced-form">
            <div className="form-group">
                <label htmlFor="name">Name:</label>
                <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={handleNameChange}
                    placeholder="Enter your name"
                    required
                />
            </div>

            <div className="form-group">
                <label htmlFor="email">Email:</label>
                <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleEmailChange}
                    placeholder="Enter your email"
                    required
                />
            </div>

            <div className="form-group checkbox">
                <input
                    id="terms"
                    type="checkbox"
                    checked={formData.agreeToTerms}
                    onChange={handleCheckboxChange}
                />
                <label htmlFor="terms">I agree to the terms and conditions</label>
            </div>

            <button type="submit" disabled={!formData.agreeToTerms}>
                Submit
            </button>

            {/* Example of manually using the handler */}
            <button
                type="button"
                onClick={() => {
                    // You can directly call the handler with any compatible object
                    handleNameChange({ target: { value: 'Auto-filled Name' } });
                    handleEmailChange({ target: { value: 'auto@example.com' } });
                }}
            >
                Auto-fill
            </button>
        </form>
    );
}

/**
 * Advanced example: Combined handler for multiple fields
 */
export function MultiFieldForm() {
    const [values, setValues] = useState({
        firstName: '',
        lastName: '',
        phone: ''
    });

    // A single handler for multiple fields
    const handleFieldChange = createEnhancedHandler<string>(
        (value) => {
            // Use closure to access the event
            const target = document.activeElement as HTMLInputElement;
            const fieldName = target?.name || target?.id;

            if (fieldName) {
                setValues(prev => ({
                    ...prev,
                    [fieldName]: value
                }));
            }
        }
    );

    return (
        <form className="multi-field-form">
            <div className="form-group">
                <label htmlFor="firstName">First Name:</label>
                <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={values.firstName}
                    onChange={handleFieldChange}
                />
            </div>

            <div className="form-group">
                <label htmlFor="lastName">Last Name:</label>
                <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={values.lastName}
                    onChange={handleFieldChange}
                />
            </div>

            <div className="form-group">
                <label htmlFor="phone">Phone:</label>
                <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={values.phone}
                    onChange={handleFieldChange}
                />
            </div>

            <pre>
                {JSON.stringify(values, null, 2)}
            </pre>
        </form>
    );
} 