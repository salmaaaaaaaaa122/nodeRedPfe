// Fichier: node-red-contrib-grafana-live/grafana-live-out.js

module.exports = function(RED) {
  "use strict";
  const WebSocket = require('ws');
  
  function GrafanaLiveOutNode(config) {
    // Création du nœud
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Récupérer la configuration
    node.grafanaUrl = config.grafanaUrl;
    node.apiKey = config.apiKey;
    node.channel = config.channel || "custom/channel";
    node.topic = config.topic || "default";
    
    // Variables d'état
    node.socket = null;
    node.connected = false;
    node.reconnectTimeout = null;
    node.reconnectAttempts = 0;
    node.MAX_RECONNECT_ATTEMPTS = 10;
    node.RECONNECT_INTERVAL = 5000;
    
    // Initialiser la connexion
    connectToGrafana();
    
    // Fonction de connexion à Grafana
    function connectToGrafana() {
      if (node.socket) {
        node.socket.close();
        node.socket = null;
      }
      
      if (node.reconnectAttempts >= node.MAX_RECONNECT_ATTEMPTS) {
        node.error("Nombre maximum de tentatives de reconnexion atteint");
        node.status({fill:"red", shape:"dot", text:"erreur de connexion"});
        return;
      }
      
      // Construire l'URL
      let wsUrl = node.grafanaUrl.replace(/^http/i, 'ws');
      if (!wsUrl.endsWith('/')) wsUrl += '/';
      wsUrl += `api/live/push/${node.channel}`;
      
      // Créer la connexion WebSocket
      try {
        node.status({fill:"yellow", shape:"ring", text:"connexion..."});
        
        const headers = {
          "Authorization": `Bearer ${node.apiKey}`
        };
        
        node.socket = new WebSocket(wsUrl, { headers });
        
        node.socket.on('open', () => {
          node.connected = true;
          node.reconnectAttempts = 0;
          node.status({fill:"green", shape:"dot", text:"connecté"});
          node.log(`Connecté au canal Grafana: ${node.channel}`);
        });
        
        node.socket.on('close', (code, reason) => {
          node.connected = false;
          node.status({fill:"red", shape:"ring", text:"déconnecté"});
          node.log(`Déconnecté de Grafana: ${code} - ${reason}`);
          
          // Tenter une reconnexion
          if (!node.reconnectTimeout) {
            node.reconnectAttempts++;
            node.reconnectTimeout = setTimeout(() => {
              node.reconnectTimeout = null;
              connectToGrafana();
            }, node.RECONNECT_INTERVAL);
          }
        });
        
        node.socket.on('error', (err) => {
          node.error(`Erreur WebSocket: ${err.message}`);
          node.status({fill:"red", shape:"dot", text:"erreur"});
        });
      } catch (e) {
        node.error(`Erreur lors de la création de la connexion WebSocket: ${e.message}`);
        node.status({fill:"red", shape:"dot", text:"erreur de configuration"});
      }
    }
    
    // Traitement des messages entrants
    node.on('input', function(msg, send, done) {
      if (!node.connected) {
        node.warn("Non connecté à Grafana");
        if (done) done("Non connecté à Grafana");
        return;
      }
      
      try {
        let payload = msg.payload;
        
        // Si le payload n'est pas un objet, le transformer en objet
        if (typeof payload !== 'object' || payload === null) {
          payload = { value: payload };
        }
        
        // Ajouter le timestamp s'il n'existe pas
        if (!payload.timestamp) {
          payload.timestamp = Date.now();
        }
        
        // Créer le message complet à envoyer
        const grafanaMessage = {
          topic: msg.topic || node.topic,
          data: payload
        };
        
        // Envoyer le message
        node.socket.send(JSON.stringify(grafanaMessage));
        
        if (done) {
          done();
        }
      } catch (err) {
        if (done) {
          done(err);
        } else {
          node.error(err, msg);
        }
      }
    });
    
    // Nettoyage lors de la fermeture du nœud
    node.on('close', function(done) {
      if (node.reconnectTimeout) {
        clearTimeout(node.reconnectTimeout);
        node.reconnectTimeout = null;
      }
      
      if (node.socket) {
        node.socket.close();
        node.socket = null;
      }
      
      if (done) {
        done();
      }
    });
  }
  
  RED.nodes.registerType("grafana-live-out", GrafanaLiveOutNode);
  
  // Nœud pour recevoir des messages depuis Grafana
  function GrafanaLiveInNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Récupérer la configuration
    node.grafanaUrl = config.grafanaUrl;
    node.apiKey = config.apiKey;
    node.channel = config.channel || "grafana/dashboard/uid";
    
    // Variables d'état
    node.socket = null;
    node.connected = false;
    node.reconnectTimeout = null;
    node.reconnectAttempts = 0;
    node.MAX_RECONNECT_ATTEMPTS = 10;
    node.RECONNECT_INTERVAL = 5000;
    
    // Initialiser la connexion
    connectToGrafana();
    
    // Fonction de connexion à Grafana
    function connectToGrafana() {
      if (node.socket) {
        node.socket.close();
        node.socket = null;
      }
      
      if (node.reconnectAttempts >= node.MAX_RECONNECT_ATTEMPTS) {
        node.error("Nombre maximum de tentatives de reconnexion atteint");
        node.status({fill:"red", shape:"dot", text:"erreur de connexion"});
        return;
      }
      
      // Construire l'URL
      let wsUrl = node.grafanaUrl.replace(/^http/i, 'ws');
      if (!wsUrl.endsWith('/')) wsUrl += '/';
      wsUrl += `api/live/ws`;
      
      if (node.apiKey) {
        wsUrl += `?Authorization=Bearer ${node.apiKey}`;
      }
      
      // Créer la connexion WebSocket
      try {
        node.status({fill:"yellow", shape:"ring", text:"connexion..."});
        
        node.socket = new WebSocket(wsUrl);
        
        node.socket.on('open', () => {
          node.connected = true;
          node.reconnectAttempts = 0;
          node.status({fill:"green", shape:"dot", text:"connecté"});
          node.log(`Connecté à Grafana Live`);
          
          // S'abonner au canal souhaité
          const subscribeMsg = {
            action: 'subscribe',
            path: node.channel
          };
          
          node.socket.send(JSON.stringify(subscribeMsg));
        });
        
        node.socket.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            
            // Créer le message Node-RED
            const msg = {
              topic: node.channel,
              payload: message
            };
            
            // Envoyer le message
            node.send(msg);
          } catch (err) {
            node.error(`Erreur de parsing des données: ${err.message}`);
          }
        });
        
        node.socket.on('close', (code, reason) => {
          node.connected = false;
          node.status({fill:"red", shape:"ring", text:"déconnecté"});
          node.log(`Déconnecté de Grafana: ${code} - ${reason}`);
          
          // Tenter une reconnexion
          if (!node.reconnectTimeout) {
            node.reconnectAttempts++;
            node.reconnectTimeout = setTimeout(() => {
              node.reconnectTimeout = null;
              connectToGrafana();
            }, node.RECONNECT_INTERVAL);
          }
        });
        
        node.socket.on('error', (err) => {
          node.error(`Erreur WebSocket: ${err.message}`);
          node.status({fill:"red", shape:"dot", text:"erreur"});
        });
      } catch (e) {
        node.error(`Erreur lors de la création de la connexion WebSocket: ${e.message}`);
        node.status({fill:"red", shape:"dot", text:"erreur de configuration"});
      }
    }
    
    // Nettoyage lors de la fermeture du nœud
    node.on('close', function(done) {
      if (node.reconnectTimeout) {
        clearTimeout(node.reconnectTimeout);
        node.reconnectTimeout = null;
      }
      
      if (node.socket) {
        // Se désabonner avant de fermer
        if (node.connected) {
          try {
            const unsubscribeMsg = {
              action: 'unsubscribe',
              path: node.channel
            };
            node.socket.send(JSON.stringify(unsubscribeMsg));
          } catch (e) {
            // Ignorer les erreurs lors de la déconnexion
          }
        }
        
        node.socket.close();
        node.socket = null;
      }
      
      if (done) {
        done();
      }
    });
  }
  
  RED.nodes.registerType("grafana-live-in", GrafanaLiveInNode);
};