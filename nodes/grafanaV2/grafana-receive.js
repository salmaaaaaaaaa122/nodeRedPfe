const express = require('express');

module.exports = function(RED) {
  function GrafanaReceiveNode(config) {
    RED.nodes.createNode(this, config);
    
    const node = this;
    
    // Configuration du nœud
    node.port = config.port || 1881;
    node.path = config.path || '/grafana-webhook';
    
    // Créer un serveur Express si nécessaire
    if (!RED.httpNode._grafanaWebhookServer) {
      RED.httpNode._grafanaWebhookServer = true;
      
      // Middleware pour parser JSON
      RED.httpNode.use(express.json({limit: '10mb'}));
      RED.httpNode.use(express.urlencoded({extended: true, limit: '10mb'}));
    }
    
    // Route pour recevoir les webhooks Grafana
    const webhookHandler = (req, res) => {
      try {
        const payload = req.body;
        
        // Vérifier si c'est une notification Grafana
        if (payload && (payload.alerts || payload.message || payload.title)) {
          
          const msg = {
            payload: payload,
            grafanaWebhook: {
              timestamp: new Date().toISOString(),
              source: 'grafana',
              type: payload.alerts ? 'alert' : 'notification'
            },
            req: req,
            res: res
          };
          
          // Parser les alertes si présentes
          if (payload.alerts && Array.isArray(payload.alerts)) {
            msg.alerts = payload.alerts.map(alert => ({
              status: alert.status,
              labels: alert.labels,
              annotations: alert.annotations,
              startsAt: alert.startsAt,
              endsAt: alert.endsAt,
              generatorURL: alert.generatorURL,
              fingerprint: alert.fingerprint
            }));
          }
          
          // Mettre à jour le status du nœud
          node.status({
            fill: payload.alerts && payload.alerts.some(a => a.status === 'firing') ? "red" : "green",
            shape: "dot",
            text: `Reçu ${payload.alerts ? payload.alerts.length + ' alerte(s)' : 'notification'}`
          });
          
          // Envoyer le message
          node.send(msg);
          
          // Répondre à Grafana
          res.status(200).json({
            status: 'received',
            timestamp: new Date().toISOString(),
            processed: true
          });
          
          // Effacer le status après 5 secondes
          setTimeout(() => {
            node.status({});
          }, 5000);
          
        } else {
          res.status(400).json({
            error: 'Invalid Grafana webhook payload',
            received: payload
          });
        }
        
      } catch (error) {
        node.error(`Erreur traitement webhook: ${error.message}`);
        node.status({fill: "red", shape: "ring", text: "Erreur"});
        
        res.status(500).json({
          error: 'Internal server error',
          message: error.message
        });
        
        setTimeout(() => {
          node.status({});
        }, 5000);
      }
    };
    
    // Enregistrer la route
    RED.httpNode.post(node.path, webhookHandler);
    
    node.status({fill: "blue", shape: "dot", text: `Écoute sur ${node.path}`});
    
    node.on('close', function() {
      // Nettoyer la route si nécessaire
      try {
        // Note: Express ne permet pas de supprimer facilement les routes
        // En production, il faudrait gérer cela différemment
      } catch (error) {
        node.warn('Erreur nettoyage route: ' + error.message);
      }
    });
  }
  
  RED.nodes.registerType("grafana-receive", GrafanaReceiveNode);
};