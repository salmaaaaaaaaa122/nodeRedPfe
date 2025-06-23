/**
 * Node-RED node pour l'intégration avec Claude AI d'Anthropic
 * Ce module permet d'envoyer des prompts à l'API Claude et de récupérer les réponses
 * API Reference: https://docs.anthropic.com/claude/reference/
 */
module.exports = function(RED) {
  // Dépendances
  const axios = require('axios');
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const ANTHROPIC_API_VERSION = '2023-06-01';
  
  /**
   * Node principal pour Claude AI
   * @param {Object} config - Configuration du nœud
   */
  function ClaudeAINode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Configuration avec valeurs par défaut
    this.apiKey = config.apiKey;  // Clé API requise
    this.modelName = config.modelName || 'claude-3-7-sonnet-20250219';
    this.maxTokens = config.maxTokens || 2048;
    this.temperature = config.temperature || 0.7;
    
    // Validation de la configuration
    if (!this.apiKey) {
      node.status({fill:"yellow", shape:"ring", text:"Clé API manquante"});
    }
    
    /**
     * Gestionnaire principal d'entrée pour le nœud
     * Traite les messages entrants et envoie des requêtes à l'API Claude
     */
    this.on('input', async function(msg) {
      // Logging interne pour le débogage
      node.trace("Message d'entrée reçu");
      
      // Validation de l'API key
      if (!node.apiKey) {
        node.error("Clé API Claude manquante", msg);
        node.status({fill:"red", shape:"ring", text:"Clé API manquante"});
        return;
      }
      
      // Extraction du prompt - supporte à la fois les formats string et {prompt: string}
      let prompt;
      
      if (typeof msg.payload === 'string') {
        prompt = msg.payload;
      } else if (typeof msg.payload === 'object') {
        prompt = msg.payload.prompt || (typeof msg.payload.message === 'string' ? msg.payload.message : null);
      }
      
      if (!prompt) {
        node.error("Aucun prompt valide trouvé dans msg.payload", msg);
        node.status({fill:"red", shape:"ring", text:"Aucun prompt"});
        return;
      }
      
      // Récupération des options avancées si présentes dans le message
      const options = msg.options || {};
      
      // Construction du payload de la requête selon la spécification de l'API
      const requestData = {
        model: options.model || node.modelName,
        max_tokens: parseInt(options.maxTokens || node.maxTokens),
        temperature: parseFloat(options.temperature || node.temperature),
        messages: [
          { role: "user", content: prompt }
        ]
      };
      
      // Support du contexte de conversation (historique des messages)
      if (Array.isArray(msg.conversation) && msg.conversation.length > 0) {
        requestData.messages = [
          ...msg.conversation,
          { role: "user", content: prompt }
        ];
      }
      
      // Support des messages système (instructions contextuelles pour Claude)
      const systemPrompt = options.systemPrompt || config.systemPrompt;
      if (systemPrompt) {
        requestData.system = systemPrompt;
      }
      
      // Support des paramètres avancés de l'API
      if (options.topK) requestData.top_k = options.topK;
      if (options.topP) requestData.top_p = options.topP;
      if (options.stream === true) requestData.stream = true;
      
      // Logging de débogage pour les développeurs
      node.debug("Requête à l'API Claude:");
      node.debug(JSON.stringify(requestData, null, 2));
      
      // Mise à jour du statut visuel
      node.status({fill:"blue", shape:"dot", text:"Requête en cours..."});
      
      // Mesure du temps de réponse
      const startTime = Date.now();
      
      try {
        // Préparation des headers pour l'API
        const headers = {
          'Content-Type': 'application/json',
          'x-api-key': node.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION
        };
        
        // Gestion du streaming si activé
        if (requestData.stream === true) {
          // TODO: Implémenter la logique de streaming avec EventSource
          // Pour l'instant, désactiver le streaming car non implémenté
          delete requestData.stream;
          node.warn("Streaming non implémenté, utilisation de requête standard");
        }
        
        // Envoi de la requête à l'API Claude
        const response = await axios({
          method: 'post',
          url: ANTHROPIC_API_URL,
          headers: headers,
          data: requestData,
          timeout: options.timeout || 60000 // Timeout par défaut à 60s, configurable
        });
        
        // Calcul du temps de réponse
        const responseTime = Date.now() - startTime;
        
        // Traitement de la réponse
        if (response.data && response.data.content && Array.isArray(response.data.content)) {
          // Extraction du contenu de la réponse
          // Note: l'API renvoie un tableau de blocs de contenu, généralement avec un seul élément texte
          const claudeResponse = response.data.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('');
          
          // Construction de l'objet de réponse enrichi
          const responseObj = {
            prompt: prompt,
            response: claudeResponse,
            full_response: response.data,
            metadata: {
              model: response.data.model,
              usage: response.data.usage,
              responseTime: responseTime,
              id: response.data.id
            }
          };
          
          // Conservation du contexte de la conversation pour les appels futurs
          if (options.maintainConversation === true) {
            // Mise à jour du contexte de conversation pour usage futur
            responseObj.conversation = [
              ...(Array.isArray(msg.conversation) ? msg.conversation : []),
              { role: "user", content: prompt },
              { role: "assistant", content: claudeResponse }
            ];
          }
          
          // Mise à jour du message de sortie
          msg.payload = responseObj;
          
          // Envoi de la réponse et mise à jour du statut
          node.send(msg);
          node.status({
            fill: "green",
            shape: "dot",
            text: `Réponse en ${Math.round(responseTime/1000)}s - ${response.data.usage?.output_tokens || '?'} tokens`
          });
          
          // Statistiques internes
          node.trace(`Réponse reçue en ${responseTime}ms, tokens: ${JSON.stringify(response.data.usage)}`);
        } else {
          throw new Error("Format de réponse inattendu de l'API Claude");
        }
      } catch (error) {
        // Gestion avancée des erreurs
        let errorMessage = error.message;
        let statusCode = error.response?.status || 0;
        
        // Extraction des détails d'erreur de l'API si disponibles
        if (error.response?.data?.error) {
          errorMessage = `${error.response.data.error.type}: ${error.response.data.error.message}`;
        }
        
        // Logging détaillé de l'erreur pour débogage
        node.error(`Erreur d'API Claude [${statusCode}]: ${errorMessage}`, msg);
        if (error.response?.data) {
          node.debug("Détails de l'erreur: " + JSON.stringify(error.response.data, null, 2));
        }
        
        // Structure cohérente des erreurs dans la réponse
        msg.payload = {
          error: errorMessage,
          status: statusCode,
          details: error.response?.data || null,
          prompt: prompt
        };
        
        // Envoi du message d'erreur et mise à jour du statut
        node.send(msg);
        node.status({fill:"red", shape:"ring", text:`Erreur ${statusCode}: ${errorMessage.substring(0, 30)}`});
      }
    });
  }
  
  /**
   * Méthode appelée lorsque le nœud est fermé/supprimé
   * Nettoie les ressources, annule les requêtes en cours, etc.
   */
  ClaudeAINode.prototype.close = function() {
    // Nettoyage des ressources si nécessaire
    this.status({});
    this.debug("Nœud Claude AI fermé");
  };
  
  /**
   * Enregistrement du type de nœud dans Node-RED
   */
  RED.nodes.registerType("claude-ai", ClaudeAINode, {
    defaults: {
      name: { value: "" },
      apiKey: {
        value: "",
        required: true,
        type: "password",
        validate: (v) => v && v.length > 10 // Validation basique de la clé API
      },
      modelName: {
        value: "claude-3-7-sonnet-20250219",
        validate: (v) => /^claude-\d+(-[a-z]+)+(-\d+)?$/.test(v) // Format de modèle valide
      },
      maxTokens: {
        value: 2048,
        validate: RED.validators.number(),
      },
      temperature: {
        value: 0.7,
        validate: RED.validators.number(),
      },
      systemPrompt: { value: "" }
    },
    // Métadonnées du nœud
    category: "AI",
    color: "#5F4B8B", // Couleur violette similaire à celle d'Anthropic
    icon: "font-awesome/fa-brain", // Icône plus adaptée à un modèle d'IA
    align: "right", // Alignement dans l'éditeur de flow
    inputs: 1,     // Nombre d'entrées
    outputs: 1,    // Nombre de sorties
    inputLabels: ["prompt"],
    outputLabels: ["réponse"],
    // Méthodes d'affichage
    label: function() {
      return this.name || "Claude AI";
    },
    labelStyle: function() {
      return this.name ? "node_label_italic" : "";
    },
    paletteLabel: "Claude AI",
    oneditprepare: function() {
      // Code JavaScript exécuté lors de l'ouverture de l'éditeur du nœud
      // Permet d'ajouter des comportements dynamiques à l'interface
      $("#node-input-temperature").on("change", function() {
        // Met à jour un indicateur visuel de la température
        const temp = $(this).val();
        const tempIndicator = $("#temperature-indicator");
        if (temp < 0.3) {
          tempIndicator.text("(précis)");
        } else if (temp > 0.7) {
          tempIndicator.text("(créatif)");
        } else {
          tempIndicator.text("(équilibré)");
        }
      });
    }
  });
  
  /**
   * Enregistrement des routes HTTP pour l'aide en ligne
   */
  RED.httpAdmin.get("/claude-models", RED.auth.needsPermission("claude-ai.read"), function(req, res) {
    // Renvoie la liste des modèles disponibles pour l'interface utilisateur
    const models = [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet (Recommandé)", capabilities: "Raisonnement avancé" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", capabilities: "Haute précision" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", capabilities: "Équilibré" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", capabilities: "Rapide" }
    ];
    res.json(models);
  });
}