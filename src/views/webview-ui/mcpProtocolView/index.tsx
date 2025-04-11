import React, { useState, useEffect, FormEvent } from 'react';
import { VSCodeButton, VSCodeTextField, VSCodeDropdown, VSCodeOption, VSCodeDivider, VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import { createVSCodeChangeHandler } from '../../../utils/eventHandlers';

// Define the vscode API for webview communication
declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
};

// Initialize vscode API
const vscode = acquireVsCodeApi();

// Types reflecting the MCP protocol structure
interface MCPParameter {
  id: string;
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
}

interface MCPCapability {
  id: string;
  name: string;
  description: string;
  category?: string;
}

interface MCPLimitation {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface MCPProtocol {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  modelType: string;
  parameters: MCPParameter[];
  capabilities: MCPCapability[];
  limitations: MCPLimitation[];
  validated: boolean;
}

// The main Protocol Editor component
function MCPProtocolEditor() {
  const [protocol, setProtocol] = useState<MCPProtocol>({
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    author: '',
    modelType: '',
    parameters: [],
    capabilities: [],
    limitations: [],
    validated: false
  });

  const [currentSection, setCurrentSection] = useState<string>('basic');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [protocolList, setProtocolList] = useState<Array<{id: string, name: string}>>([]);

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.command) {
        case 'setProtocol':
          setProtocol(message.protocol);
          setIsEditing(true);
          break;
        case 'protocolList':
          setProtocolList(message.protocols);
          break;
        case 'validationResult':
          // Handle validation results
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Request protocol list on load
    vscode.postMessage({ command: 'getProtocols' });
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Create handlers directly using the new utility function
  const handleNameChange = createVSCodeChangeHandler((value) => {
    setProtocol(prev => ({
      ...prev,
      name: value
    }));
  });

  const handleVersionChange = createVSCodeChangeHandler((value) => {
    setProtocol(prev => ({
      ...prev,
      version: value
    }));
  });

  const handleAuthorChange = createVSCodeChangeHandler((value) => {
    setProtocol(prev => ({
      ...prev,
      author: value
    }));
  });

  const handleModelTypeChange = createVSCodeChangeHandler((value) => {
    setProtocol(prev => ({
      ...prev,
      modelType: value
    }));
  });

  const handleDescriptionChange = createVSCodeChangeHandler((value) => {
    setProtocol(prev => ({
      ...prev,
      description: value
    }));
  });

  // Create a factory for parameter field handler
  const createParameterHandler = (index: number, field: keyof MCPParameter) => {
    return createVSCodeChangeHandler((value) => {
      updateParameter(index, field, value);
    });
  };

  // Create a factory for capability field handler
  const createCapabilityHandler = (index: number, field: keyof MCPCapability) => {
    return createVSCodeChangeHandler((value) => {
      updateCapability(index, field, value);
    });
  };

  // Create a factory for limitation field handler
  const createLimitationHandler = (index: number, field: keyof MCPLimitation) => {
    return createVSCodeChangeHandler((value) => {
      updateLimitation(index, field, value);
    });
  };

  const handleSave = () => {
    vscode.postMessage({
      command: isEditing ? 'updateProtocol' : 'createProtocol',
      protocol
    });
  };

  const handleValidate = () => {
    vscode.postMessage({
      command: 'validateProtocol',
      protocol
    });
  };

  const addParameter = () => {
    const newParam: MCPParameter = {
      id: `param-${Date.now()}`,
      name: '',
      description: '',
      type: 'string',
      required: false
    };
    
    setProtocol(prev => ({
      ...prev,
      parameters: [...prev.parameters, newParam]
    }));
  };

  const updateParameter = (index: number, field: keyof MCPParameter, value: any) => {
    setProtocol(prev => {
      const updatedParams = [...prev.parameters];
      updatedParams[index] = {
        ...updatedParams[index],
        [field]: value
      };
      return {
        ...prev,
        parameters: updatedParams
      };
    });
  };

  const removeParameter = (index: number) => {
    setProtocol(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }));
  };

  const addCapability = () => {
    const newCapability: MCPCapability = {
      id: `cap-${Date.now()}`,
      name: '',
      description: '',
    };
    
    setProtocol(prev => ({
      ...prev,
      capabilities: [...prev.capabilities, newCapability]
    }));
  };

  const updateCapability = (index: number, field: keyof MCPCapability, value: any) => {
    setProtocol(prev => {
      const updatedCapabilities = [...prev.capabilities];
      updatedCapabilities[index] = {
        ...updatedCapabilities[index],
        [field]: value
      };
      return {
        ...prev,
        capabilities: updatedCapabilities
      };
    });
  };

  const removeCapability = (index: number) => {
    setProtocol(prev => ({
      ...prev,
      capabilities: prev.capabilities.filter((_, i) => i !== index)
    }));
  };

  const addLimitation = () => {
    const newLimitation: MCPLimitation = {
      id: `lim-${Date.now()}`,
      name: '',
      description: '',
      severity: 'medium'
    };
    
    setProtocol(prev => ({
      ...prev,
      limitations: [...prev.limitations, newLimitation]
    }));
  };

  const updateLimitation = (index: number, field: keyof MCPLimitation, value: any) => {
    setProtocol(prev => {
      const updatedLimitations = [...prev.limitations];
      updatedLimitations[index] = {
        ...updatedLimitations[index],
        [field]: value
      };
      return {
        ...prev,
        limitations: updatedLimitations
      };
    });
  };

  const removeLimitation = (index: number) => {
    setProtocol(prev => ({
      ...prev,
      limitations: prev.limitations.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="mcp-protocol-editor">
      <h1>{isEditing ? 'Edit Protocol' : 'Create Protocol'}</h1>
      
      <VSCodePanels>
        <VSCodePanelTab id="basic">Basic Information</VSCodePanelTab>
        <VSCodePanelTab id="parameters">Parameters</VSCodePanelTab>
        <VSCodePanelTab id="capabilities">Capabilities</VSCodePanelTab>
        <VSCodePanelTab id="limitations">Limitations</VSCodePanelTab>
        
        <VSCodePanelView id="basic">
          <div className="form-section">
            <VSCodeTextField
              name="name"
              value={protocol.name}
              onChange={handleNameChange}
              placeholder="Protocol Name"
              required
            >Protocol Name</VSCodeTextField>
            
            <VSCodeTextField
              name="version"
              value={protocol.version}
              onChange={handleVersionChange}
              placeholder="1.0.0"
              required
            >Version</VSCodeTextField>
            
            <VSCodeTextField
              name="author"
              value={protocol.author}
              onChange={handleAuthorChange}
              placeholder="Author"
              required
            >Author</VSCodeTextField>
            
            <VSCodeTextField
              name="modelType"
              value={protocol.modelType}
              onChange={handleModelTypeChange}
              placeholder="e.g., LLM, Image Generation, etc."
              required
            >Model Type</VSCodeTextField>
            
            <VSCodeTextField
              name="description"
              value={protocol.description}
              onChange={handleDescriptionChange}
              placeholder="Describe the protocol's purpose and use cases"
              required
            >Description</VSCodeTextField>
          </div>
        </VSCodePanelView>
        
        <VSCodePanelView id="parameters">
          <div className="form-section">
            <h3>Parameters</h3>
            <p>Define the parameters required by this model context protocol</p>
            
            <VSCodeButton onClick={addParameter}>Add Parameter</VSCodeButton>
            
            {protocol.parameters.map((param, index) => (
              <div className="parameter-item" key={param.id}>
                <VSCodeTextField
                  value={param.name}
                  onChange={createParameterHandler(index, 'name')}
                  placeholder="Parameter Name"
                  required
                >Name</VSCodeTextField>
                
                <VSCodeDropdown
                  value={param.type}
                  onChange={createParameterHandler(index, 'type')}
                >
                  <VSCodeOption value="string">String</VSCodeOption>
                  <VSCodeOption value="number">Number</VSCodeOption>
                  <VSCodeOption value="boolean">Boolean</VSCodeOption>
                  <VSCodeOption value="array">Array</VSCodeOption>
                  <VSCodeOption value="object">Object</VSCodeOption>
                </VSCodeDropdown>
                
                <VSCodeTextField
                  value={param.description}
                  onChange={createParameterHandler(index, 'description')}
                  placeholder="Parameter Description"
                >Description</VSCodeTextField>
                
                <div className="parameter-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={param.required}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParameter(index, 'required', e.target.checked)}
                    />
                    Required
                  </label>
                  
                  <VSCodeButton appearance="secondary" onClick={() => removeParameter(index)}>
                    Remove
                  </VSCodeButton>
                </div>
                
                <VSCodeDivider />
              </div>
            ))}
          </div>
        </VSCodePanelView>
        
        <VSCodePanelView id="capabilities">
          <div className="form-section">
            <h3>Capabilities</h3>
            <p>Define what this model is capable of doing</p>
            
            <VSCodeButton onClick={addCapability}>Add Capability</VSCodeButton>
            
            {protocol.capabilities.map((capability, index) => (
              <div className="capability-item" key={capability.id}>
                <VSCodeTextField
                  value={capability.name}
                  onChange={createCapabilityHandler(index, 'name')}
                  placeholder="Capability Name"
                  required
                >Name</VSCodeTextField>
                
                <VSCodeTextField
                  value={capability.category || ''}
                  onChange={createCapabilityHandler(index, 'category')}
                  placeholder="Category"
                >Category</VSCodeTextField>
                
                <VSCodeTextField
                  value={capability.description}
                  onChange={createCapabilityHandler(index, 'description')}
                  placeholder="Describe this capability"
                >Description</VSCodeTextField>
                
                <VSCodeButton appearance="secondary" onClick={() => removeCapability(index)}>
                  Remove
                </VSCodeButton>
                
                <VSCodeDivider />
              </div>
            ))}
          </div>
        </VSCodePanelView>
        
        <VSCodePanelView id="limitations">
          <div className="form-section">
            <h3>Limitations</h3>
            <p>Define the constraints and limitations of this model</p>
            
            <VSCodeButton onClick={addLimitation}>Add Limitation</VSCodeButton>
            
            {protocol.limitations.map((limitation, index) => (
              <div className="limitation-item" key={limitation.id}>
                <VSCodeTextField
                  value={limitation.name}
                  onChange={createLimitationHandler(index, 'name')}
                  placeholder="Limitation Name"
                  required
                >Name</VSCodeTextField>
                
                <VSCodeDropdown
                  value={limitation.severity}
                  onChange={createLimitationHandler(index, 'severity')}
                >
                  <VSCodeOption value="low">Low</VSCodeOption>
                  <VSCodeOption value="medium">Medium</VSCodeOption>
                  <VSCodeOption value="high">High</VSCodeOption>
                  <VSCodeOption value="critical">Critical</VSCodeOption>
                </VSCodeDropdown>
                
                <VSCodeTextField
                  value={limitation.description}
                  onChange={createLimitationHandler(index, 'description')}
                  placeholder="Describe this limitation"
                >Description</VSCodeTextField>
                
                <VSCodeButton appearance="secondary" onClick={() => removeLimitation(index)}>
                  Remove
                </VSCodeButton>
                
                <VSCodeDivider />
              </div>
            ))}
          </div>
        </VSCodePanelView>
      </VSCodePanels>
      
      <div className="action-buttons">
        <VSCodeButton onClick={handleSave}>
          {isEditing ? 'Update Protocol' : 'Create Protocol'}
        </VSCodeButton>
        <VSCodeButton onClick={handleValidate}>
          Validate
        </VSCodeButton>
      </div>
    </div>
  );
}

export default MCPProtocolEditor; 