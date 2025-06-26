module.exports = function(RED) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const fs = require('fs').promises; // Version asynchrone de fs
  const fsSync = require('fs'); // Pour les vérifications synchrones
  const path = require('path');
  const { v4: uuidv4 } = require('uuid');
  
  // Promisifier exec pour utilisation async/await
  const execAsync = promisify(exec);
  
  function PythonContainerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Configuration du nœud (votre structure originale)
    node.pythonLibraries = config.pythonLibraries || '';
    node.pythonCode = config.pythonCode || '';
    node.containerImage = config.containerImage || 'python:3.9-slim';
    node.timeout = parseInt(config.timeout) || 30000;
    
    node.on('input', async function(msg) {
      const executionId = uuidv4();
      const workDir = path.join('/tmp', `python-exec-${executionId}`);
      
      node.status({fill:"blue", shape:"dot", text:"Préparation..."});
      
      try {
        // Étape 1: Préparation asynchrone
        await prepareExecution(workDir, msg, node, executionId);
        
        // Étape 2: Construction du conteneur (asynchrone)
        await buildContainer(workDir, executionId, node);
        
        // Étape 3: Exécution du conteneur (asynchrone)
        const result = await runContainer(workDir, executionId, node);
        
        // Étape 4: Traitement du résultat
        await processResult(workDir, result, msg, node);
        
        // Étape 5: Nettoyage
        await cleanup(workDir, executionId);
        
      } catch (error) {
        node.error(`Erreur d'exécution: ${error.message}`);
        node.status({fill:"red", shape:"dot", text:"Erreur"});
        await cleanup(workDir, executionId);
      }
    });
    
    // Fonction de préparation asynchrone
    async function prepareExecution(workDir, msg, node, executionId) {
      // Créer le répertoire de travail
      if (!fsSync.existsSync(workDir)) {
        await fs.mkdir(workDir, { recursive: true });
      }
      
      // Préparer les données d'entrée
      const inputData = {
        payload: msg.payload,
        topic: msg.topic,
        timestamp: new Date().toISOString(),
        previousResult: msg.payload
      };
      
      // Écrire les fichiers de manière asynchrone
      await fs.writeFile(
        path.join(workDir, 'input.json'),
        JSON.stringify(inputData, null, 2)
      );
      
      // Créer requirements.txt
      let requirementsContent = '';
      if (node.pythonLibraries.trim()) {
        requirementsContent = node.pythonLibraries.split(',')
        .map(lib => lib.trim())
        .filter(lib => lib.length > 0)
        .join('\n');
      }
      await fs.writeFile(path.join(workDir, 'requirements.txt'), requirementsContent);
      
      // Créer le script Python (votre version originale)
      const pythonScript = `
import json
import sys
import os

# Charger les données d'entrée
try:
    with open('/app/input.json', 'r') as f:
        input_data = json.load(f)
    
    # Rendre les données disponibles comme variables
    payload = input_data.get('payload')
    topic = input_data.get('topic')
    timestamp = input_data.get('timestamp')
    previous_result = input_data.get('previousResult')
    
    print(f"Données reçues: {input_data}", file=sys.stderr)
    
except Exception as e:
    print(f"Erreur lors du chargement des données: {e}", file=sys.stderr)
    payload = None
    topic = None
    timestamp = None
    previous_result = None

# Code utilisateur
try:
${node.pythonCode.split('\n').map(line => '    ' + line).join('\n')}
    
    # Si le code utilisateur n'a pas défini 'result', utiliser payload
    if 'result' not in locals():
        result = payload
    
    # Sauvegarder le résultat
    output_data = {
        'payload': result,
        'topic': topic,
        'timestamp': timestamp,
        'success': True
    }
    
    with open('/app/output.json', 'w') as f:
        json.dump(output_data, f, default=str)
        
    print("Exécution terminée avec succès", file=sys.stderr)
    
except Exception as e:
    print(f"Erreur dans le code utilisateur: {e}", file=sys.stderr)
    error_data = {
        'payload': None,
        'error': str(e),
        'success': False
    }
    
    with open('/app/output.json', 'w') as f:
        json.dump(error_data, f)
    
    sys.exit(1)
`;
      
      await fs.writeFile(path.join(workDir, 'script.py'), pythonScript);
      
      // Créer le Dockerfile (votre version originale)
      const dockerfile = `
FROM ${node.containerImage}

WORKDIR /app

# Copier les fichiers
COPY requirements.txt .
COPY script.py .
COPY input.json .

# Installer les dépendances Python
RUN if [ -s requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Exécuter le script
CMD ["python", "script.py"]
`;
      await fs.writeFile(path.join(workDir, 'Dockerfile'), dockerfile);
    }
    
    // Fonction de construction asynchrone
    async function buildContainer(workDir, executionId, node) {
      node.status({fill:"yellow", shape:"dot", text:"Construction du conteneur..."});
      
      const buildCommand = `cd ${workDir} && docker build -t python-exec-${executionId} .`;
      
      try {
        const { stdout, stderr } = await execAsync(buildCommand, {
          timeout: node.timeout
        });
        
        console.log(`Build stdout: ${stdout}`);
        if (stderr) console.log(`Build stderr: ${stderr}`);
        
      } catch (error) {
        throw new Error(`Erreur de construction: ${error.message}`);
      }
    }
    
    // Fonction d'exécution asynchrone
    async function runContainer(workDir, executionId, node) {
      node.status({fill:"yellow", shape:"dot", text:"Exécution..."});
      
      const runCommand = `docker run --rm -v ${workDir}:/app python-exec-${executionId}`;
      
      try {
        const { stdout, stderr } = await execAsync(runCommand, {
          timeout: node.timeout
        });
        
        // Nettoyer l'image Docker de manière asynchrone (non bloquant)
        execAsync(`docker rmi python-exec-${executionId}`).catch(() => {
          // Ignorer les erreurs de nettoyage d'image
        });
        
        return { stdout, stderr, success: true };
        
      } catch (error) {
        // Nettoyer l'image même en cas d'erreur
        execAsync(`docker rmi python-exec-${executionId}`).catch(() => {});
        throw new Error(`Erreur d'exécution: ${error.message}`);
      }
    }
    
    // Fonction de traitement du résultat asynchrone
    async function processResult(workDir, runResult, msg, node) {
      try {
        const outputPath = path.join(workDir, 'output.json');
        
        // Vérifier si le fichier existe
        if (!fsSync.existsSync(outputPath)) {
          throw new Error("Fichier de sortie non trouvé");
        }
        
        // Lire le résultat de manière asynchrone
        const outputContent = await fs.readFile(outputPath, 'utf8');
        const outputData = JSON.parse(outputContent);
        
        if (outputData.success) {
          // Succès: mettre à jour le message et l'envoyer
          msg.payload = outputData.payload;
          msg.topic = outputData.topic;
          msg.pythonOutput = runResult.stdout;
          msg.pythonErrors = runResult.stderr;
          
          node.status({fill:"green", shape:"dot", text:"Succès"});
          node.send(msg); // Envoyer au nœud suivant
          
        } else {
          throw new Error(`Erreur Python: ${outputData.error}`);
        }
        
      } catch (parseError) {
        throw new Error(`Erreur de parsing: ${parseError.message}`);
      }
    }
    
    // Fonction de nettoyage asynchrone
    async function cleanup(workDir, executionId) {
      return;
      try {
        if (fsSync.existsSync(workDir)) {
          await fs.rmdir(workDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error(`Erreur de nettoyage: ${cleanupError.message}`);
      }
    }
    
    node.on('close', function() {
      node.status({});
    });
  }
  
  RED.nodes.registerType("python", PythonContainerNode);
};