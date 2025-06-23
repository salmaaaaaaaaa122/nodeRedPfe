
module.exports = function(RED) {
  const { exec } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const { v4: uuidv4 } = require('uuid');
  
  function PythonContainerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Configuration du nœud
    node.pythonLibraries = config.pythonLibraries || '';
    node.pythonCode = config.pythonCode || '';
    node.containerImage = config.containerImage || 'python:3.9-slim';
    node.timeout = parseInt(config.timeout) || 30000;
    
    node.on('input', function(msg) {
      node.status({fill:"blue", shape:"dot", text:"Préparation..."});
      
      // Créer un ID unique pour cette exécution
      const executionId = uuidv4();
      const workDir = path.join('/tmp', `python-exec-${executionId}`);
      
      try {
        // Créer le répertoire de travail
        if (!fs.existsSync(workDir)) {
          fs.mkdirSync(workDir, { recursive: true });
        }
        
        // Préparer les données d'entrée
        const inputData = {
          payload: msg.payload,
          topic: msg.topic,
          timestamp: new Date().toISOString(),
          previousResult: msg.payload // Résultat du nœud précédent
        };
        
        // Créer le fichier input.json avec les données
        fs.writeFileSync(
          path.join(workDir, 'input.json'),
          JSON.stringify(inputData, null, 2)
        );
        
        // Créer le fichier requirements.txt si des bibliothèques sont spécifiées
        let requirementsContent = '';
        if (node.pythonLibraries.trim()) {
          requirementsContent = node.pythonLibraries.split(',')
          .map(lib => lib.trim())
          .filter(lib => lib.length > 0)
          .join('\n');
        }
        fs.writeFileSync(path.join(workDir, 'requirements.txt'), requirementsContent);
        
        // Créer le script Python principal
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
        
        fs.writeFileSync(path.join(workDir, 'script.py'), pythonScript);
        
        // Créer le Dockerfile
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
        fs.writeFileSync(path.join(workDir, 'Dockerfile'), dockerfile);
        
        node.status({fill:"yellow", shape:"dot", text:"Construction du conteneur..."});
        
        // Construire l'image Docker
        const buildCommand = `cd ${workDir} && docker build -t python-exec-${executionId} .`;
        
        exec(buildCommand, (buildError, buildStdout, buildStderr) => {
          if (buildError) {
            node.error(`Erreur de construction: ${buildError.message}`);
            node.status({fill:"red", shape:"dot", text:"Erreur de construction"});
            cleanup(workDir, executionId);
            return;
          }
          
          node.status({fill:"yellow", shape:"dot", text:"Exécution..."});
          
          // Exécuter le conteneur
          const runCommand = `docker run --rm -v ${workDir}:/app python-exec-${executionId}`;
          
          const execProcess = exec(runCommand, { timeout: node.timeout }, (runError, runStdout, runStderr) => {
            // Nettoyer l'image Docker
            exec(`docker rmi python-exec-${executionId}`, () => {});
            
            if (runError) {
              node.error(`Erreur d'exécution: ${runError.message}`);
              node.status({fill:"red", shape:"dot", text:"Erreur d'exécution"});
              cleanup(workDir, executionId);
              return;
            }
            
            try {
              // Lire le résultat
              const outputPath = path.join(workDir, 'output.json');
              if (fs.existsSync(outputPath)) {
                const outputData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
                
                if (outputData.success) {
                  msg.payload = outputData.payload;
                  msg.topic = outputData.topic;
                  msg.pythonOutput = runStdout;
                  msg.pythonErrors = runStderr;
                  
                  node.status({fill:"green", shape:"dot", text:"Succès"});
                  node.send(msg);
                } else {
                  node.error(`Erreur Python: ${outputData.error}`);
                  node.status({fill:"red", shape:"dot", text:"Erreur Python"});
                }
              } else {
                node.error("Fichier de sortie non trouvé");
                node.status({fill:"red", shape:"dot", text:"Pas de sortie"});
              }
            } catch (parseError) {
              node.error(`Erreur de parsing: ${parseError.message}`);
              node.status({fill:"red", shape:"dot", text:"Erreur de parsing"});
            }
            
            cleanup(workDir, executionId);
          });
          
          // Gérer le timeout
          setTimeout(() => {
            if (!execProcess.killed) {
              execProcess.kill();
              node.error("Timeout d'exécution");
              node.status({fill:"red", shape:"dot", text:"Timeout"});
              cleanup(workDir, executionId);
            }
          }, node.timeout);
        });
        
      } catch (error) {
        node.error(`Erreur de préparation: ${error.message}`);
        node.status({fill:"red", shape:"dot", text:"Erreur de préparation"});
        cleanup(workDir, executionId);
      }
    });
    
    // Fonction de nettoyage
    function cleanup(workDir, executionId) {
      try {
        if (fs.existsSync(workDir)) {
          fs.rmSync(workDir, { recursive: true, force: true });
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