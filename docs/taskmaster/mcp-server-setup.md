# MCP Server Setup Guide

This document provides detailed instructions for setting up and configuring the Model Context Protocol (MCP) server to work with the Enhanced Taskmaster workflow.

## Prerequisites

Before setting up the MCP server, ensure you have:

- Node.js v18+ installed
- 4GB+ RAM for AI model hosting
- PostgreSQL 14+ (for protocol storage)
- Access to AI service API tokens (if using external AI services)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/reconsumeralization/mcp-server.git
cd mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/mcp_protocols

# AI Service Configuration
AI_SERVICE_PROVIDER=openai
AI_API_KEY=your-api-key
AI_MODEL_NAME=gpt-4-turbo

# Authentication
AUTH_ENABLED=false
JWT_SECRET=your-jwt-secret
```

### 4. Initialize Database

```bash
npm run db:init
```

This will create the necessary database schemas and initialize default protocols.

### 5. Start the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## Server Configuration

### Base Configuration

The MCP server uses a combination of environment variables and configuration files. The main configuration file is located at `config/server.config.js`:

```javascript
module.exports = {
  server: {
    port: process.env.PORT || 3000,
    cors: {
      enabled: true,
      origins: ['http://localhost:3000', 'vscode-webview://']
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    directory: './logs'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production',
    poolSize: 10
  },
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '1d'
    }
  }
};
```

### Agent Configuration

Each agent is configured in the `config/agents` directory. For example, the Protocol Enhancement Agent configuration (`config/agents/enhancement.config.js`):

```javascript
module.exports = {
  id: 'protocol-enhancement',
  name: 'Protocol Enhancement Agent',
  description: 'Analyzes and suggests improvements for protocols and implementations',
  model: process.env.AI_MODEL_NAME || 'gpt-4-turbo',
  temperature: 0.2,
  maxTokens: 8192,
  capabilities: [
    'tradeoff-analysis',
    'code-review',
    'protocol-improvement',
    'implementation-suggestion'
  ],
  prompts: {
    tradeoffAnalysis: path.join(__dirname, '../prompts/tradeoff-analysis.txt'),
    codeReview: path.join(__dirname, '../prompts/code-review.txt'),
    // Additional prompt templates
  },
  parameters: {
    detailedAnalysis: true,
    codeExamples: true,
    metricsEnabled: true
  }
};
```

## Agent Development

### Agent Structure

Each agent follows a standard structure:

```text
/agents
  /validator
    index.js        # Main agent logic
    processor.js    # Processing functions
    prompts.js      # Prompt templates
    schema.js       # Validation schemas
  /assistant
    ...
  /enhancement
    ...
  /monitoring
    ...
```

### Creating a Custom Agent

To create a custom agent:

1. Create a new directory in `/agents`
2. Implement the required interfaces:

```javascript
// agents/custom-agent/index.js
const { BaseAgent } = require('../../lib/base-agent');

class CustomAgent extends BaseAgent {
  constructor(config) {
    super(config);
    // Custom initialization
  }

  async analyze(data) {
    // Implement analysis logic
    return {
      result: 'Analysis result',
      metadata: { /* Analysis metadata */ }
    };
  }

  async generate(parameters) {
    // Implement generation logic
    return {
      content: 'Generated content',
      metadata: { /* Generation metadata */ }
    };
  }

  async validate(implementation, protocol) {
    // Implement validation logic
    return {
      valid: true/false,
      issues: [],
      score: 0-100
    };
  }
}

module.exports = CustomAgent;
```

1. Register your agent in `agents/index.js`
2. Create a configuration file in `config/agents/custom.config.js`

## Protocol Management

### Default Protocols

The server comes with default protocols:

- `model-context-protocol-001`: Event Handling
- `model-context-protocol-002`: Rule Definition  
- `model-context-protocol-003`: Task Management

### Creating Custom Protocols

Protocols can be created through:

1. The API:
```bash
curl -X POST http://localhost:3000/api/protocols \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom-protocol-001",
    "version": "1.0.0",
    "type": "CustomType",
    "description": "Description of custom protocol",
    "sections": {
      "overview": {
        "content": "Overview content"
      },
      "schema": {
        "content": "Schema definition"
      }
    }
  }'
```

1. The MCP Protocol Editor in VS Code
2. Direct database insertion

### Protocol Storage

Protocols are stored in the PostgreSQL database with the following schema:

```sql
CREATE TABLE protocols (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  sections JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## API Reference

The MCP server exposes a RESTful API:

### Authentication Endpoints

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Protocol Management Endpoints

```text
GET    /api/protocols
POST   /api/protocols
GET    /api/protocols/:id
PUT    /api/protocols/:id
DELETE /api/protocols/:id
```

### Agent Operation Endpoints

```text
GET    /api/agents
GET    /api/agents/:id
POST   /api/agents/:id/analyze
POST   /api/agents/:id/generate
POST   /api/agents/:id/validate
```

### System Operation Endpoints

```text
GET    /api/status
GET    /api/metrics
POST   /api/system/config
```

A complete API reference is available at `http://localhost:3000/api-docs` when the server is running.

## Integration with Taskmaster

### Connection Configuration

Taskmaster connects to the MCP server using settings in `.taskmaster.json`:

```json
{
  "mcpServer": {
    "url": "http://localhost:3000",
    "token": "your-auth-token",
    "refreshInterval": 300
  }
}
```

### Testing the Connection

Verify the connection with:

```bash
npm run taskmaster:enhanced -- --test-mcp-connection
```

You should see:

```text
🔌 Testing MCP Server connection...
✅ Successfully connected to MCP Server at http://localhost:3000
✅ Found 4 active agents
```

## Performance Tuning

### Memory Optimization

For large projects, increase Node.js memory allocation:

```bash
export NODE_OPTIONS=--max-old-space-size=8192
```

### AI Model Caching

Enable response caching to reduce API calls:

```javascript
// config/server.config.js
module.exports = {
  // ... other config
  aiService: {
    caching: {
      enabled: true,
      ttl: 3600, // Cache TTL in seconds
      maxSize: 100 // Maximum cache size
    }
  }
};
```

### Agent Concurrency

Control how many agent operations can run simultaneously:

```javascript
// config/server.config.js
module.exports = {
  // ... other config
  agents: {
    maxConcurrent: 5,
    timeout: 30000 // Timeout in ms
  }
};
```

## Security

### Security Authentication

Enable JWT authentication:

```text
AUTH_ENABLED=true
JWT_SECRET=your-secure-random-secret
```

Generate tokens using:

```bash
npm run generate-token -- --username admin --role admin
```

### SSL Configuration

For production, enable SSL:

1. Add certificates to `./certs` directory
2. Update configuration:

```javascript
// config/server.config.js
module.exports = {
  // ... other config
  server: {
    // ... other server config
    ssl: {
      enabled: true,
      key: fs.readFileSync('./certs/server.key'),
      cert: fs.readFileSync('./certs/server.cert')
    }
  }
};
```

## Monitoring

### Server Metrics Overview

Basic metrics are available at `http://localhost:3000/api/metrics`

For advanced monitoring, integrate with Prometheus:

```javascript
// config/server.config.js
module.exports = {
  // ... other config
  monitoring: {
    prometheus: {
      enabled: true,
      path: '/metrics'
    }
  }
};
```

### Log Management Setup

Configure centralized logging:

```javascript
// config/server.config.js
module.exports = {
  // ... other config
  logging: {
    level: 'info',
    format: 'json',
    transport: 'console', // or 'file' or 'elasticsearch'
    elasticsearch: {
      node: 'http://localhost:9200',
      index: 'mcp-server-logs'
    }
  }
};
```

## Troubleshooting

### Common Issues

#### Agent Timeouts

If agents frequently timeout:

1. Increase `agents.timeout` in configuration
2. Check AI service availability
3. Optimize prompts to reduce token usage

#### Database Connection Issues

For database connectivity problems:

1. Verify PostgreSQL is running
2. Check connection string in `.env`
3. Ensure database user has proper permissions

#### High Memory Usage

If the server uses excessive memory:

1. Reduce `maxConcurrent` agent operations
2. Implement caching for frequently used protocols
3. Adjust Node.js memory allocation

### Logging Debug Mode

Enable debug logging for troubleshooting:

```text
LOG_LEVEL=debug
```

Review logs in the console or `./logs` directory.

## Conclusion

The MCP server provides a powerful foundation for AI-assisted development workflows. This setup guide covers the essentials, but refer to the [complete documentation](https://github.com/reconsumeralization/mcp-server/docs) for advanced configurations and custom integrations.

For support or feature requests, please create an issue in the [MCP Server repository](https://github.com/reconsumeralization/mcp-server/issues).
