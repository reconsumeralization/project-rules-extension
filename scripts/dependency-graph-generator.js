#!/usr/bin/env node

/**
 * Dependency Graph Generator for Project Rules Extension
 * 
 * Analyzes project dependencies and generates visual representations:
 * 1. Traces import/export relationships between files
 * 2. Creates visualizations of module dependencies
 * 3. Identifies circular dependencies and potential issues
 * 4. Generates reports in multiple formats (DOT, JSON, HTML)
 * 5. Can focus on specific directories or module types
 * 
 * Usage:
 *   node dependency-graph-generator.js                      // Analyze entire project
 *   node dependency-graph-generator.js src/controllers      // Analyze specific directory
 *   node dependency-graph-generator.js --format=dot         // Output in DOT format
 *   node dependency-graph-generator.js --include-external   // Include external dependencies
 *   node dependency-graph-generator.js --detect-cycles      // Highlight circular dependencies
 *   node dependency-graph-generator.js --exclude=node_modules,dist // Exclude directories
 *   node dependency-graph-generator.js --depth=2            // Limit dependency depth
 *   node dependency-graph-generator.js --focus=controller   // Focus on specific module types
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const FORMAT_ARG = args.find(arg => arg.startsWith('--format='));
const INCLUDE_EXTERNAL = args.includes('--include-external');
const DETECT_CYCLES = args.includes('--detect-cycles');
const EXCLUDE_ARG = args.find(arg => arg.startsWith('--exclude='));
const DEPTH_ARG = args.find(arg => arg.startsWith('--depth='));
const FOCUS_ARG = args.find(arg => arg.startsWith('--focus='));
const VERBOSE = args.includes('--verbose');

// Extract values from args
const outputFormat = FORMAT_ARG ? FORMAT_ARG.split('=')[1] : 'html';
const excludeDirs = EXCLUDE_ARG ? EXCLUDE_ARG.split('=')[1].split(',') : ['node_modules', 'dist', 'build'];
const maxDepth = DEPTH_ARG ? parseInt(DEPTH_ARG.split('=')[1], 10) : Infinity;
const focusModules = FOCUS_ARG ? FOCUS_ARG.split('=')[1].split(',') : [];

// Target directory
const targetDir = args.find(arg => !arg.startsWith('--')) || '.';

// Data structures for dependency tracking
const fileNodes = new Map(); // Maps file paths to node IDs
const dependencies = new Map(); // Maps node IDs to arrays of dependencies
const circularDependencies = [];
const externalDependencies = new Set();

// Counter for assigning unique IDs to nodes
let nodeCounter = 0;

/**
 * File type detection based on extension
 */
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.ts', '.tsx'].includes(ext)) {return 'typescript';}
  if (['.js', '.jsx'].includes(ext)) {return 'javascript';}
  if (['.vue'].includes(ext)) {return 'vue';}
  if (['.scss', '.css'].includes(ext)) {return 'style';}
  if (['.json'].includes(ext)) {return 'json';}
  return 'other';
}

/**
 * Check if a directory should be excluded
 */
function shouldExcludeDir(dirPath) {
  return excludeDirs.some(dir => {
    const normalizedDirPath = path.normalize(dirPath);
    const normalizedExcludeDir = path.normalize(dir);
    return normalizedDirPath.includes(normalizedExcludeDir);
  });
}

/**
 * Extract imports from a TypeScript/JavaScript file
 */
function extractImports(filePath, content) {
  const imports = [];
  
  // ES6 import statements
  const es6ImportRegex = /import\s+(?:{[^}]*}|\*\s+as\s+[^,]*|[^,{]*)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // require statements
  const requireRegex = /(?:const|let|var)\s+(?:{[^}]*}|[^=]*)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // dynamic imports
  const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

/**
 * Convert relative import path to absolute file path
 */
function resolveImportPath(importPath, currentFile) {
  // Handle non-relative imports
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    // This is likely an external package
    externalDependencies.add(importPath);
    return null;
  }
  
  // Convert relative import to absolute path
  const currentDir = path.dirname(currentFile);
  let resolvedPath = path.resolve(currentDir, importPath);
  
  // Handle imports without file extensions
  if (!path.extname(resolvedPath)) {
    // Try adding common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext;
      if (fs.existsSync(pathWithExt)) {
        return pathWithExt;
      }
    }
    
    // Check for index files in directory
    for (const ext of extensions) {
      const indexPath = path.join(resolvedPath, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
  }
  
  return resolvedPath;
}

/**
 * Process a file and extract its dependencies
 */
function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    if (VERBOSE) {console.log(`File not found: ${filePath}`);}
    return null;
  }
  
  // Skip non-JS/TS files
  const fileType = getFileType(filePath);
  if (!['typescript', 'javascript'].includes(fileType)) {
    return null;
  }
  
  // Get or create node ID for this file
  let nodeId;
  if (fileNodes.has(filePath)) {
    nodeId = fileNodes.get(filePath);
  } else {
    nodeId = `n${nodeCounter++}`;
    fileNodes.set(filePath, nodeId);
    dependencies.set(nodeId, []);
  }
  
  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract imports
    const imports = extractImports(filePath, content);
    
    // Process each import
    for (const importPath of imports) {
      const resolvedPath = resolveImportPath(importPath, filePath);
      
      if (resolvedPath) {
        if (fs.existsSync(resolvedPath)) {
          // Get or create node ID for dependency
          let depNodeId;
          if (fileNodes.has(resolvedPath)) {
            depNodeId = fileNodes.get(resolvedPath);
          } else {
            depNodeId = `n${nodeCounter++}`;
            fileNodes.set(resolvedPath, depNodeId);
            dependencies.set(depNodeId, []);
          }
          
          // Add dependency
          dependencies.get(nodeId).push({
            id: depNodeId,
            path: resolvedPath
          });
        } else if (VERBOSE) {
          console.log(`Unresolved import: ${importPath} in ${filePath}`);
        }
      } else if (INCLUDE_EXTERNAL) {
        // External dependency (package from node_modules)
        const externalNodeId = `ext_${importPath.replace(/[@/-]/g, '_')}`;
        fileNodes.set(importPath, externalNodeId);
        
        if (!dependencies.has(externalNodeId)) {
          dependencies.set(externalNodeId, []);
        }
        
        dependencies.get(nodeId).push({
          id: externalNodeId,
          path: importPath,
          isExternal: true
        });
      }
    }
    
    return nodeId;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Process a directory recursively
 */
function processDirectory(dirPath, currentDepth = 0) {
  if (currentDepth > maxDepth) {return;}
  
  try {
    if (shouldExcludeDir(dirPath)) {
      if (VERBOSE) {console.log(`Skipping excluded directory: ${dirPath}`);}
      return;
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        processDirectory(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error.message);
  }
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies() {
  const visited = new Set();
  const recursionStack = new Set();
  
  function dfs(nodeId, path = []) {
    if (recursionStack.has(nodeId)) {
      // Found a cycle
      const cycle = [...path.slice(path.indexOf(nodeId)), nodeId];
      circularDependencies.push(cycle);
      return;
    }
    
    if (visited.has(nodeId)) {return;}
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);
    
    const nodeDeps = dependencies.get(nodeId) || [];
    for (const dep of nodeDeps) {
      dfs(dep.id, [...path]);
    }
    
    recursionStack.delete(nodeId);
  }
  
  // Start DFS from each node
  for (const nodeId of dependencies.keys()) {
    dfs(nodeId);
  }
}

/**
 * Generate DOT format for GraphViz
 */
function generateDotFormat() {
  let dot = 'digraph DependencyGraph {\n';
  dot += '  rankdir=LR;\n';
  dot += '  node [shape=box, style=filled, fillcolor=lightblue];\n\n';
  
  // Add nodes
  for (const [filePath, nodeId] of fileNodes.entries()) {
    const label = path.relative(process.cwd(), filePath);
    const isExternal = filePath.includes('node_modules') || !filePath.startsWith(process.cwd());
    const color = isExternal ? 'lightgrey' : 'lightblue';
    dot += `  ${nodeId} [label="${label}", fillcolor="${color}"];\n`;
  }
  
  dot += '\n';
  
  // Add edges
  for (const [nodeId, deps] of dependencies.entries()) {
    for (const dep of deps) {
      // Check if this dependency is part of a cycle
      let edgeStyle = '';
      if (DETECT_CYCLES) {
        for (const cycle of circularDependencies) {
          if (cycle.includes(nodeId) && cycle.includes(dep.id)) {
            edgeStyle = ' [color=red, penwidth=2]';
            break;
          }
        }
      }
      
      dot += `  ${nodeId} -> ${dep.id}${edgeStyle};\n`;
    }
  }
  
  dot += '}\n';
  return dot;
}

/**
 * Generate JSON format
 */
function generateJsonFormat() {
  const nodes = [];
  const links = [];
  
  // Add nodes
  for (const [filePath, nodeId] of fileNodes.entries()) {
    const relativePath = filePath.startsWith(process.cwd()) 
      ? path.relative(process.cwd(), filePath) 
      : filePath;
    
    const isExternal = filePath.includes('node_modules') || !filePath.startsWith(process.cwd());
    const fileName = path.basename(filePath);
    const fileType = getFileType(filePath);
    
    nodes.push({
      id: nodeId,
      name: fileName,
      path: relativePath,
      type: fileType,
      isExternal
    });
  }
  
  // Add links
  for (const [sourceId, deps] of dependencies.entries()) {
    for (const dep of deps) {
      // Check if this dependency is part of a cycle
      let isCyclic = false;
      if (DETECT_CYCLES) {
        for (const cycle of circularDependencies) {
          if (cycle.includes(sourceId) && cycle.includes(dep.id)) {
            isCyclic = true;
            break;
          }
        }
      }
      
      links.push({
        source: sourceId,
        target: dep.id,
        isCyclic
      });
    }
  }
  
  // Add cycles data if detected
  const cyclesData = DETECT_CYCLES ? circularDependencies.map(cycle => {
    return cycle.map(nodeId => {
      const filePath = [...fileNodes.entries()]
        .find(([_, id]) => id === nodeId)?.[0] || '';
      return path.relative(process.cwd(), filePath);
    });
  }) : [];
  
  return JSON.stringify({
    nodes,
    links,
    cycles: cyclesData
  }, null, 2);
}

/**
 * Generate HTML format with interactive visualization
 */
function generateHtmlFormat() {
  const jsonData = generateJsonFormat();
  
  // Create the HTML content
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    #container {
      display: flex;
      height: 100vh;
    }
    #graph {
      flex: 1;
      background-color: white;
      border-right: 1px solid #ddd;
    }
    #sidebar {
      width: 300px;
      padding: 20px;
      overflow-y: auto;
    }
    .node {
      cursor: pointer;
    }
    .link {
      stroke: #999;
      stroke-opacity: 0.6;
    }
    .link.cyclic {
      stroke: red;
      stroke-width: 2px;
    }
    h1 {
      font-size: 1.5rem;
      margin-top: 0;
    }
    h2 {
      font-size: 1.2rem;
      margin-top: 20px;
    }
    .stats {
      margin-bottom: 20px;
      background-color: white;
      padding: 10px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .info-panel {
      background-color: white;
      padding: 10px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    ul {
      padding-left: 20px;
    }
    .cycle-item {
      color: red;
      margin-bottom: 10px;
    }
    .controls {
      position: absolute;
      top: 10px;
      left: 10px;
      background-color: rgba(255,255,255,0.8);
      padding: 10px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    button {
      margin-right: 5px;
      padding: 5px 10px;
      border: none;
      background-color: #4a5568;
      color: white;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background-color: #2d3748;
    }
    .legend {
      display: flex;
      align-items: center;
      margin-bottom: 5px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin-right: 15px;
    }
    .legend-color {
      width: 15px;
      height: 15px;
      margin-right: 5px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="graph"></div>
    <div id="sidebar">
      <h1>Dependency Graph</h1>
      
      <div class="stats">
        <h2>Statistics</h2>
        <div id="stats-content"></div>
      </div>
      
      <div class="info-panel">
        <h2>Selected Node</h2>
        <div id="node-info">Select a node to see details</div>
      </div>
      
      <div class="info-panel" style="margin-top: 20px;">
        <h2>Circular Dependencies</h2>
        <div id="cycles-list"></div>
      </div>
    </div>
  </div>
  
  <div class="controls">
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background-color: #90cdf4;"></div>
        <span>Internal</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background-color: #cbd5e0;"></div>
        <span>External</span>
      </div>
    </div>
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background-color: #f56565; width: 30px; height: 2px;"></div>
        <span>Circular</span>
      </div>
    </div>
    <button id="zoom-in">Zoom In</button>
    <button id="zoom-out">Zoom Out</button>
    <button id="reset">Reset</button>
  </div>
  
  <script>
    // Graph data
    const graphData = ${jsonData};
    
    // Set up the visualization
    const width = document.getElementById('graph').clientWidth;
    const height = document.getElementById('graph').clientHeight;
    
    // Create SVG
    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .call(d3.zoom().on('zoom', (event) => {
        g.attr('transform', event.transform);
      }))
      .append('g');
    
    const g = svg.append('g');
    
    // Create the force simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));
    
    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter()
      .append('line')
      .attr('class', d => d.isCyclic ? 'link cyclic' : 'link');
    
    // Create nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', 8)
      .attr('fill', d => d.isExternal ? '#cbd5e0' : '#90cdf4')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    // Add node labels
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .enter()
      .append('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text(d => d.name);
    
    // Set up simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
      
      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
    
    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    // Node click event
    node.on('click', (event, d) => {
      // Show node info in sidebar
      const nodeInfo = document.getElementById('node-info');
      
      // Find incoming and outgoing dependencies
      const outgoing = graphData.links.filter(link => link.source.id === d.id || link.source === d.id);
      const incoming = graphData.links.filter(link => link.target.id === d.id);
      
      // Generate the HTML content without nested template literals
      let outgoingItems = '';
      outgoing.forEach(link => {
        const targetNode = typeof link.target === 'object'
          ? link.target
          : graphData.nodes.find(n => n.id === link.target);
        if (targetNode) {
          outgoingItems += '<li>' + targetNode.name + (link.isCyclic ? ' <span style="color: red;">(circular)</span>' : '') + '</li>';
        }
      });
      
      let incomingItems = '';
      incoming.forEach(link => {
        const sourceNode = typeof link.source === 'object'
          ? link.source
          : graphData.nodes.find(n => n.id === link.source);
        if (sourceNode) {
          incomingItems += '<li>' + sourceNode.name + (link.isCyclic ? ' <span style="color: red;">(circular)</span>' : '') + '</li>';
        }
      });
      
      nodeInfo.innerHTML = 
        '<div>' +
          '<p><strong>Name:</strong> ' + d.name + '</p>' +
          '<p><strong>Path:</strong> ' + d.path + '</p>' +
          '<p><strong>Type:</strong> ' + d.type + '</p>' +
          '<p><strong>Dependencies (' + outgoing.length + '):</strong></p>' +
          '<ul>' + outgoingItems + '</ul>' +
          '<p><strong>Dependents (' + incoming.length + '):</strong></p>' +
          '<ul>' + incomingItems + '</ul>' +
        '</div>';
    });
    
    // Populate statistics
    const statsContent = document.getElementById('stats-content');
    const internalNodes = graphData.nodes.filter(n => !n.isExternal).length;
    const externalNodes = graphData.nodes.filter(n => n.isExternal).length;
    const cyclicLinks = graphData.links.filter(l => l.isCyclic).length;
    
    statsContent.innerHTML = 
      '<div>' +
        '<p><strong>Total Files:</strong> ' + internalNodes + '</p>' +
        '<p><strong>External Dependencies:</strong> ' + externalNodes + '</p>' +
        '<p><strong>Total Dependencies:</strong> ' + graphData.links.length + '</p>' +
        '<p><strong>Circular Dependencies:</strong> ' + cyclicLinks + '</p>' +
      '</div>';
    
    // Populate cycles list
    const cyclesList = document.getElementById('cycles-list');
    
    if (graphData.cycles && graphData.cycles.length > 0) {
      let cyclesHtml = '<ul>';
      graphData.cycles.forEach(cycle => {
        cyclesHtml += '<li class="cycle-item">' + cycle.join(' → ') + '</li>';
      });
      cyclesHtml += '</ul>';
      cyclesList.innerHTML = cyclesHtml;
    } else {
      cyclesList.innerHTML = '<p>No circular dependencies detected.</p>';
    }
    
    // Control buttons
    document.getElementById('zoom-in').addEventListener('click', () => {
      const transform = d3.zoomTransform(svg.node());
      svg.call(d3.zoom().transform, transform.scale(transform.k * 1.2));
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
      const transform = d3.zoomTransform(svg.node());
      svg.call(d3.zoom().transform, transform.scale(transform.k * 0.8));
    });
    
    document.getElementById('reset').addEventListener('click', () => {
      svg.call(d3.zoom().transform, d3.zoomIdentity);
    });
  </script>
</body>
</html>`;
}

/**
 * Save output to file
 */
function saveOutputToFile(content, format) {
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  let fileName;
  
  switch (format) {
    case 'dot':
      fileName = 'dependency-graph-' + timestamp + '.dot';
      break;
    case 'json':
      fileName = 'dependency-graph-' + timestamp + '.json';
      break;
    case 'html':
    default:
      fileName = 'dependency-graph-' + timestamp + '.html';
      break;
  }
  
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

/**
 * Display summary of results
 */
function displaySummary() {
  const totalFiles = fileNodes.size;
  const internalFiles = [...fileNodes.keys()].filter(f => f.startsWith(process.cwd())).length;
  const externalDeps = externalDependencies.size;
  
  console.log('\n===============================================');
  console.log('      DEPENDENCY GRAPH GENERATOR SUMMARY       ');
  console.log('===============================================\n');
  
  console.log('Total files analyzed: ' + internalFiles);
  console.log('External dependencies: ' + externalDeps);
  console.log('Total nodes in graph: ' + totalFiles);
  
  if (DETECT_CYCLES) {
    console.log('Circular dependencies detected: ' + circularDependencies.length);
    
    if (circularDependencies.length > 0 && VERBOSE) {
      console.log('\nCircular Dependencies:');
      circularDependencies.forEach((cycle, index) => {
        const cyclePaths = cycle.map(nodeId => {
          const filePath = [...fileNodes.entries()].find(([_, id]) => id === nodeId)?.[0] || '';
          return path.relative(process.cwd(), filePath);
        });
        console.log((index + 1) + '. ' + cyclePaths.join(' → '));
      });
    }
  }
}

/**
 * Generate GraphViz image using dot command
 */
async function generateGraphvizImage(dotContent) {
  try {
    const outputDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const dotPath = path.join(outputDir, 'dependency-graph-' + timestamp + '.dot');
    const pngPath = path.join(outputDir, 'dependency-graph-' + timestamp + '.png');
    
    // Save DOT file
    fs.writeFileSync(dotPath, dotContent);
    
    // Generate PNG using GraphViz
    console.log('Generating visualization image...');
    await execPromise('dot -Tpng "' + dotPath + '" -o "' + pngPath + '"');
    console.log('Image saved to: ' + pngPath);
    return pngPath;
  } catch (error) {
    console.error('Failed to generate GraphViz image:', error.message);
    console.log('Note: You need GraphViz installed to generate images. See https://graphviz.org/download/');
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Dependency Graph Generator - Analyzing ' + targetDir);
  
  // Process target directory
  const targetPath = path.resolve(process.cwd(), targetDir);
  
  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    
    if (stats.isDirectory()) {
      console.log('Processing directory: ' + targetPath);
      processDirectory(targetPath);
    } else if (stats.isFile()) {
      console.log('Processing file: ' + targetPath);
      processFile(targetPath);
    }
  } else {
    console.error('Target path does not exist: ' + targetPath);
    process.exit(1);
  }
  
  // Detect circular dependencies if needed
  if (DETECT_CYCLES) {
    console.log('Detecting circular dependencies...');
    detectCircularDependencies();
  }
  
  // Generate output
  console.log('Generating ' + outputFormat + ' output...');
  let outputContent;
  
  switch (outputFormat) {
    case 'dot':
      outputContent = generateDotFormat();
      break;
    case 'json':
      outputContent = generateJsonFormat();
      break;
    case 'html':
    default:
      outputContent = generateHtmlFormat();
      break;
  }
  
  // Save output
  const outputPath = saveOutputToFile(outputContent, outputFormat);
  console.log('Output saved to: ' + outputPath);
  
  // Generate GraphViz visualization if requested
  if (outputFormat === 'dot') {
    try {
      await generateGraphvizImage(outputContent);
    } catch (error) {
      console.error('Failed to generate visualization:', error.message);
    }
  }
  
  // Display summary
  displaySummary();
}

// Run the main function
main().catch(error => {
  console.error("Error running dependency graph generator:", error);
  process.exit(1);
});