module.exports = function(RED) {
  "use strict";
  
  const axios = require('axios');
  
  function ClaudeAINode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Configuration de base
    node.name = config.name;
    node.apiKey = config.apiKey;
    node.modelName = config.modelName || 'claude-3-7-sonnet-20250219';
    node.maxTokens = parseInt(config.maxTokens) || 2048;
    node.temperature = parseFloat(config.temperature) || 0.7;
    node.systemPrompt = config.systemPrompt || '';
    
    // Vérifier la présence de l'API key au démarrage
    if (!node.apiKey) {
      node.status({fill:"yellow", shape:"ring", text:"Clé API requise"});
    } else {
      node.status({});
    }
    
    // Traitement des messages entrants
    node.on('input', function(msg) {
      // Vérifier l'API key
      if (!node.apiKey) {
        node.error("Clé API Claude manquante", msg);
        node.status({fill:"red", shape:"ring", text:"Clé API manquante"});
        return;
      }
      console.log("msg",msg)
      // Récupérer le prompt
      let prompt = '';
      if (typeof msg.payload === 'string') {
        prompt = msg.payload;
      } else if (typeof msg.payload === 'object' && msg.payload !== null) {
        prompt = msg.payload.prompt || msg.payload.message || '';
      }
      
      if (!prompt) {
        node.error("Aucun prompt trouvé dans msg.payload", msg);
        node.status({fill:"red", shape:"ring", text:"Prompt manquant"});
        return;
      }
      
      // Préparer la requête à l'API Claude
      const requestData = {
        model: node.modelName,
        max_tokens: node.maxTokens,
        temperature: node.temperature,
        messages: [
          { role: "user", content: prompt }
        ]
      };
      
      // Ajouter le prompt système si présent
      if (node.systemPrompt) {
        requestData.system = node.systemPrompt;
      }
      
      // Envoyer la requête
      node.status({fill:"blue", shape:"dot", text:"Requête en cours..."});
      
      axios({
        method: 'post',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': node.apiKey,
          'anthropic-version': '2023-06-01'
        },
        data: requestData,
        timeout: 60000
      })
      .then(function(response) {
        // Traiter la réponse
        if (response.data && response.data.content && Array.isArray(response.data.content)) {
          // Extraire le texte de la réponse
          const claudeResponse = response.data.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('');
          
          // Mettre à jour le message
          msg.payload = {
            prompt: prompt,
            response: claudeResponse,
            full_response: response.data
          };
          
          // Mettre à jour le statut
          node.status({fill:"green", shape:"dot", text:"Réponse reçue"});
          
          // Envoyer le message
          node.send(msg);
        } else {
          throw new Error("Format de réponse inattendu");
        }
      })
      .catch(function(error) {
        // Gérer les erreurs
        let errorMessage = error.message;
        if (error.response && error.response.data && error.response.data.error) {
          errorMessage = error.response.data.error.message || errorMessage;
        }
        
        node.error("Erreur API Claude: " + errorMessage, msg);
        msg.payload = {
          error: errorMessage,
          status: error.response ? error.response.status : undefined,
          prompt: prompt
        };
        
        node.status({fill:"red", shape:"ring", text:"Erreur"});
        node.send(msg);
      });
    });
    
    // Nettoyage lors de la fermeture
    node.on('close', function() {
      node.status({});
    });
  }
  
  // Enregistrer le type de nœud
  RED.nodes.registerType("claudeint", ClaudeAINode);
};